import { EaObservableAdapter } from "../ea/EaObservableAdapter.js";
import {
  SBC_SUBMIT_ERROR_CODES,
  parseSbcSubmitResponse,
  sbcSubmitFailure
} from "./SbcSubmitResults.js";
import { guardianOrFailClosed } from "../../guardian/mode.js";

/**
 * Minimal observable-compatible rejection used when submit preconditions fail.
 */
class RejectedSubmitObservable {
  /** @param {Record<string, unknown>} response */
  constructor(response) {
    this.response = response;
  }

  /**
   * @param {object} context
   * @param {(sender: unknown, response: unknown) => void} callback
   */
  observe(context, callback) {
    queueMicrotask(() => callback(this, this.response));
    return this;
  }

  unobserve() {}
}

/**
 * Keeps the EA observable contract while Guardian waits for confirmation.
 * FSU callers attach observers synchronously, but the original EA method must
 * not be invoked until the guarded promise resolves.
 */
class GuardedSubmitObservable {
  /**
   * @param {Promise<any>} guardPromise
   * @param {{ onDiagnostic?: (result: unknown) => void }} [options]
   */
  constructor(guardPromise, { onDiagnostic = () => {} } = {}) {
    /** @type {Set<{ context: unknown, callback: (sender: unknown, response: unknown) => void }>} */
    this.observers = new Set();
    /** @type {Record<string, any> | null} */
    this.inner = null;
    /** @type {Record<string, any> | null} */
    this.failure = null;
    /** @type {Promise<any>} */
    this.guardPromise = Promise.resolve(guardPromise).then((out) => {
      const observable = out && out.result;
      if (!isRecord(observable) || typeof observable.observe !== "function") {
        throw new Error("SBC_SUBMIT_GUARD_RESULT_INVALID");
      }
      this.inner = /** @type {any} */ (observable);
      for (const observer of this.observers) {
        this._observeInner(observer);
      }
      this.observers.clear();
      return out;
    });
    // An EA caller may only use .observe() and never await the thenable. Keep
    // rejected Guardian promises handled while preserving rejection for code
    // that does use await/catch.
    this.guardPromise.catch((error) => {
      this.failure = this._failureResponse(error);
      onDiagnostic(this.failure);
      for (const observer of this.observers) {
        queueMicrotask(() => observer.callback(this, this.failure));
      }
      this.observers.clear();
    });
  }

  /** @param {unknown} error */
  _failureResponse(error) {
    const source = /** @type {any} */ (error);
    const message = source?.message || "Guardian confirmation failed.";
    const code = source?.code || String(message).split(":", 1)[0];
    return {
      success: false,
      status: 400,
      error: { code, message }
    };
  }

  /** @param {{ context: unknown, callback: (sender: unknown, response: unknown) => void }} observer */
  _observeInner(observer) {
    try {
      const inner = this.inner;
      if (!inner) throw new Error("SBC_SUBMIT_GUARD_RESULT_INVALID");
      inner.observe(observer.context, observer.callback);
    } catch (error) {
      this.failure = this._failureResponse(error);
      const failure = this.failure;
      queueMicrotask(() => observer.callback(this, failure));
    }
  }

  /** @param {unknown} context @param {(sender: unknown, response: unknown) => void} callback */
  observe(context, callback) {
    const observer = { context, callback };
    if (this.inner) {
      this._observeInner(observer);
    } else if (this.failure) {
      const failure = this.failure;
      queueMicrotask(() => callback(this, failure));
    } else {
      this.observers.add(observer);
    }
    return this;
  }

  /** @param {unknown} context */
  unobserve(context) {
    for (const observer of this.observers) {
      if (observer.context === context) this.observers.delete(observer);
    }
    this.inner?.unobserve?.(context);
  }

  /** @param {((value: any) => any) | undefined} onFulfilled @param {((reason: any) => any) | undefined} onRejected */
  then(onFulfilled, onRejected) {
    return this.guardPromise.then(onFulfilled, onRejected);
  }

  /** @param {((reason: any) => any) | undefined} onRejected */
  catch(onRejected) {
    return this.guardPromise.catch(onRejected);
  }

  /** @param {(() => any) | undefined} onFinally */
  finally(onFinally) {
    return this.guardPromise.finally(onFinally);
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === "object";
}

export class SbcSubmitTransactionService {
  /** @type {Record<string, boolean>} */
  _guardReg = {};
  /**
   * @param {{ observableAdapter?: EaObservableAdapter }} [options]
   */
  constructor({ observableAdapter = new EaObservableAdapter() } = {}) {
    this.observableAdapter = observableAdapter;
    /** @type {Map<string, Record<string, unknown>>} */
    this.inFlight = new Map();
    /** @type {Map<string, GuardedSubmitObservable>} */
    this.guardPending = new Map();
  }

