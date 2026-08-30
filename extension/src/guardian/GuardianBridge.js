export class GuardianBridge {
  constructor({ postMessage, sessionNonce }) {
    this.postMessage = postMessage;
    this.sessionNonce = sessionNonce;
  }

  notify(type, payload = {}, requestId = null) {
    if (!this.sessionNonce) throw new Error("GUARDIAN_BRIDGE_NOT_CONNECTED");
    const randomId =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `guardian-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.postMessage(Object.freeze({
      protocolVersion: 1,
      messageId: randomId,
      requestId,
      sessionNonce: this.sessionNonce,
      type,
      payload,
      ts: new Date().toISOString()
    }));
  }
}
