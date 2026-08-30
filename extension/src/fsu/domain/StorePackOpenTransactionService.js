import {
  STORE_PACK_OPEN_ERROR_CODES,
  storePackOpenFailure
} from "./StorePackOpenResults.js";
import { guardianOrFailClosed } from "../../guardian/mode.js";

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === "object";
}

export class StorePackOpenTransactionService {
  /** @type {Record<string, boolean>} */
  _guardReg = {};
  /**
   * @param {{
   *   adapter: {
   *     prepare: (controller: unknown, args: unknown[]) => unknown,
   *     readCompletion: (packId: number) => unknown
   *   },
   *   timeoutMs?: number,
   *   settleMs?: number,
   *   pollMs?: number,
   *   now?: () => number,
   *   setTimer?: (callback: () => void, delay: number) => unknown
   * }} options
   */
  constructor({
    adapter,
    timeoutMs = 15_000,
    settleMs = 250,
    pollMs = 50,
    now = () => Date.now(),
    setTimer = (callback, delay) => setTimeout(callback, delay)
  }) {
    this.adapter = adapter;
    this.timeoutMs = timeoutMs;
    this.settleMs = settleMs;
    this.pollMs = pollMs;
    this.now = now;
    this.setTimer = setTimer;
    /** @type {Map<string, unknown>} */
    this.inFlight = new Map();
  }

  /**
   * @param {{
   *   controller: Record<string, unknown>,
   *   args: unknown[],
   *   invoke: () => unknown,
   *   onSuccess: (result: {
   *     packId: number,
   *     remainingCount: number,
   *     availablePackIds: number[]
   *   }) => void,
   *   onDiagnostic?: (result: unknown) => void
   * }} options
   */
  intercept(options) {
    const g = guardianOrFailClosed("PACK_OPEN");
    // The DTO is derived from the selection's primitives; the full runtime
    // context (controller, invoke/onSuccess callbacks) is bound internally and
    // never exposed.
    let selection = null;
    try {
      const prepared = this.adapter.prepare(options.controller, options.args);
      if (isRecord(prepared) && prepared.success === true && isRecord(prepared.data)) {
        selection = prepared.data;
      }
    } catch {
      selection = null;
    }
    if (!g) {
      // Legacy (pre-Guardian) execution path — only reachable in tests via the
      // explicit opt-in. Here the `tracked` flag decides routing, exactly as
      // the original non-Guardian code did.
      if (!selection || selection.tracked !== true) {
        return this._interceptImpl(options);
      }
      return this._interceptImpl(options);
    }
    // Guardian present: EVERY pack open is routed through the confirmation gate
    // (fail-closed). Even a non-tracked selection is still confirmed, using a
    // neutral DTO.
    if (!selection || selection.tracked !== true) {
      throw new Error("GUARDIAN_PREVIEW_INVALID:PACK_OPEN");
    }
    const dto = Object.freeze(
      selection && selection.tracked === true
      ? {
          kind: "PACK_OPEN",
          key: String(selection.key),
          packId: Number(selection.packId),
          initialCount: Number(selection.initialCount)
        }
      : { kind: "PACK_OPEN", key: "", packId: 0, initialCount: 0 }
    );
    return g.requestGuarded("PACK_OPEN", dto, { context: options });
  }

