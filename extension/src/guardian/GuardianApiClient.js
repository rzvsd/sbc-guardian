import { requireSnapshotForEdition, requireTraditionalSolveResponse, requireStreamlinedSolveResponse } from "./GuardianContracts.js";

export class GuardianApiError extends Error {
  /** @param {string} code @param {number} [status] */
  constructor(code, status = 0) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export class GuardianApiClient {
  /** @param {{baseUrl:string, transport:(request:{url:string,method:string,body?:unknown,timeoutMs:number})=>Promise<{status:number,body:unknown}>, timeoutMs?:number}} config */
  constructor({ baseUrl, transport, timeoutMs = 12_000 }) {
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.transport = transport;
    this.timeoutMs = timeoutMs;
  }

  /** @param {string} path @param {{method?:string, body?:unknown}} [options] @returns {Promise<any>} */
  async request(path, options = {}) {
    try {
      const response = await this.transport({
        url: this.baseUrl + path,
        method: options.method || "GET",
        body: options.body,
        timeoutMs: this.timeoutMs
      });
      const value = /** @type {any} */ (response.body);
      if (response.status < 200 || response.status >= 300) {
        const code = value && value.detail && (value.detail.code || value.detail);
        throw new GuardianApiError(String(code || "GUARDIAN_API_ERROR"), response.status);
      }
      if (!value || typeof value !== "object") {
        throw new GuardianApiError("GUARDIAN_INVALID_SERVER_RESPONSE", response.status);
      }
      return value;
    } catch (error) {
      const err = /** @type {any} */ (error);
      if (err && err.name === "AbortError") {
        throw new GuardianApiError("GUARDIAN_NETWORK_TIMEOUT");
      }
      if (err && err.code === "GUARDIAN_AUTH_REQUIRED") {
        throw new GuardianApiError("GUARDIAN_AUTH_REQUIRED", 401);
      }
      throw error;
    }
  }

  /** @param {unknown} snapshot */
  async uploadSnapshot(snapshot) {
    const value = /** @type {any} */ (snapshot);
    return this.request("/api/v2/snapshots", { method: "POST", body: requireSnapshotForEdition(value, value?.edition === "FC27" ? "FC27" : "FC26") });
  }

  /** @param {unknown} body */
  async solveTraditional(body) {
    return requireTraditionalSolveResponse(
      await this.request("/api/v2/solve/traditional", { method: "POST", body })
    );
  }

  /** @param {unknown} body */
  async solveStreamlined(body) {
    return requireStreamlinedSolveResponse(
      await this.request("/api/v2/solve/streamlined", { method: "POST", body })
    );
  }

  async getPolicy() { return this.request("/api/v2/guardian/policy"); }
  /** @param {unknown} body */
  async putPolicy(body) { return this.request("/api/v2/guardian/policy", { method: "PUT", body }); }
  async getAccount() { return this.request("/api/v2/auth/me"); }
  async getAccess() { return this.request("/api/v2/account/access"); }
  async signOut() { return this.request("/api/v2/auth/logout", { method: "POST", body: {} }); }
  /** @param {string} solutionId @param {string} decisionId */
  async confirmSolution(solutionId, decisionId) {
    return this.request(`/api/v2/solutions/${encodeURIComponent(solutionId)}/confirm`, { method: "POST", body: { decision_id: decisionId } });
  }
}
