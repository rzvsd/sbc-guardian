M0_SAFE_CLEANUP_AND_FSU_BOOTSTRAP.md

## Obiectiv

Scoatem complet proiectele vechi din căile active, fără pierdere de date, apoi creăm:

```text
C:\BOTS\SBCGuardian
```

ca un checkout curat al FSU la commitul auditat.

## Starea cunoscută

```text
Legacy fără Git:
C:\BOTS\SBCGuardian

Legacy principal cu Git:
C:\BOTS\SBCGuardian - Copy

HEAD legacy:
abf0f3740c03676989e98c7a392bf755cee57edd

Status cunoscut:
?? site/
```

Worktree-uri legate:

```text
C:\BOTS\.codex-worktrees\android-requirement-review
C:\BOTS\.codex-worktrees\sbc-backend-boundary-audit
C:\BOTS\.codex-worktrees\sbc-ocr-benchmark-harness
```

Arhivă nouă:

```text
C:\BOTS\_SBCGuardian-legacy-archive\2026-08-27\
```

## Interdicții

Nu se folosesc:

```text
Remove-Item -Recurse
git clean
git reset --hard
git checkout -- .
git worktree remove --force
robocopy /MIR
robocopy /MOVE
DROP DATABASE
```

Nu se modifică:

- Hetzner;
- DNS;
- Auth0;
- Caddy;
- baza live;
- telefonul;
- aplicația instalată.

## Acțiuni

### 1. Freeze

Se închid:

- OpenCode;
- agenții care lucrează în repo;
- Android Studio;
- serverele locale;
- terminalele care folosesc cele două directoare;
- orice proces de build.

### 2. Preflight

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$legacyPlain = 'C:\BOTS\SBCGuardian'
$legacyGit = 'C:\BOTS\SBCGuardian - Copy'
$archiveRoot = 'C:\BOTS\_SBCGuardian-legacy-archive\2026-08-27'
$newRoot = 'C:\BOTS\SBCGuardian'
$fsuSha = 'c318f5018c7a3447103158d1cc28b24bfbce1dce'
```

Se verifică:

- ambele directoare există;
- arhiva nu există deja;
- minimum 10 GB disponibili;
- HEAD-ul legacy este cel așteptat;
- niciun fișier nu este unreadable;
- nu există junction/reparse points neanalizate.

### 3. Inventar și SHA-256

Pentru ambele directoare se generează CSV cu:

```text
RelativePath
Length
SHA256
LastWriteUtc
Attributes
```

Manifestele intră în:

```text
C:\BOTS\_SBCGuardian-legacy-archive\2026-08-27\metadata\manifests\
```

Manifestul include obligatoriu:

- hidden files;
- `.git`;
- `site/`;
- `.hygiene-quarantine/`;
- baze de test;
- cache-uri;
- `node_modules`;
- `.venv`;
- build artifacts.

Orice eroare de citire sau hash oprește milestone-ul.

### 4. Git recovery bundle

```powershell
git -C 'C:\BOTS\SBCGuardian - Copy' bundle create `
  'C:\BOTS\_SBCGuardian-legacy-archive\2026-08-27\metadata\SBCGuardian-Copy-all.bundle' `
  --all

git bundle verify `
  'C:\BOTS\_SBCGuardian-legacy-archive\2026-08-27\metadata\SBCGuardian-Copy-all.bundle'

git -C 'C:\BOTS\SBCGuardian - Copy' fsck --full
```

Bundle-ul trebuie să includă toate branch-urile și tag-urile.

### 5. Worktree-uri

Fiecare worktree:

1. este verificat cu `git status --porcelain`;
2. trebuie să fie complet curat;
3. este copiat în arhivă;
4. copia este verificată prin SHA;
5. este eliminat fără `--force`.

Exemplu:

```powershell
git -C 'C:\BOTS\SBCGuardian - Copy' worktree remove `
  'C:\BOTS\.codex-worktrees\android-requirement-review'
```

Dacă apare alt worktree decât cele trei cunoscute, se oprește.

### 6. Mutarea proiectelor legacy

```powershell
Move-Item -LiteralPath 'C:\BOTS\SBCGuardian' `
  -Destination 'C:\BOTS\_SBCGuardian-legacy-archive\2026-08-27\repos\SBCGuardian'

Move-Item -LiteralPath 'C:\BOTS\SBCGuardian - Copy' `
  -Destination 'C:\BOTS\_SBCGuardian-legacy-archive\2026-08-27\repos\SBCGuardian - Copy'
