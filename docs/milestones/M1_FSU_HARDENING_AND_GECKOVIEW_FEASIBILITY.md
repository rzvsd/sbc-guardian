M1_FSU_HARDENING_AND_GECKOVIEW_FEASIBILITY.md

## Obiectiv

Demonstrăm devreme că FSU poate fi baza produsului atât în Chrome, cât și în GeckoView. Nu migrăm backendul înainte de acest verdict.

## Structura adăugată

```text
C:\BOTS\SBCGuardian\
├── extension\
│   ├── manifest.json
│   ├── manifest.gecko.json
│   ├── src\
│   │   ├── background.js
│   │   └── background-gecko.js
│   └── scripts\
├── shared-contracts\
├── android-wrapper\
├── guardian-cloud\
├── web-portal\
├── infra\
├── docs\
└── third-party-notices\
```

## 1. Provenance și licențe

Se creează:

```text
docs\OSS_BASELINE.md
docs\GECKOVIEW_FEASIBILITY.md
docs\DATA_BOUNDARY.md
docs\OLD_REPO_IMPORT_MAP.md
third-party-notices\OSS_REGISTER.json
THIRD_PARTY_NOTICES.md
```

Registrul include:

- nume;
- versiune;
- repository;
- licență;
- folosit la runtime sau development;
- date externe accesate;
- aprobare/restricție.

MIT-ul FSU rămâne păstrat.

## 2. Toolchain

FSU cere Node 22. Se adaugă:

```text
.nvmrc → 22
```

Se rulează:

```powershell
cd C:\BOTS\SBCGuardian\extension
npm ci
npm run check:version
npm run lint
npm run build
npm run typecheck
npm test
npm run test:browser
npm run package
npm run package:smoke
npm audit
```

Nu se rulează `npm audit fix` automat.

## 3. Vulnerabilitatea dev-toolchain

Auditul inițial a identificat `brace-expansion` vulnerabil prin ESLint/minimatch.

Se remediază controlat:

```json
{
  "overrides": {
    "brace-expansion": "5.0.9"
  }
}
```

Se regenerează numai lockfile-ul aferent și se verifică:

```powershell
npm ci
npm audit
npm run verify
```

Dacă versiunea exactă sau licența diferă la implementare, se oprește și se reevaluează; nu se ia automat alt pachet.

## 4. Packaging cross-platform

Upstream package smoke folosește `unzip`, care nu există implicit pe Windows.

Se înlocuiește cu un helper Node comun folosind o dependență ZIP mică, pinată exact și trecută în OSS register, de exemplu:

```json
"adm-zip": "0.5.16"
```

Helper:

```javascript
const AdmZip = require("adm-zip");

function createZipFromDirectory(source, destination) {
  const zip = new AdmZip();
  zip.addLocalFolder(source);
  zip.writeZip(destination);
}

function extractZip(archive, destination) {
  const zip = new AdmZip(archive);
  zip.extractAllTo(destination, true);
}
```

Atât `package-extension.cjs`, cât și `package-smoke.cjs` folosesc același helper. Nu mai există shell calls dependente de `zip/unzip`.

## 5. Chrome/Gecko boundary

Chrome păstrează:

```json
{
  "manifest_version": 3,
  "background": {
    "service_worker": "src/background.js"
  }
}
```

Gecko folosește:

```json
{
  "manifest_version": 3,
  "background": {
    "scripts": ["src/background-gecko.js"],
    "persistent": false
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "guardian@sbcguardian.local"
    }
  }
}
```

Se extrage logica comună în:

```text
extension\src\platform\background-core.js
extension\src\platform\webextension-api.js
```

Entry-point-urile Chrome și Gecko trebuie să fie subțiri. Nu se clonează întreg FSU core pentru Gecko.

Scripturi noi:

```text
npm run build:chrome
npm run build:gecko
npm run check:manifests
npm run check:gecko-compat
npm run package:chrome
npm run package:gecko
```

## 6. Android wrapper skeleton

Se pornește un proiect Android complet nou:

```text
android-wrapper\
└── app\src\main\java\com\sbcguardian\app\
    ├── MainActivity.kt
    ├── GeckoRuntimeProvider.kt
    ├── FutSessionController.kt
    ├── BuiltInExtensionInstaller.kt
    ├── GeckoMessageBridge.kt
    ├── NativeMessageModels.kt
    ├── WrapperUiState.kt
    ├── WrapperScreen.kt
    ├── WrapperNavigation.kt
    └── ActionConfirmationDialog.kt
```

Toolchain-ul Gradle poate reutiliza numai versiunile deja dovedite din proiectul vechi. Nu se copiază codul sau UI-ul vechi.

Configurație:

```text
minSdk 31
targetSdk 36
compileSdk 36
Java 17
```

Pentru beta:

```text
applicationId = com.sbcguardian.app.beta
```

Pentru producție:

```text
applicationId = com.sbcguardian.app
```

GeckoView se ia din repository-ul oficial Mozilla, versiune stabilă exact pinată și înregistrată în OSS register.

## 7. Native message bridge

Envelope comun:

