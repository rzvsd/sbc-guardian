import { requireSnapshot } from "../GuardianContracts.js";

export class Fc26SnapshotAdapter {
  toCloud(snapshot) {
    return requireSnapshot(snapshot);
  }
}