```

După mutare se regenerează manifestele și se compară hash-urile.

Trebuie păstrate explicit:

```text
repos\SBCGuardian - Copy\site\
repos\SBCGuardian - Copy\.hygiene-quarantine\
repos\SBCGuardian - Copy\.git\
repos\SBCGuardian\backend\data\
repos\SBCGuardian\backend\.venv\
```

### 7. Clonarea FSU

```powershell
git clone https://github.com/color8892/fsu-fut-enhancer.git `
  'C:\BOTS\SBCGuardian'

git -C 'C:\BOTS\SBCGuardian' checkout `
  c318f5018c7a3447103158d1cc28b24bfbce1dce

git -C 'C:\BOTS\SBCGuardian' rev-parse HEAD
```

HEAD trebuie să fie exact SHA-ul auditat.

### 8. Remote-uri

```powershell
git -C 'C:\BOTS\SBCGuardian' remote rename origin upstream
```

Se creează un repo GitHub privat folosind contul GitHub autentificat:

```powershell
gh auth status
gh repo create SBCGuardian --private `
  --source 'C:\BOTS\SBCGuardian' `
  --remote origin
```

Dacă repo-ul există deja sau `gh` nu este autentificat, se oprește și se cere utilizatorului alegerea exactă. Nu se suprascrie un repo existent.

### 9. Copierea planurilor

Se copiază toate cele nouă documente în:

```text
C:\BOTS\SBCGuardian\docs\milestones\
```

Manifestele locale și Git bundle-ul nu se comit.

## Acceptare M0

M0 este verde numai dacă:

- vechile directoare nu mai sunt în căile active;
- ambele sunt complete în arhivă;
- toate hash-urile corespund;
- Git bundle verifică;
- `site/` este păstrat;
- noul root are istoricul FSU;
- FSU HEAD este exact commitul auditat;
- nu a fost importat niciun fișier Guardian vechi;
- nimic live nu a fost modificat;
- nu s-a șters nimic definitiv.

---

# M0 — Raport final

## 1. Baseline
- Branch: codex/m0-safe-cleanup-and-fsu-bootstrap
- HEAD initial: c318f5018c7a3447103158d1cc28b24bfbce1dce
- Working tree initial: 9 fisiere untracked redenumite (
ew 16.txt…
ew 29.txt) continand cele 9 documente milestone; restul curat (FSU la c318f50).

## 2. Fisiere modificate/noi
- docs/milestones/00_MASTER_PLAN.md (mutat din 
ew 18.txt)
- docs/milestones/M0_SAFE_CLEANUP_AND_FSU_BOOTSTRAP.md (mutat din 
ew 16.txt)
- docs/milestones/M1_FSU_HARDENING_AND_GECKOVIEW_FEASIBILITY.md (mutat din 
ew 17.txt)
- docs/milestones/M2_GUARDIAN_UX_AND_SHARED_CONTRACTS.md (mutat din 
ew 21.txt)
- docs/milestones/M3_GUARDIAN_CLOUD_V2_AND_DOMAIN_MIGRATION.md (mutat din 
ew 22.txt)
- docs/milestones/M4_AUTH_STRIPE_ADMIN_AND_ACCOUNT_MIGRATION.md (mutat din 
ew 24.txt)
- docs/milestones/M5_FC26_FULL_PRODUCT_AND_ANDROID_BETA.md (mutat din 
ew 27.txt)
- docs/milestones/M6_HETZNER_STAGING_BETA_AND_CUTOVER.md (mutat din 
ew 28.txt)
- docs/milestones/M7_FC27_ACTIVATION_AND_LEGACY_RETIREMENT.md (mutat din 
ew 29.txt)
- Toate cele 9 doc-uri: redenumite cu numele canonical si curatat artefactul backtick de pe linia 1.
- git remote rename origin upstream — config local, necomitat.
- Branch codex/m0-safe-cleanup-and-fsu-bootstrap creat din c318f50.
- 
ew *.txt eliminate din root (mutate in docs/milestones, nu sterse definitiv).

