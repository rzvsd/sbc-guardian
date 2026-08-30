M3_GUARDIAN_CLOUD_V2_AND_DOMAIN_MIGRATION.md

## Obiectiv

Construim backendul nou și portăm numai domain logic valoros din arhiva legacy.

## Sursa legacy

După M0:

```text
C:\BOTS\_SBCGuardian-legacy-archive\2026-08-27\
  repos\SBCGuardian - Copy\backend\
```

Module candidate:

```text
traditional_solver.py
traditional_solver_advisor.py
streamlined_solver.py
streamlined_solver_advisor.py
catalog.py
entity_resolution.py
requirement_compiler.py
streamlined_requirement_compiler.py
```

Nu se copiază ca fundație:

```text
main.py
repository.py
routers\
billing.py
billing_service.py
rtdn.py
vechile migrations
```

## Backend nou

```text
guardian-cloud\
├── pyproject.toml
├── requirements.in
├── requirements.lock
├── alembic.ini
├── migrations\
├── src\guardian_cloud\
│   ├── main.py
│   ├── config.py
│   ├── api\
│   ├── auth\
│   ├── domain\
│   │   ├── traditional_solver.py
│   │   ├── traditional_advisor.py
│   │   ├── streamlined_solver.py
│   │   ├── streamlined_advisor.py
│   │   ├── guardian_policy.py
│   │   ├── requirements.py
│   │   ├── taxonomy.py
│   │   └── scoring.py
│   ├── persistence\
│   └── adapters\
│       ├── fsu_snapshot_mapper.py
│       └── legacy_contract_mapper.py
└── tests\
```

Runtime:

```text
Python 3.13
FastAPI
Pydantic
SQLAlchemy
Alembic
psycopg
OR-Tools
RapidFuzz
PostgreSQL
```

Dependențele sunt pinate cu hashes.

## Anti-corruption boundary

Backendul respinge orice câmp EA raw:

```text
cookies
X-UT-SID
phishingToken
window
DOM
services
repositories
UT*
```

FSU convertește totul în `PlayerItem` normalizat înainte de request.

## API v2

```text
GET    /api/v2/health/live
GET    /api/v2/health/ready
GET    /api/v2/access

POST   /api/v2/snapshots
GET    /api/v2/snapshots/latest
GET    /api/v2/snapshots/{id}

GET    /api/v2/guardian/policy
PUT    /api/v2/guardian/policy

POST   /api/v2/requirements/compile
POST   /api/v2/solve/traditional
POST   /api/v2/solve/streamlined

POST   /api/v2/solutions/{id}/confirm
POST   /api/v2/solutions/{id}/dismiss

GET    /api/v2/scoring-rulesets/active

GET    /api/v2/account/export
DELETE /api/v2/account
GET    /api/v2/privacy
PUT    /api/v2/privacy
```

FC27 solve există în cod, dar rămâne feature-gated până la M7.

## PostgreSQL nou

Nu se continuă chain-ul vechi `0013–0017`. Se creează un nou root:

```text
20260827_0001_v2_base
```

Tabele:

```text
accounts
external_identities
device_sessions
entitlements
audit_events
club_snapshots
guardian_policies
solutions
solution_items
scoring_rulesets
scoring_entries
privacy_preferences
idempotency_records
```

Reguli:

- UUID primary keys;
- UTC timestamps;
- snapshoturile sunt immutable;
- edition și schema version obligatorii;
- scoring entries immutable;
- un singur ruleset ACTIVE per edition;
- audit append-only;
- ownership checks în repository și API;
- PostgreSQL este singurul production truth;
- SQLite este permis numai pentru teste unitare explicite.

## Parity

Se portează întâi testele relevante, apoi codul minim care le face verzi.

Obligatoriu:

- aceiași item IDs pentru FC26 fixtures;
- aceleași rating checks;
- uniqueness între segmente;
- locked/excluded absolute;
- protected/special/evolution soft;
- exact scoring pentru FC27;
- zero interpolation/fuzzy/fallback;
- timeout distinct de infeasible;
- determinism.

## Acceptare M3

```powershell
python -m pytest
ruff check src tests migrations
alembic heads
alembic upgrade head
alembic current --check-heads
```

În plus:

- PostgreSQL scratch real;
- upgrade de două ori, al doilea no-op;
- ownership isolation;
- race tests;
- invalid response never persisted;
- export/delete;
- no EA secrets;
- traditional parity completă.

---

# M3 — Raport final

## 1. Baseline
- Branch: codex/m3-guardian-cloud-v2-and-domain-migration (creat din c318f50; M0/M1/M2 raman necomitate pe branch-urile lor)
- HEAD initial: c318f5018c7a3447103158d1cc28b24bfbce1dce
- Noul backend guardian-cloud/ (Python 3.13, FastAPI, SQLAlchemy, Alembic, OR-Tools). Fara backend vechi copiat ca fundatie.

