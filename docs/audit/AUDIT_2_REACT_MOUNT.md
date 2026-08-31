# Audit 2 — React production mount

The extension now bundles a production-only React entry under `extension/src/guardian/ProductionApp.jsx`.
The preview harness remains in `frontend/` and is not imported by the production entry, so mock screens and
`EaMock` cannot enter the userscript bundle. The overlay is mounted once in a Shadow DOM host with a fixed,
pointer-events-disabled root; only the Guardian panel accepts input. Tailwind is compiled at build time through
the local PostCSS plugin and no CDN/runtime imports are used. A missing adapter renders a safe connecting state;
there is no fallback to mock data. The real adapter and full screens are wired in Audit 3.