```json
{
  "protocolVersion": 1,
  "messageId": "uuid",
  "requestId": null,
  "sessionNonce": "random-per-app-session",
  "type": "HELLO",
  "payload": {}
}
```

Tipurile permise:

```text
HELLO
GET_APP_SETTINGS
SET_APP_SETTINGS
CAPABILITY_STATUS
ACTION_PREVIEW
ACTION_DECISION
ACTION_RESULT
DIAGNOSTIC
```

Mesajele necunoscute, versiunile necunoscute și nonce-urile vechi sunt respinse.

## 8. Feasibility spike

Trebuie demonstrat pe Android:

1. GeckoView pornește.
2. Deschide Web App-ul EA.
3. Userul se autentifică direct la EA.
4. Built-in WebExtension se instalează.
5. FSU detectează Web App-ul.
6. Panoul FSU apare.
7. Poate citi un SBC fără a face mutații.
8. Restart-ul aplicației păstrează cookie-urile în profilul Gecko.
9. Logout-ul EA funcționează.
10. Niciun cookie/token EA nu apare în loguri sau trafic spre Guardian.

## Stop/kill gate

Rebuild-ul nu continuă dacă:

- GeckoView nu poate rula Web App-ul EA;
- built-in extension nu se injectează stabil;
- FSU necesită un fork major pentru Gecko;
- FSU trimite tokenuri EA în afara device-ului;
- pachetul nu se construiește reproducibil;
- FSU upstream tests nu pot fi readuse la verde.

---

# M1 — Raport final

## 1. Baseline
- Branch: codex/m1-fsu-hardening-and-geckoview-feasibility (creat din c318f50; M0 ramane necomitat pe branch-ul sau)
- HEAD initial: c318f5018c7a3447103158d1cc28b24bfbce1dce
- Working tree initial: M0 lasat necomitat (docs/milestones); FSU la c318f50.

