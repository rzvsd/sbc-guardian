import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "guardian.portal.session";
const VERIFIER_KEY = "guardian.auth.verifier";
const STATE_KEY = "guardian.auth.state";

/** @param {string} path @param {RequestInit} [options] */
async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    redirect: "error",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.detail;
    const message = typeof detail === "string" ? detail : detail?.message;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return body;
}

export default function AccountPage() {
  const [session, setSession] = useState(() => sessionStorage.getItem(SESSION_KEY) || "");
  const [account, setAccount] = useState(/** @type {{email:string|null,role:string,access:string}|null} */ (null));
  const [pairing, setPairing] = useState(/** @type {{code:string,expires_at:string}|null} */ (null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const callbackStarted = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state || session || callbackStarted.current) return;
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    const expectedState = sessionStorage.getItem(STATE_KEY);
    if (!verifier || state !== expectedState) {
      setError("Sign-in state is invalid or expired. Start sign-in again.");
      return;
    }
    callbackStarted.current = true;
    setBusy(true);
    api(`/api/v2/auth/callback?${new URLSearchParams({ code, state, code_verifier: verifier })}`)
      .then((result) => {
        sessionStorage.setItem(SESSION_KEY, result.session_nonce);
        sessionStorage.removeItem(VERIFIER_KEY);
        sessionStorage.removeItem(STATE_KEY);
        setSession(result.session_nonce);
        window.history.replaceState({}, "", "/account");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Sign-in failed"))
      .finally(() => setBusy(false));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    api("/api/v2/auth/me", { headers: { "X-Guardian-Session": session } })
      .then(setAccount)
      .catch((reason) => {
        sessionStorage.removeItem(SESSION_KEY);
        setSession("");
        setError(reason instanceof Error ? reason.message : "Your session expired. Sign in again.");
      });
  }, [session]);

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/v2/auth/login");
      sessionStorage.setItem(VERIFIER_KEY, result.code_verifier);
      sessionStorage.setItem(STATE_KEY, result.state);
      window.location.assign(result.authorize_url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed");
      setBusy(false);
    }
  }

  async function createPairing() {
    setBusy(true);
    setError("");
    try {
      setPairing(await api("/api/v2/pairings", {
        method: "POST",
        headers: { "X-Guardian-Session": session },
        body: JSON.stringify({ ttl_seconds: 600 })
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pairing failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (session) {
      await api("/api/v2/auth/logout", {
        method: "POST",
        headers: { "X-Guardian-Session": session },
        body: "{}"
      }).catch(() => undefined);
    }
    [SESSION_KEY, VERIFIER_KEY, STATE_KEY].forEach((key) => sessionStorage.removeItem(key));
    setSession("");
    setAccount(null);
    setPairing(null);
  }

  return (
    <main>
      <h1>SBC Guardian account</h1>
      {error && <p role="alert">{error}</p>}
      {!session ? (
        <>
          <h2>Get started</h2>
          <p>Sign in to connect Guardian to your EA account. You can then link the Android app with a one-time code.</p>
          <button type="button" disabled={busy} onClick={signIn}>Sign in</button>
        </>
      ) : (
        <>
          {!account ? <p role="status">Checking your account…</p> : (
            <section aria-labelledby="onboarding-title">
              <h2 id="onboarding-title">Welcome to Guardian</h2>
              <p>Signed in as {account.email || "your account"}. Access: {account.access}.</p>
              <p>To use Guardian on Android:</p>
              <ol>
                <li>Generate a one-time pairing code here.</li>
                <li>Open SBC Guardian on your phone.</li>
                <li>Enter the code before it expires.</li>
              </ol>
              <button type="button" disabled={busy} onClick={createPairing}>
                Generate Android pairing code
              </button>
              {pairing && (
                <section aria-live="polite" aria-label="Android pairing code">
                  <h3>Pairing code</h3>
                  <code>{pairing.code}</code>
                  <p>This code grants access to this account once. Do not share it. It expires at {new Date(pairing.expires_at).toLocaleTimeString()}.</p>
                </section>
              )}
            </section>
          )}
          <button type="button" disabled={busy} onClick={logout}>Sign out</button>
        </>
      )}
    </main>
  );
}