  /**
   * @param {{
   *   args: unknown[],
   *   observerContext: object,
   *   invoke: () => unknown,
   *   onSuccess: (response: Record<string, unknown>) => void,
   *   onDiagnostic?: (result: unknown) => void
   * }} options
   */
  /**
   * @param {{
   *   args: unknown[],
   *   observerContext: object,
   *   invoke: () => unknown,
   *   onSuccess: (response: Record<string, unknown>) => void,
   *   onDiagnostic?: (result: unknown) => void
   * }} options
   */
  intercept(options) {
    const g = guardianOrFailClosed("SBC_SUBMIT");
    if (!g) return this._interceptImpl(options);
    const challenge = options.args && options.args[0];
    const challengeId = Number(isRecord(challenge) ? challenge.id : undefined) || null;
    if (!challengeId) throw new Error("GUARDIAN_PREVIEW_INVALID:SBC_SUBMIT");
    const key = String(challengeId);
    if (this.inFlight.has(key) || this.guardPending.has(key)) {
      const result = sbcSubmitFailure(
        SBC_SUBMIT_ERROR_CODES.IN_FLIGHT,
        ["challenge.submit-in-flight"]
      );
      options.onDiagnostic?.(result);
      return new RejectedSubmitObservable({
        success: false,
        status: 409,
        error: result.error
      });
    }
    const dto = Object.freeze({ kind: "SBC_SUBMIT", challengeId });
    const guardPromise = g.requestGuarded("SBC_SUBMIT", dto, { context: options });
    const result = new GuardedSubmitObservable(guardPromise, {
      onDiagnostic: options.onDiagnostic
    });
    this.guardPending.set(key, result);
    guardPromise.then(
      () => {
        if (this.guardPending.get(key) === result) this.guardPending.delete(key);
      },
      () => {
        if (this.guardPending.get(key) === result) this.guardPending.delete(key);
      }
    );
    return result;
  }

  /**
   * @param {{
   *   args: unknown[],
   *   observerContext: object,
   *   invoke: () => unknown,
   *   onSuccess: (response: Record<string, unknown>) => void,
   *   onDiagnostic?: (result: unknown) => void
   * }} options
   */
  _interceptImpl(options) {
    const { args, observerContext, invoke, onSuccess, onDiagnostic = () => {} } = options;
    const challenge = args[0];
    const setEntity = args[1];
    const challengeId = Number(
      isRecord(challenge) ? challenge.id : undefined
    );
    let canSubmit;
    try {
      canSubmit =
        isRecord(challenge) &&
        typeof challenge.canSubmit === "function" &&
        challenge.canSubmit() === true;
    } catch {
      canSubmit = false;
    }
    if (
      !Number.isInteger(challengeId) ||
      challengeId <= 0 ||
      !isRecord(setEntity) ||
      !canSubmit
    ) {
      const result = sbcSubmitFailure(
        SBC_SUBMIT_ERROR_CODES.PRECONDITION,
        ["challenge.id", "challenge.canSubmit", "set"]
      );
      onDiagnostic(result);
      return new RejectedSubmitObservable({
        success: false,
        status: 400,
        error: result.error
      });
    }

    const key = String(challengeId);
    const existing = this.inFlight.get(key);
    if (existing) {
      const result = sbcSubmitFailure(
        SBC_SUBMIT_ERROR_CODES.IN_FLIGHT,
        ["challenge.submit-in-flight"]
      );
      onDiagnostic(result);
      return new RejectedSubmitObservable({
        success: false,
        status: 409,
        error: result.error
      });
    }

    let observable;
    try {
      observable = invoke();
    } catch {
      const result = sbcSubmitFailure(
        SBC_SUBMIT_ERROR_CODES.INVALID_RESPONSE,
        ["submit.invoke-threw"]
      );
      onDiagnostic(result);
      return new RejectedSubmitObservable({
        success: false,
        status: 500,
        error: result.error
      });
    }
    if (!isRecord(observable) || typeof observable.observe !== "function") {
      const result = sbcSubmitFailure(
        SBC_SUBMIT_ERROR_CODES.INVALID_RESPONSE,
        ["submit.observable"]
      );
      onDiagnostic(result);
      return new RejectedSubmitObservable({
        success: false,
        status: 500,
        error: result.error
      });
    }

    this.inFlight.set(key, observable);
    let responseObserved = false;
    this.observableAdapter
      .observeOnce(observable, observerContext, "sbc.submit-challenge")
      .then((observed) => {
        if (!observed.success) {
          onDiagnostic(observed);
          return;
        }
        responseObserved = true;
        const result = parseSbcSubmitResponse(observed.data);
        if (!result.success) {
          onDiagnostic(result);
          return;
        }
        onSuccess(result.data);
      })
      .catch(() => {
        onDiagnostic(
          sbcSubmitFailure(SBC_SUBMIT_ERROR_CODES.INVALID_RESPONSE, [
            "submit.monitor-threw"
          ])
        );
      })
      .finally(() => {
        if (
          responseObserved &&
          this.inFlight.get(key) === observable
        ) {
          this.inFlight.delete(key);
        }
      });
    return observable;
  }
}
