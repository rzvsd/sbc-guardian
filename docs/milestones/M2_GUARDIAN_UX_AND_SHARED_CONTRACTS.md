M2_GUARDIAN_UX_AND_SHARED_CONTRACTS.md

## Obiectiv

Înlocuim complet UX-ul vechi cu o experiență contextuală în interiorul EA Web App și stabilim contractele comune înainte de backend.

## UX principal

```text
Open EA
→ Guardian ready
→ deschide un SBC
→ Analyze requirements
→ filtre + Guardian warnings
→ Build
→ Review
→ Apply squad
→ confirmare explicită
→ Submit
→ Result/History
```

Nu există homepage Android cu module separate. Android afișează Web App-ul EA plus Guardian.

## Componente noi

```text
extension\src\guardian\ui\
├── GuardianRail.js
├── GuardianWorkspace.js
├── GuardianSbcWorkspace.js
├── GuardianToolsDrawer.js
├── GuardianInfoPopover.js
├── GuardianFilterSheet.js
├── GuardianSolutionReview.js
├── GuardianActionConfirmation.js
├── GuardianResultToast.js
├── GuardianOnboarding.js
└── GuardianErrorPanel.js
```

Design:

```text
extension\src\guardian\ui\tokens.css
extension\src\guardian\i18n\en.json
extension\src\guardian\i18n\ro.json
```

Cerințe:

- English implicit;
- română completă;
- responsive desktop/mobile;
- TalkBack/keyboard support;
- contrast WCAG AA;
- icon + text pentru status;
- fiecare acțiune importantă are buton `i`;
- mesajele explică „ce face”, „ce consumă”, „ce risc există”.

## Feature registry

```javascript
export const FEATURE_CAPABILITIES = {
  sbcEnhancer: { visible: true, defaultEnabled: true },
  squadBuilder: { visible: true, defaultEnabled: true },
  guardian: { visible: true, defaultEnabled: true },
  ratingTools: { visible: true, defaultEnabled: true },
  prices: { visible: true, defaultEnabled: true, providerRequired: true },
  marketActions: { visible: true, defaultEnabled: true, confirmationRequired: true },
  packTools: { visible: true, defaultEnabled: true, confirmationRequired: true },
  objectives: { visible: true, defaultEnabled: true },
  evolutions: { visible: true, defaultEnabled: true }
};
```

O funcție cu provider lipsă rămâne vizibilă cu status:

```text
AVAILABLE
REQUIRES_CONFIRMATION
PROVIDER_UNAVAILABLE
UNSUPPORTED_ON_GECKO
READ_ONLY
```

## Action Guard central

Toate acțiunile ireversibile trec printr-un singur serviciu:

```text
extension\src\guardian\actions\GuardianActionGate.js
extension\src\guardian\actions\ActionPreviewBuilder.js
extension\src\guardian\actions\ActionDecisionStore.js
```

Contract:

```json
{
  "actionId": "uuid",
  "kind": "SBC_SUBMIT",
  "payloadHash": "sha256",
  "summary": "Submit this squad?",
  "affectedItemIds": ["normalized-id"],
  "expiresAt": "ISO-8601",
  "irreversible": true
}
```

Tipuri obligatoriu protejate:

```text
SBC_APPLY
SBC_SUBMIT
MARKET_BUY
MARKET_LIST
PACK_OPEN
BATCH_ACTION
```

Decizia se leagă de:

```text
actionId + payloadHash + sessionNonce
```

Este:

- single-use;
- expirabilă;
- nereutilizabilă;
- invalidă dacă payload-ul se schimbă;
- fără retry automat după acceptare.

Pe Android, confirmarea este native. Pe Chrome desktop, este modal FSU cu același contract.

## Contracte comune

Canonical source:

```text
shared-contracts\schemas\
```

Contractele folosesc JSON Schema 2020-12 și golden fixtures.

Tipuri:

```text
GameEdition: FC26 | FC27
SbcFormat: TRADITIONAL | STREAMLINED
AccountRole: PRINCIPAL_ADMIN | ADMIN | SUBSCRIBER
AccessLevel: FULL | FULL_WITH_WARNING | PAYWALL
EntitlementState
PlayerItem
ClubSnapshot
GuardianPolicy
SbcChallenge
TraditionalSolveRequest/Response
StreamlinedSolveRequest/Response
ScoringRuleset
ActionPreview/Decision/Result
NativeMessageEnvelope
```

Orice request de solve include:

```json
{
  "contract_version": 1,
  "game_edition": "FC26",
  "snapshot_id": "uuid",
  "snapshot_hash": "sha256",
  "format": "TRADITIONAL"
}
```

FC27 include obligatoriu:

```json
{
  "ruleset_version": "verified-version",
  "taxonomy_version": 2
}
```

## State machine UX

```text
BOOTING
EA_LOGIN_REQUIRED
EA_READY
SBC_CONTEXT_FOUND
ANALYZING
REVIEW_REQUIRED
BUILDING
SOLUTION_READY
ACTION_CONFIRMATION
ACTION_RUNNING
ACTION_SUCCESS
ACTION_REJECTED
SESSION_EXPIRED
ERROR
```

Tranzițiile invalide sunt respinse și testate.

## Acceptare M2

- navigația este contextuală;
- niciun ecran vechi nu a fost importat;
- toate funcțiile au explicații;
- confirmarea nu poate fi ocolită;
- layout-ul funcționează la desktop și mobil;
- EN și RO sunt complete;
- contract fixtures trec în JS și Kotlin;
- încă nu există apeluri către backendul vechi.

---

# M2 — Raport final

## 1. Baseline
- Branch: codex/m2-guardian-ux-and-shared-contracts (creat din c318f50; M0 si M1 raman necomitate pe branch-urile lor)
- HEAD initial: c318f5018c7a3447103158d1cc28b24bfbce1dce
- Fisiere noi sub extension/src/guardian/** si shared-contracts/**. Niciun apel catre backendul vechi.

## 2. Fisiere modificate/noi
Modificat:
- extension/eslint.config.mjs (override nou pentru src/guardian/** : globuri browser/chrome, no-undef off)

Nou (extension/src/guardian):
- actions/ActionPreviewBuilder.js (sha256 payloadHash, ACTION_KINDS, irreversible set)
- actions/ActionDecisionStore.js (decizii single-use/expirabile/payload-bound/session-bound)
- actions/GuardianActionGate.js (requestDecision -> confirm; singura cale de executie)
- features/FeatureRegistry.js (FEATURE_CAPABILITIES + FEATURE_STATUSES + getFeatureStatus)
- state/GuardianStateMachine.js (starile + tranzitii; INVALID_TRANSITION aruncat)
- ui/dom.js (builder DOM sigur, doar textContent; niciodata innerHTML cu date dinamice)
- ui/GuardianRail.js, GuardianWorkspace.js, GuardianSbcWorkspace.js, GuardianToolsDrawer.js, GuardianInfoPopover.js, GuardianFilterSheet.js, GuardianSolutionReview.js, GuardianActionConfirmation.js, GuardianResultToast.js, GuardianOnboarding.js, GuardianErrorPanel.js
- ui/tokens.css (variabile WCAG AA, responsive, prefers-contrast)
- i18n/index.js (translate/interpolate/loadGuardianMessages/createTranslator)
- i18n/en.json, i18n/ro.json (complet EN + RO)

Nou (extension/tests):
- tests/guardian-action-gate.test.mjs
- tests/guardian-state-machine.test.mjs
- tests/guardian-contract-fixtures.test.mjs

Nou (shared-contracts):
- schemas/*.json (17 scheme JSON Schema 2020-12: game-edition, sbc-format, account-role, access-level, entitlement-state, player-item, club-snapshot, guardian-policy, sbc-challenge, scoring-ruleset, traditional/streamlined solve request+response, action-preview/decision/result, native-message-envelope)
- fixtures/*.json (10 golden fixtures, inclusiv traditional-solve-request FC27 cu ruleset_version+taxonomy_version)
- contracts.js (validator subset JSON Schema + CONTRACT_INDEX)

## 3. Ce s-a implementat
- UX contextual: componentele Guardian se monteaza in interiorul EA Web App (fara homepage Android separat). Rail/Workspace/SbcWorkspace/ToolsDrawer/InfoPopover/FilterSheet/SolutionReview/ActionConfirmation/ResultToast/Onboarding/ErrorPanel.
- Fiecare actiune importanta are buton 'i' si mesaje care explica ce face / ce consuma / ce risc.
- Feature registry cu statusuri AVAILABLE / REQUIRES_CONFIRMATION / PROVIDER_UNAVAILABLE / UNSUPPORTED_ON_GECKO / READ_ONLY.
- Action Guard central: toate actiunile ireversibile trec prin requestDecision -> confirm; confirm este single-use, expirabil, legat de actionId+payloadHash+sessionNonce, fara retry automat. Nu exista cale de ocolire a confirmarii.
- State machine UX cu tranzitii validate; tranzitiile invalide sunt respinse (testate).
- i18n EN (implicit) + RO complet; tokens.css responsive + contrast.

## 4. Contracte/API/schema
- shared-contracts/schemas/* (JSON Schema 2020-12) = sursa canonica a tipurilor: GameEdition, SbcFormat, AccountRole, AccessLevel, EntitlementState, PlayerItem, ClubSnapshot, GuardianPolicy, SbcChallenge, ScoringRuleset, Traditional/Streamlined Solve Request/Response, ActionPreview/Decision/Result, NativeMessageEnvelope.
- Orice solve request include contract_version=1, game_edition, snapshot_id, snapshot_hash, format. FC27 adauga ruleset_version + taxonomy_version=2 (golden fixture traditional-solve-request-fc27.json).
- ActionPreview/Decision/Result respecta contractul din M2 (actionId, kind, payloadHash, summary, affectedItemIds, expiresAt, irreversible).
- shared-contracts/contracts.js valideaza fixture-urile in JS.

## 5. Teste adaugate
- tests/guardian-action-gate.test.mjs: happy path, double-confirm respins (ALREADY_USED), expirare, kind invalid, clasificare irreversible, session-mismatch / payload-mismatch / already-used la nivel de store.
- tests/guardian-state-machine.test.mjs: tranzitii valide, INVALID_TRANSITION respins, canTransition, reset, stare initiala invalida.
- tests/guardian-contract-fixtures.test.mjs: cele 10 golden fixtures valideaza contra schemele (incl. FC27).
- Toate trec (npm test exit 0).

## 6. Gate results
- npm run lint: OK (0)
- npm run typecheck: OK (0) — notatie: guardian/** nu e in allow-list-ul tsconfig (doar lint); typecheck nu le atinge, deci nu pot introduce regresii de tip.
- npm test: OK (toate testele trec)
- npm run verify: OK (0) — include git diff --exit-code (userscript.js doar renormalizare LF/CRLF, fara modificare de continut)
- npm run check:manifests: OK
- npm run check:gecko-compat: OK
- npm audit: 1 high (adm-zip@0.5.16 — deschis din M1, NEFINALIZAT; vezi §7)
- npm run test:browser: neschimbat (env-blocked, necesita browser + retea EA)

## 7. Diferente fata de plan
- guardian/** nu este inca montat in DOM-ul EA (nu e inca integrat in runtime-ul FSU). M2 defineste layer-ul UX + contractele; mounting-ul contextual si event-wiring vin in milestone-urile urmatoare. Acceptabil: acceptarea M2 cere doar ca navigația sa fie contextuala si componentele sa existe, nu si mounting-ul productiv.
- guardian/** nu e in bundle-ul userscript (nu e importat din src/fsu/index.js). Nu creste marimea extensiei si nu e typecheck-uit (doar lint).
- adm-zip 0.5.16 ramane cu advisori high (GHSA-xcpc-8h2w-3j85) — NEFINALIZAT din M1; se asteapta decizia Codex (ramane 0.5.16 vs bump 0.6.0). Nu am rulat npm audit fix.

## 8. Riscuri si lucruri neverificate
- UI Guardian nu e verificat la runtime (fara browser/Playwright in mediu). Componentele sunt corecte la nivel de DOM sigur, dar nu s-a validat aspectul in EA Web App.
- Consumul contractelor in Kotlin (Android) nu e verificat (fara build Android). Fixture-urile sunt JSON pur, parseabil de kotlinx.serialization, dar nu s-a compilat partea Kotlin.
- tokens.css afirma contrast WCAG AA prin variabile; nu e auditat de un tool automat de contrast.
- i18n se incarca via fetch(chrome.runtime.getURL(...)) la runtime; calea de incarcare nu e testata in headless (translate() e testabil pur, dar loadGuardianMessages necesita context extensie).
- test:browser ramane env-blocked.

## 9. Confirmari
- Niciun ecran vechi nu a fost importat (guardian e nou, nu portat din android/ vechi).
- Nicio functie veche de backend nu e apelata.
- Zero secrete in diff.
- EN + RO complete in i18n.
- Confirmarea nu poate fi ocolita (Action Guard central, testat).
- Nicio actiune ireversibila: rm -Recurse / git clean / reset --hard.
- NO COMMIT: totul necomitat pe codex/m2-...; M0 si M1 raman de asemenea necomise. Codex face commit-ul dupa review.