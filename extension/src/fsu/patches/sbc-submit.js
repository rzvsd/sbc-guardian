import { SbcSubmitTransactionService } from "../domain/SbcSubmitTransactionService.js";
import { registerGuardianServiceOwner } from "../../guardian/fsu/registerServiceOwner.js";

export const SBC_SUBMIT_PATCH_IDS = Object.freeze({
  TRANSACTION: "sbc.submit-transaction"
});

export function installSbcSubmitPatch(deps) {
  const {
    sbcCountService,
    onCountChanged,
    patchLifecycle,
    debug
  } = deps;
  const transactionService =
    deps.transactionService ?? new SbcSubmitTransactionService();
  registerGuardianServiceOwner("sbc", transactionService);

  return patchLifecycle.install({
    id: SBC_SUBMIT_PATCH_IDS.TRANSACTION,
    phase: "late",
    targetLabel: "UTSBCService.prototype.submitChallenge",
    resolveTarget: () =>
      typeof UTSBCService === "undefined"
        ? null
        : {
            owner: UTSBCService.prototype,
            key: "submitChallenge"
          },
    verify: ({ originalDescriptor, originalValue }) => ({
      ok:
        originalDescriptor !== undefined &&
        "value" in originalDescriptor &&
        originalDescriptor.writable === true &&
        typeof originalValue === "function",
      missing: ["UTSBCService.prototype.submitChallenge"]
    }),
    apply: ({ target, originalDescriptor, originalValue }) => {
      Object.defineProperty(target.owner, target.key, {
        ...originalDescriptor,
        value: function fsuSubmitChallengeTransaction(...args) {
          return transactionService.intercept({
            args,
            observerContext: this,
            invoke: () => originalValue.apply(this, args),
            onSuccess: () => {
              sbcCountService.recordCompletion();
              onCountChanged();
            },
            onDiagnostic: (result) =>
              debug.log("SBC submit transaction", result)
          });
        }
      });
    }
  });
}