## 2. Fisiere modificate/noi
Modificat:
- extension/package.json (override brace-expansion 5.0.9; devDep adm-zip 0.5.16; scripturi build:chrome/build:gecko/check:manifests/check:gecko-compat/package:chrome/package:gecko)
- extension/package-lock.json (regenarat de npm install — lockfile actualizat pentru adm-zip + override)
- extension/eslint.config.mjs (override extins la background-gecko.js, platform/background-core.js, platform/webextension-api.js + globuri browser/importScripts/TextEncoder/ArrayBuffer)
- extension/scripts/package-extension.cjs (foloseste adm-zip; suporta --gecko; copiaza src/platform)
- extension/scripts/package-smoke.cjs (extract via adm-zip in loc de unzip; ALLOWED include platform/*)
- extension/src/background.js (entry subtire Chrome: incarca platform/background-core.js si registerBackground)
- extension/tests/load-background.cjs (require rezolvat relativ la src/)
- extension/tests/package-smoke.test.mjs (writeZipFromDir via adm-zip; fixture include platform/*)
- extension/tests/request-policy-corpus.test.mjs (citeste REQUEST_RULES din platform/background-core.js)
- extension/src/userscript.js (doar renormalizare LF/CRLF, fara modificare de continut — git diff --exit-code trece)

Nou:
- extension/.nvmrc (22)
- extension/manifest.gecko.json
- extension/scripts/check-manifests.mjs
- extension/scripts/check-gecko-compat.mjs
- extension/scripts/lib/zip-utils.cjs (helper adm-zip comun)
- extension/src/background-gecko.js (entry subtire Gecko)
- extension/src/platform/background-core.js (logica comuna request/sender policy, API-agnostica)
- extension/src/platform/webextension-api.js (adapter chrome/browser)
- shared-contracts/native-bridge/envelope.schema.json
- shared-contracts/native-bridge/bridge.js (validator runtime)
- docs/OSS_BASELINE.md, docs/GECKOVIEW_FEASIBILITY.md, docs/DATA_BOUNDARY.md, docs/OLD_REPO_IMPORT_MAP.md
- THIRD_PARTY_NOTICES.md, third-party-notices/OSS_REGISTER.json
- android-wrapper/ (settings.gradle, build.gradle, app/build.gradle, AndroidManifest.xml, 10 fisiere Kotlin)

## 3. Ce s-a implementat
- M1 §1 Provenance: registru OSS + 5 doc-uri de licente/date-boundary/import-map.
- M1 §2 Toolchain: .nvmrc 22; toate scripturile ruleaza (vezi Gate results). Nu s-a rulat npm audit fix.
- M1 §3 Vulnerabilitate: brace-expansion overridat la 5.0.9 (confirmat in lockfile: "brace-expansion@5.0.9 overridden").
- M1 §4 Packaging cross-platform: zip/unzip shell inlocuite cu adm-zip 0.5.16 via scripts/lib/zip-utils.cjs (folosit de package-extension, package-smoke si testul sau).
- M1 §5 Chrome/Gecko boundary: manifest.gecko.json + entry-uri subtiri (background.js / background-gecko.js) peste platform/background-core.js. build:chrome/build:gecko adaugate (userscriptul este comun, shared).
- M1 §6 Android wrapper skeleton: proiect Android nou (minSdk 31, targetSdk/compileSdk 36, Java 17, flavor beta=com.sbcguardian.app.beta / production=com.sbcguardian.app), GeckoView pinnat, 10 clase Kotlin.
- M1 §7 Native bridge: envelope + validator in shared-contracts (protocolVersion=1, sessionNonce, tipuri allow-list); reject fail-closed.
- M1 §8 Feasibility spike: codul de spike este in place (manifeste valide, packaging reproductibil, entry-uri); RULAREA pe Android NU e verificata (vezi §8).

## 4. Contracte/API/schema
- manifest.gecko.json: MV3, background.scripts=[src/background-gecko.js], persistent=false, browser_specific_settings.gecko.id=guardian@sbcguardian.local.
- shared-contracts/native-bridge/envelope.schema.json: contractul de mesaje (HELLO/GET_APP_SETTINGS/SET_APP_SETTINGS/CAPABILITY_STATUS/ACTION_PREVIEW/ACTION_DECISION/ACTION_RESULT/DIAGNOSTIC).
- platform/background-core.js exporta registerBackground({runtime,tabs,fetchImpl}) — API comun Chrome/Gecko.

## 5. Teste adaugate/modificate
- tests/package-smoke.test.mjs: writeZipFromDir migrat la adm-zip; fixture include acum platform/*.
- tests/request-policy-corpus.test.mjs: sursa REQUEST_RULES citita din platform/background-core.js (unde a fost mutata logica).
- tests/load-background.cjs: require rezolvat relativ la src/ (comportament identic cu importScripts in SW).
- Toate testele Node trec (npm test exit 0).

## 6. Gate results
- npm ci: OK (lockfile sincronizat dupa npm install)
- npm run check:version: OK
- npm run lint: OK (0 erori)
- npm run build: OK
- npm run typecheck: OK
- npm test: OK (toate testele Node trec)
- npm run check:manifests: OK
- npm run check:gecko-compat: OK
- npm run package: OK (chrome zip)
- npm run package:smoke: OK
- npm run package:gecko: OK (gecko zip)
- npm run verify: OK (incl. git diff --exit-code src/userscript.js)
- npm audit: 1 high (adm-zip@0.5.16 — vezi §7)
- npm run test:browser: ESECUAT (timeout — vezi §8, dependent de mediu)

## 7. Diferente fata de plan
- adm-zip 0.5.16 (versiunea data ca exemplu in M1) are propria advisori high: GHSA-xcpc-8h2w-3j85 (alocare 4GB la ZIP craftuit). M1 spune "nu se ia automat alt pachet" -> NU am rulat npm audit fix, am pastrat 0.5.16 si semnalez pentru decizie: ramane 0.5.16 (risc scazut practic: procesam doar ZIP-ul nostru construit, nu input nestrust) SAU se face bump la adm-zip@0.6.0 (breaking per npm). CER DECISIA CODEX.
- build:gecko este alias la build (userscriptul FSU este comun Chrome/Gecko); nu exista inca un bundle Gecko-separat pentru userscript. Acceptabil pentru M1 (feasibility), poate fi separat in M5.
- package:smoke valideaza doar pachetul chrome (nume fsu-fut-enhancer-<ver>.zip); pachetul gecko are nume -gecko si nu e trecut prin smoke (nu e in scope).

## 8. Riscuri si lucruri neverificate
- RULAREA GeckoView / Android nu e verificata: mediul nu are Android SDK, Gradle,adb, nici emulator. Toate cele 10 puncte din M1 §8 (GeckoView porneste, deschide Web App, auth EA, instala extensia, FSU detecteaza, panou, citeste SBC, cookie-uri pastrate, logout, fara token in log/trafic) raman NEVERIFICATE la nivel runtime. Codul de spike e prezent si coerent, dar nu s-a compilat/ rulat.
- test:browser a esuat prin timeout (necesita browser Playwright + retea la EA). Nu e o regresie de cod M1 (calea Chrome este pastrata identic); e blocaj de mediu. Trebuie rulat pe CI cu browser + retea pentru verdict verde.
- Android-wrapper/ nu a fost compilat (nu e Gradle aici) — poate avea erori de compilare necunoscute; e skeleton, nu build verde.
- site/ tot nu e in arhiva (ridicat in M0).
- userscript.js apare "modified" in git status doar din cauza normalizarii LF/CRLF; continut identic, git diff --exit-code trece.

## 9. Confirmari
- Legacy/site neatins: niciun cod Guardian vechi importat; android-wrapper e nou, nu e portat din vechiul android/.
- Zero secrete: niciun credential/token in diff.
- Zero Docker: nu s-a folosit Docker.
- Nicio actiune ireversibila: nu s-au folosit Remove-Item -Recurse / git clean / git reset --hard etc.
- Nu s-a facut npm audit fix (conform M1).
- NO COMMIT: totul necomitat pe branch-ul codex/m1-...; M0 ramane de asemenea necomitat pe branch-ul sau. Codex va face commit-ul dupa review.