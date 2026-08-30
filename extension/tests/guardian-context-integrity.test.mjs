import assert from "node:assert";
import { createGuardianRuntime, setGuardian } from "../src/guardian/runtime.js";
import { registerGuardianServiceOwner } from "../src/guardian/fsu/registerServiceOwner.js";
import { MarketActionService } from "../src/fsu/domain/MarketActionService.js";
import { SbcSubmitTransactionService } from "../src/fsu/domain/SbcSubmitTransactionService.js";
import { StorePackOpenTransactionService } from "../src/fsu/domain/StorePackOpenTransactionService.js";

export async function runGuardianContextIntegrityTests() {
  {
    const g = createGuardianRuntime({ sessionNonce: "buy-context", mutations: {} });
    setGuardian(g);
    const service = new MarketActionService();
    let executions = 0;
    service._buyPlayerImpl = () => { executions++; };
    registerGuardianServiceOwner("market", service);
    const player = { definitionId: 10 };
    g.defaultPreviewHandler = (_preview, controls) => {
      player.definitionId = 11;
      controls.approve();
    };
    await assert.rejects(
      () => service.buyPlayer(player, null, { getCachePrice: () => ({ num: 2_000 }) }),
      /GUARDIAN_CONTEXT_MISMATCH:MARKET_BUY/
    );
    assert.equal(executions, 0, "changed market-buy identity never reaches executor");
  }

  {
    const g = createGuardianRuntime({ sessionNonce: "list-context", mutations: {} });
    setGuardian(g);
    const service = new MarketActionService();
    let executions = 0;
    service._playerToAuctionImpl = () => { executions++; };
    registerGuardianServiceOwner("market", service);
    const item = { id: 20 };
    g.defaultPreviewHandler = (_preview, controls) => {
      item.id = 21;
      controls.approve();
    };
    await assert.rejects(
      () => service.playerToAuction(item, 1_000, 1, { getCachePrice: () => ({ num: 2_000 }) }),
      /GUARDIAN_CONTEXT_MISMATCH:MARKET_LIST/
    );
    assert.equal(executions, 0, "changed market-list identity never reaches executor");
  }

  {
    const g = createGuardianRuntime({ sessionNonce: "sbc-context", mutations: {} });
    setGuardian(g);
    const service = new SbcSubmitTransactionService();
    let executions = 0;
    service._interceptImpl = () => { executions++; };
    registerGuardianServiceOwner("sbc", service);
    const challenge = { id: 30 };
    const options = { args: [challenge], observerContext: {}, invoke() {}, onSuccess() {} };
    g.defaultPreviewHandler = (_preview, controls) => {
      challenge.id = 31;
      controls.approve();
    };
    await assert.rejects(() => service.intercept(options), /GUARDIAN_CONTEXT_MISMATCH:SBC_SUBMIT/);
    assert.equal(executions, 0, "changed SBC identity never reaches executor");
  }

  {
    const selections = [
      { tracked: true, key: "pack-a", packId: 40, initialCount: 1 },
      { tracked: true, key: "pack-b", packId: 41, initialCount: 1 }
    ];
    const service = new StorePackOpenTransactionService({
      adapter: { prepare: () => ({ success: true, data: selections.shift() }) }
    });
    const g = createGuardianRuntime({ sessionNonce: "pack-context", mutations: {} });
    setGuardian(g);
    registerGuardianServiceOwner("store", service);
    let invokes = 0;
    g.defaultPreviewHandler = (_preview, controls) => controls.approve();
    await assert.rejects(
      () => service.intercept({ controller: {}, args: [], invoke: () => { invokes++; }, onSuccess() {} }),
      /GUARDIAN_CONTEXT_MISMATCH:PACK_OPEN/
    );
    assert.equal(invokes, 0, "changed store selection never invokes pack open");
  }

  setGuardian(null);
  console.log("guardian-context-integrity: all assertions passed");
}
