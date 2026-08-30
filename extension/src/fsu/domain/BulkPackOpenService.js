export const BULK_PACK_ERROR_CODES = Object.freeze({
  BUSY: "BULK_PACK_BUSY",
  INVALID_INPUT: "BULK_PACK_INVALID_INPUT",
  PRECONDITION: "BULK_PACK_PRECONDITION_FAILED",
  OPEN_FAILED: "BULK_PACK_OPEN_FAILED",
  ASSIGN_FAILED: "BULK_PACK_ASSIGN_FAILED",
  CANCELLED: "BULK_PACK_CANCELLED"
});

/**
 * @typedef {{
 *   rating?: unknown,
 *   isSpecial?: () => boolean,
 *   [key: string]: unknown
 * }} BulkPackPlayer
 * @typedef {{
 *   success: boolean,
 *   error?: {code?: string, issues?: string[]},
 *   data?: {
 *     packs?: unknown[],
 *     players?: BulkPackPlayer[],
 *     clubCount?: number,
 *     storageCount?: number
 *   }
 * }} BulkPackAdapterResult
 * @typedef {{
 *   prepare: (input: {
 *     packId: number,
 *     count: number,
 *     context: unknown
 *   }) => Promise<BulkPackAdapterResult>,
 *   openAndAssign: (input: {
 *     pack: unknown,
 *     context: unknown,
 *     packIndex: number
 *   }) => Promise<BulkPackAdapterResult>
 * }} BulkPackAdapter
 */

/**
 * @param {string} code
 * @param {string[]} issues
 * @param {Record<string, unknown>} [data]
 */
function failure(code, issues, data = {}) {
  return { success: false, error: { code, issues }, data };
}

import { guardianOrFailClosed } from "../../guardian/mode.js";

export class BulkPackOpenService {
  /** @type {Record<string, boolean>} */
  _guardReg = {};
  /**
   * @param {{
   *   adapter: BulkPackAdapter,
   *   wait?: (ms: number) => Promise<void>,
   *   delayMs?: number,
   *   maxPacks?: number
   * }} deps
   */
  constructor({ adapter, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), delayMs = 750, maxPacks = 50 }) {
    this.adapter = adapter;
    this.wait = wait;
    this.delayMs = delayMs;
    this.maxPacks = maxPacks;
    this.active = null;
  }

  cancel() {
    if (!this.active) return false;
    this.active.cancelled = true;
    return true;
  }

  isRunning() {
    return this.active !== null;
  }

  /**
   * @param {{
   *   packId: number,
   *   count: number,
   *   context: unknown,
   *   onProgress?: (current: number, total: number) => void
   * }} input
   */
  async run({ packId, count, context, onProgress = () => {} }) {
    const g = guardianOrFailClosed("PACK_OPEN_BULK");
    if (!g) return this._runImpl({ packId, count, context, onProgress });
    // DTO is primitives only; the runtime context (EA adapter context + the
    // onProgress callback) is bound internally and is not hashed or exposed.
    const dto = Object.freeze({ kind: "PACK_OPEN_BULK", packId: Number(packId), count: Number(count) });
    return g.requestGuarded("PACK_OPEN_BULK", dto, {
      context: { context, onProgress }
    });
  }

  /**
   * @param {{ packId: number, count: number, context: unknown, onProgress?: (current: number, total: number) => void }} input
   */
  async _runImpl({ packId, count, context, onProgress = () => {} }) {
    if (this.active) {
      return failure(BULK_PACK_ERROR_CODES.BUSY, ["bulk-pack.in-flight"]);
    }
    if (
      !Number.isInteger(packId) ||
      packId <= 0 ||
      !Number.isInteger(count) ||
      count <= 0 ||
      count > this.maxPacks
    ) {
      return failure(BULK_PACK_ERROR_CODES.INVALID_INPUT, ["packId", "count"]);
    }
    /** @type {{cancelled: boolean}} */
    const token = { cancelled: false };
    this.active = token;
    const summary = {
      requested: count,
      opened: 0,
      clubCount: 0,
      storageCount: 0,
      specialCount: 0,
      highestRating: 0,
      /** @type {BulkPackPlayer[]} */
      players: []
    };
    try {
      const prepared = await this.adapter.prepare({
        packId,
        count,
        context
      });
      if (!prepared?.success || !Array.isArray(prepared.data?.packs)) {
        return failure(
          BULK_PACK_ERROR_CODES.PRECONDITION,
          prepared?.error?.issues || ["bulk-pack.prepare"],
          summary
        );
      }
      for (let index = 0; index < prepared.data.packs.length; index++) {
        if (token.cancelled) {
          return failure(
            BULK_PACK_ERROR_CODES.CANCELLED,
            ["bulk-pack.cancelled"],
            summary
          );
        }
        onProgress(index + 1, count);
        const result = await this.adapter.openAndAssign({
          pack: prepared.data.packs[index],
          context,
          packIndex: index + 1
        });
        if (!result?.success || !Array.isArray(result.data?.players)) {
          return failure(
            result?.error?.code === BULK_PACK_ERROR_CODES.ASSIGN_FAILED
              ? BULK_PACK_ERROR_CODES.ASSIGN_FAILED
              : BULK_PACK_ERROR_CODES.OPEN_FAILED,
            result?.error?.issues || ["bulk-pack.open"],
            summary
          );
        }
        summary.opened++;
        summary.clubCount += result.data.clubCount || 0;
        summary.storageCount += result.data.storageCount || 0;
        for (const player of result.data.players) {
          summary.specialCount += player.isSpecial?.() ? 1 : 0;
          summary.highestRating = Math.max(
            summary.highestRating,
            Number(player.rating) || 0
          );
          summary.players.push(player);
        }
        if (index + 1 < prepared.data.packs.length) {
          await this.wait(this.delayMs);
        }
      }
      return { success: true, data: summary };
    } finally {
      if (this.active === token) this.active = null;
    }
  }
}