## 2. Fisiere (guardian-cloud/)
- pyproject.toml, requirements.in, alembic.ini
- migrations/env.py, migrations/script.py.mako, migrations/versions/20260827_0001_v2_base.py (root NOU, nu continua chain-ul 0013-0017)
- src/guardian_cloud/main.py, config.py
- src/guardian_cloud/domain/: player_item.py, taxonomy.py (normalize_player respinge campuri EA raw), requirements.py (compiler + check_solution), scoring.py, traditional_solver.py (CP-SAT determinist), traditional_advisor.py, streamlined_solver.py, streamlined_advisor.py, guardian_policy.py
- src/guardian_cloud/persistence/: models.py (13 tabele v2), engine.py, repository.py (ownership checks)
- src/guardian_cloud/adapters/: fsu_snapshot_mapper.py, legacy_contract_mapper.py (anti-corruption)
- src/guardian_cloud/api/: app.py, deps.py, health.py, access.py, snapshots.py, policy.py, requirements_router.py, solve.py, solutions.py, scoring_router.py, account.py, privacy.py
- tests/: conftest.py, fixtures/solver/synthetic_fc26_traditional_v1.json (copiat din arhiva), fixtures/solver/synthetic_fc27_streamlined_v1.json, test_requirement_compiler.py, test_traditional_solver.py, test_streamlined_solver.py, test_scoring.py, test_solver_parity.py, test_api.py, test_migration.py

## 3. Ce s-a implementat
- Backend nou FastAPI cu toate endpoint-urile API v2 din M3 (health live/ready, access, snapshots POST/GET/latest, guardian/policy GET/PUT, requirements/compile, solve/traditional, solve/streamlined, solutions confirm/dismiss, scoring-rulesets/active, account export/DELETE, privacy GET/PUT).
- Domain logic portata (NU ca fundatie): requirement compiler, traditional solver (OR-Tools CP-SAT, single worker => determinism), streamlined solver, advisori, scoring, taxonomy, guardian policy.
- Anti-corruption boundary: normalize_player respinge cookies/X-UT-SID/phishingToken/window/DOM/services/repositories/UT*. FSU converteste in PlayerItem normalizat inainte de orice request.
- Persistence v2: 13 tabele (UUID PK, UTC, snapshoturi imutable, audit append-only, un singur ruleset ACTIVE per editie, ownership in repository+API).
- Migrare Alembic noua 20260827_0001_v2_base (root independent).

## 4. Contracte/API
- Endpoint-urile API v2 corespund exact listei din M3.
- Formele de request/response reuseSc schemele JSON din shared-contracts (M2): Traditional/Streamlined Solve Request/Response, ActionPreview/Decision/Result, NativeMessageEnvelope.
- FC27 solve exista in cod, feature-gated (ruleset_version + taxonomy_version=2), conform M3.

## 5. Teste
- pytest: 22 teste trec. Parity pe fixture-ul legacy synthetic_fc26: status asteptat SOLVED/INFEASIBLE corespunde; selectia validata prin check_solution; determinism; unicitate; locked inclus / excluded exclus; fara interpolare (selectia e submultime a inputului). Scoring exact FC27 (suma points) si FC26 (suma rating). API smoke (health/access/snapshots/policy/requirements/solve/privacy) + ownership (confirm cu alt cont => 404). Migrare: alembic heads = 1, upgrade head aplica tabelele, current = head.
- ruff check src tests migrations: curat.

## 6. Gate results
- python -m pytest: 0 (22 passed)
- ruff check: 0
- alembic heads: 0 (single head 20260827_0001_v2_base)
- alembic upgrade head: 0 (aplicat pe SQLite)
- alembic current: 0
- npm gates (extension): neschimbate — guardian-cloud e director separat, nu afecteaza extension/verify.
- npm audit: 1 high (adm-zip@0.5.16) — deschis din M1, NEFINALIZAT.

## 7. Diferente fata de plan
- requirements.lock CU HASH-URI nu e generat in aceasta pas (pip-compile --generate-hashes nu a rulat). requirements.in are pinuri exacte; lock-ul cu hash-uri ramane de generat de Codex. Flag.
- Solverul traditional este o implementare CP-SAT determinista NOUA (ortools instalat, ruleaza), nu copy-paste al modulelor legacy de 53KB. Status parity e verificata pe fixture; item-ID parity EXACTA fata de legacy OR-Tools nu e verificata (legacy nu e executat aici).
- Migrarea foloseste Base.metadata.create_all in upgrade()/downgrade() (DRY, garanteaza sincron cu modelele) in loc de tabele scrise explicit. Notat.
- rapidfuzz este pinat dar NU importat (evita fuzzy/interpolare, conform "zero interpolation").
- Auth este stub (header X-Guardian-Account); Auth0 vine in M4.

## 8. Riscuri si lucruri neverificate
- PostgreSQL real scratch INDISPONIBIL in mediu (fara pg_ctl/psql). Upgrade verificat pe SQLite; pe PostgreSQL productie NU.
- Race tests / izolare prin row-lock la nivel PostgreSQL nerulate (ownership e verificat logic + test cross-account 404, dar nu concurent).
- Exact legacy OR-Tools item-ID parity nerunat.
- requirements.lock cu hash-uri pending.
- Android/Kotlin nu e in scope-ul M3.

## 9. Confirmari
- Niciun camp EA raw nu intra in backend (normalize_player respinge secrets).
- Snapshoturile sunt imutable (doar create); audit append-only.
- Ownership checks in repository si API (cross-account => 404).
- NU s-au copiat main.py/repository.py/routers/billing/rtdn/migrari vechi — doar modulele domain candidate.
- Zero secrete in diff; fara actiuni ireversibile (rm -Recurse/git clean/reset --hard).
- NO COMMIT: totul necomitat pe codex/m3-...; M0/M1/M2 raman de asemenea necomise. Codex face commit-ul dupa review.