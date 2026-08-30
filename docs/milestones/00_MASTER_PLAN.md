SBC Guardian Rebuild — plan livrat în fișiere `.md` separate

## 1. Pachetul de documente

Înainte de orice curățenie sau modificare de cod, se creează:

```text
C:\Users\razva\OneDrive\Documente\ChatGPT\SBC\SBCGuardian-Rebuild-Plan\
├── 00_MASTER_PLAN.md
├── M0_SAFE_CLEANUP_AND_FSU_BOOTSTRAP.md
├── M1_FSU_HARDENING_AND_GECKOVIEW_FEASIBILITY.md
├── M2_GUARDIAN_UX_AND_SHARED_CONTRACTS.md
├── M3_GUARDIAN_CLOUD_V2_AND_DOMAIN_MIGRATION.md
├── M4_AUTH_STRIPE_ADMIN_AND_ACCOUNT_MIGRATION.md
├── M5_FC26_FULL_PRODUCT_AND_ANDROID_BETA.md
├── M6_HETZNER_STAGING_BETA_AND_CUTOVER.md
└── M7_FC27_ACTIVATION_AND_LEGACY_RETIREMENT.md
```

După ce M0 creează noul repo FSU, întregul pachet se copiază în:

```text
C:\BOTS\SBCGuardian\docs\milestones\
```

Nu comprimăm planul într-un singur document. Fiecare milestone este autonom și poate fi dat separat lui OX.

---

# `00_MASTER_PLAN.md`

## Obiectiv

Reconstruim SBC Guardian de la zero, pornind din FSU FUT Enhancer, nu din aplicația Guardian veche.

Produsul final este:

- o extensie FSU adaptată pentru desktop;
- un APK Android sideload;
- Android folosește GeckoView și deschide EA FUT Web App;
- Guardian este injectat contextual peste Web App;
- fără vechile ecrane separate `Club / Solve / Guardian / Me`;
- backend nou, API v2 și bază PostgreSQL nouă;
- solverele, Guardian, Auth0, rolurile și datele utile sunt importate selectiv;
- plăți Stripe web, nu Google Play;
- FC26 complet primul;
- FC27 activat numai după reguli live verificate;
- fără Docker;
- Hetzner rămâne serverul de producție.

## OSS oficial

Fundația principală:

```text
Repository: https://github.com/color8892/fsu-fut-enhancer
License: MIT
Pinned commit: c318f5018c7a3447103158d1cc28b24bfbce1dce
Audited version: 26.10.0
```

Fundația Android:

```text
Mozilla GeckoView
License: MPL-2.0
Documentation:
https://mozilla.github.io/geckoview/consumer/docs/web-extensions
```

PaLeTools, FUTBIN și EasySBC sunt folosite doar ca inspirație UX/product. Nu copiem cod, asset-uri, texte sau branding dacă nu avem o licență OSS verificabilă.

## Reguli de arhitectură

1. Noul Git root provine din istoricul FSU.
2. Codul vechi nu devine fundație.
3. Nu importăm vechiul Android UI.
4. Nu importăm vechea extensie.
5. Nu importăm `site/`.
6. `extension/src/userscript.js` este generated; nu se editează manual.
7. EA credentials, cookies, `X-UT-SID` și tokenurile EA nu părăsesc GeckoView/browserul.
8. Cloud-ul primește numai snapshoturi normalizate.
9. Nicio acțiune EA ireversibilă nu rulează fără confirmare explicită.
10. Nu există auto-submit ascuns.
11. Nu există fallback inventat pentru FC27 scoring.
12. Prețurile sunt opționale; solverul trebuie să funcționeze fără ele.
13. Toate funcțiile FSU sunt vizibile. Funcțiile fără provider legal/funcțional rămân vizibile cu explicație, dar fail-closed.
14. Nu folosim Docker.
15. Nu ștergem definitiv arhivele legacy fără o nouă confirmare explicită.

## Workflow OX → Codex

Pentru fiecare milestone:

1. Se pornește numai din ultimul commit auditat.
2. Se creează branch:

```powershell
git switch -c codex/mX-short-name
```

3. OX implementează numai milestone-ul primit.
4. OX nu începe milestone-ul următor.
5. OX nu face commit.
6. OX rulează toate gate-urile cerute.
7. OX livrează raportul și lasă diff-ul necomitat.
8. Codex verifică efectiv codul și testele.
9. Dacă există defecte, Codex oferă instrucțiuni exacte de reparație.
10. Numai după verdict verde, Codex face commit și integrează branch-ul.
11. Dacă arhitectura este fundamental greșită, milestone-ul se reface din checkpoint; nu se aplică zeci de patch-uri succesive.

## Format obligatoriu al raportului OX

Fiecare `.md` include la final acest format:

```markdown
# Mx — Raport final

## 1. Baseline
- Branch:
- HEAD inițial:
- Working tree inițial:

## 2. Fișiere modificate/noi
- listă completă și scopul fiecăruia

## 3. Ce s-a implementat
- mapping cerință → cod

## 4. Contracte/API/schema
- requesturi, răspunsuri, migrations

## 5. Teste adăugate
- nume și comportamentul verificat

## 6. Gate results
- fiecare comandă și rezultatul exact

## 7. Diferențe față de plan
- nimic ascuns; orice abatere explicată

## 8. Riscuri și lucruri neverificate
- fără afirmații presupuse

## 9. Confirmări
- legacy/site neatins unde este cerut
- zero secrete
- zero Docker
- NO COMMIT
```



Acceptare finală

Proiectul este finalizat când:

- FC26 funcționează complet;
- FC27 funcționează numai cu reguli verificate;
- Android este un wrapper coerent peste EA Web App;
- UX-ul vechi nu există în noul repo;
- toate acțiunile ireversibile cer confirmare;
- FSU Chrome și Gecko builds sunt verzi;
- Auth0, Stripe, Admin și privacy sunt verzi;
- serverul rulează fără Docker;
- backup și rollback sunt demonstrate;
- vechiul sistem este dezactivat;
- orice ștergere legacy a avut confirmare explicită.

## Presupuneri fixate

- Noul root final este `C:\BOTS\SBCGuardian`.
- FSU este baza primară.
- GeckoView este singura a doua fundație majoră.
- APK-ul este sideload.
- Stripe este folosit pentru $9.99/lună și trial de 7 zile.
- FC26 este prima versiune publică.
- FC27 nu este activat din presupuneri.
- UI este English-first cu română completă.
- Repo-ul rămâne privat.
- Vechiul `site/` este arhivat, nu importat.
- Nu folosim Docker sau Storage Box.
- Nu ștergem definitiv nimic legacy înainte de stabilizare și confirmare separată.