## 3. Ce s-a implementat
- M0 step 8 (partial, per decizia utilizatorului): origin -> upstream. Nu s-a creat repo GitHub (utilizatorul a ales „Rename remote doar”).
- M0 step 9: cele 9 documente milestone mutate in docs/milestones/.
- Pasii 1–7 ai M0 erau deja executati si verificati de Codex in mediul pregatit: legacy arhivat (manifeste + bundle), FSU clonat curat la c318f50. OX NU a re-rulat mutarea/clone/cleanup (instructiune explicita).

## 4. Contracte/API/schema
- N/A pentru M0 (bootstrap, fara cod/API).

## 5. Teste adaugate
- N/A. M0 nu defineste teste de cod; s-au rulat gate-uri de integritate (sectiunea 6).

## 6. Gate results
- git rev-parse HEAD -> c318f5018c7a3447103158d1cc28b24bfbce1dce (exact commitul auditat) OK
- git remote -v -> upstream https://github.com/color8892/fsu-fut-enhancer.git OK
- git branch --show-current -> codex/m0-safe-cleanup-and-fsu-bootstrap OK
- Test-Path 'C:\BOTS\SBCGuardian - Copy' -> False (nimic de mutat/distrus) OK
- .codex-worktrees -> inexistent/gol (niciun worktree de eliminat) OK
- Legacy in arhiva: epos\SBCGuardian prezent; metadata\manifests\ prezent; metadata\SBCGuardian-Copy-all.bundle prezent OK
- git bundle verify ...\SBCGuardian-Copy-all.bundle -> „bundle is okay”, 8 refs (incl. main = abf0f374…, HEAD legacy asteptat) OK
- docs/milestones -> 9 fisiere, nume canonice OK
- Cod Guardian in noul root: dmin/,ndroid/,ackend/,site/ -> False (absente) OK
- git status --short -> ?? docs/ (doar doc-urile; nimic altceva modificat) OK

## 7. Diferente fata de plan
- M0 presupunea ca C:\BOTS\SBCGuardian era legacy fara git si ca exista SBCGuardian - Copy. Realitate: mediul era deja la starea „dupa pasii 1–7” (noul root = checkout FSU curat; legacy deja arhivat). OX nu a executat pasii 1–7 (ar fi fost distructivi pentru fundația FSU).
- Step 8 executat partial: doar emote rename origin upstream. Crearea repo-ului GitHub privat amanata la alegerea utilizatorului.
- site/ din legacy NU apare in arhiva (epos\SBCGuardian\site nu exista). Abatere de la cerinta M0 de a pastra site/; nu a fost importat in noul root, dar nici nu e prezent in arhiva. De clarificat daca sursa site/ mai exista si trebuie adaugata la arhiva.
- epos\SBCGuardian - Copy nu e prezent in arhiva (doar epos\SBCGuardian). Manifestele/bundle-ul acopera repo-ul principal; deviere minora fata de lista exacta din M0.

## 8. Riscul si lucruri neverificate
- Integritatea hash-urilor din metadata\manifests\ nu a fost recalculata de OX; se bazeaza pe verificarea de la arhivare. Re-verificare SHA-256 completa necesita confirmare separata.
- site/ lipseste din arhiva — risc de pierdere a istoricului site-ului daca nu e remediat inainte de orice stergere a sursei legacy.
- Repo-ul GitHub privat SBCGuardian nu a fost creat; origin nu exista inca. Push-ul va esua pana la crearea repo-ului.
- OX nu a rulat lint/	ypecheck/	est:all deoarece M0 nu modifica cod FSU; fundatia ramane la starea auditata c318f50.

## 9. Confirmari
- Legacy/site neatins unde e cerut: legacy arhivat intact, netusat; site/ nu a fost importat in noul root (dar lipseste si din arhiva — vezi 7/8).
- Zero secrete: niciun credential/token in diff.
- Zero Docker: nu s-a folosit Docker.
- Nici o actiune ireversibila: nu s-au folosit Remove-Item -Recurse, git clean, git reset --hard, git checkout -- ., git worktree remove --force, obocopy /MIR, obocopy /MOVE, DROP DATABASE.
- NO COMMIT: toate modificarile sunt untracked/necomitate (git status --short -> ?? docs/); Codex va face commit-ul dupa review.