  /**
   * @param {{
   *   controller: Record<string, unknown>,
   *   args: unknown[],
   *   invoke: () => unknown,
   *   onSuccess: (result: {
   *     packId: number,
   *     remainingCount: number,
   *     availablePackIds: number[]
   *   }) => void,
   *   onDiagnostic?: (result: unknown) => void
   * }} options
   */
  _interceptImpl(options, /** @type {{key:string, packId:number, initialCount:number}|null} */ expectedDto = null) {
    const { controller, args, invoke, onSuccess, onDiagnostic = () => {} } = options;
    let prepared;
    try {
      prepared = this.adapter.prepare(controller, args);
    } catch {
      prepared = storePackOpenFailure(
        STORE_PACK_OPEN_ERROR_CODES.PRECONDITION,
        ["pack.adapter.prepare"]
      );
    }
    if (
      !isRecord(prepared) ||
      prepared.success !== true ||
      !isRecord(prepared.data)
    ) {
      onDiagnostic(prepared);
      return invoke();
    }
    const selection = prepared.data;
    if (selection.tracked !== true) return invoke();
    if (
      typeof selection.key !== "string" ||
      !Number.isInteger(selection.packId) ||
      !Number.isInteger(selection.initialCount)
    ) {
      onDiagnostic(
        storePackOpenFailure(STORE_PACK_OPEN_ERROR_CODES.PRECONDITION, [
          "pack.selection"
        ])
      );
      return invoke();
    }
    const key = selection.key;
    const packId = Number(selection.packId);
    const initialCount = Number(selection.initialCount);
    if (
      expectedDto &&
      (
        String(expectedDto.key) !== key ||
        Number(expectedDto.packId) !== packId ||
        Number(expectedDto.initialCount) !== initialCount
      )
    ) {
      throw new Error("GUARDIAN_CONTEXT_MISMATCH:PACK_OPEN");
    }

    if (
      this.inFlight.size > 0 ||
      controller.isOpeningPack === true
    ) {
      onDiagnostic(
        storePackOpenFailure(STORE_PACK_OPEN_ERROR_CODES.DUPLICATE, [
          "pack.open-in-flight"
        ])
      );
      return undefined;
    }

    /** @type {{
     *   startedAt: number,
     *   sawOpening: boolean,
     *   completedAt: number | undefined
     * }} */
    const transaction = {
      startedAt: this.now(),
      sawOpening: false,
      completedAt: undefined
    };
    this.inFlight.set(key, transaction);

    let returnValue;
    try {
      returnValue = invoke();
    } catch (error) {
      this.inFlight.delete(key);
      throw error;
    }
    transaction.sawOpening = controller.isOpeningPack === true;

    const poll = () => {
      if (this.inFlight.get(key) !== transaction) return;
      let completion;
      try {
        completion = this.adapter.readCompletion(packId);
      } catch {
        completion = storePackOpenFailure(
          STORE_PACK_OPEN_ERROR_CODES.INVENTORY,
          ["pack.adapter.readCompletion"]
        );
      }
      if (
        !isRecord(completion) ||
        completion.success !== true ||
        !isRecord(completion.data) ||
        !Number.isInteger(completion.data.remainingCount) ||
        !Array.isArray(completion.data.availablePackIds) ||
        !completion.data.availablePackIds.every(Number.isInteger)
      ) {
        onDiagnostic(completion);
        return;
      }
      const remainingCount = Number(completion.data.remainingCount);
      const availablePackIds = completion.data.availablePackIds.map(Number);
      if (remainingCount < initialCount) {
        this.inFlight.delete(key);
        onSuccess({
          packId,
          remainingCount,
          availablePackIds
        });
        return;
      }

      const currentTime = this.now();
      if (controller.isOpeningPack === true) {
        transaction.sawOpening = true;
        transaction.completedAt = undefined;
      } else if (transaction.sawOpening) {
        transaction.completedAt ??= currentTime;
        if (currentTime - transaction.completedAt >= this.settleMs) {
          this.inFlight.delete(key);
          onDiagnostic(
            storePackOpenFailure(STORE_PACK_OPEN_ERROR_CODES.REJECTED, [
              "pack.inventory-unchanged"
            ])
          );
          return;
        }
      }

      if (currentTime - transaction.startedAt >= this.timeoutMs) {
        onDiagnostic(
          storePackOpenFailure(STORE_PACK_OPEN_ERROR_CODES.TIMEOUT, [
            "pack.open-timeout"
          ])
        );
        return;
      }
      this.setTimer(poll, this.pollMs);
    };
    this.setTimer(poll, this.pollMs);
    return returnValue;
  }
}
