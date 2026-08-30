M4_AUTH_STRIPE_ADMIN_AND_ACCOUNT_MIGRATION.md

## Obiectiv

Adăugăm identitatea reală, rolurile, abonamentul Stripe, portalul web și migrarea selectivă a conturilor.

## Auth0

Roluri:

```text
PRINCIPAL_ADMIN
ADMIN
SUBSCRIBER
```

Flow Android:

```text
Android Custom Tab/Auth0 PKCE
→ backend callback/exchange
→ device session
→ refresh rotation
→ token criptat în Android Keystore
→ token scurt transmis extensiei numai în memorie
```

Flow desktop:

```text
FSU → one-time pairing → user Auth0 login → scoped device session
```

Nu se pune token Auth0 în page DOM, logs sau FSU storage.

Endpoints:

```text
GET  /api/v2/auth/login
GET  /api/v2/auth/callback
POST /api/v2/auth/logout
GET  /api/v2/auth/me

POST /api/v2/pairings
POST /api/v2/pairings/claim
POST /api/v2/device-sessions/refresh
POST /api/v2/device-sessions/revoke
```

Dacă Auth0 issuer-ul nou este diferit de cel legacy:

- parolele nu se copiază;
- userul face login în tenantul nou;
- identity linking se face numai după email verificat;
- emailul neverificat nu poate prelua un cont vechi;
- legacy subject se păstrează doar în metadata de audit.

Principalul se configurează prin secret:

```text
SBC_PRINCIPAL_ADMIN_EMAIL
```

Valoarea nu se hardcodează în Git.

## Access matrix

```text
PRINCIPAL_ADMIN                  → FULL
ADMIN                            → FULL
SUBSCRIBER + ACTIVE              → FULL
SUBSCRIBER + GRACE               → FULL_WITH_WARNING
SUBSCRIBER + TRIAL               → FULL
SUBSCRIBER + ON_HOLD             → PAYWALL
SUBSCRIBER + EXPIRED/CANCELED    → PAYWALL
```

Serverul este singura sursă pentru acces. Clientul nu reconstruiește local entitlement-ul.

## Stripe

Produs:

```text
SBC Guardian Monthly
USD 9.99/month
7-day trial
```

ID-urile reale vin din environment:

```text
SBC_STRIPE_SECRET_KEY
SBC_STRIPE_WEBHOOK_SECRET
SBC_STRIPE_PRICE_MONTHLY
SBC_STRIPE_SUCCESS_URL
SBC_STRIPE_CANCEL_URL
```

Endpoints:

```text
POST /api/v2/billing/checkout
POST /api/v2/billing/portal
POST /api/v2/billing/stripe/webhook
GET  /api/v2/access
```

Webhook-ul:

- verifică semnătura;
- este idempotent;
- validează customer/account binding;
- nu acceptă optimistic unlock;
- reconciliază subscription state;
- tratează trial, active, past_due, canceled;
- nu loghează payload complet.

Android deschide Stripe Checkout/Portal în browser. Prețul afișat vine din backend/Stripe, nu este hardcodat în UI.

## Admin Center web

```text
web-portal\src\
├── account\
├── billing\
└── admin\
    ├── UsersPage
    ├── UserDetailPage
    ├── RoleDialog
    ├── ScoringRulesetsPage
    ├── TaxonomyReviewPage
    └── AuditPage
```

Matrice:

```text
Principal:
- users
- entitlement
- scoring
- taxonomy
- grant/revoke admin
- audit

Admin:
- users
- entitlement
- scoring
- taxonomy
- audit
- NU poate grant/revoke admin

Subscriber:
- account propriu
- subscription
- privacy/export/delete
```

Principalul nu poate fi demis sau șters.

Orice mutație admin:

- cere motiv;
- are rate limit;
- este atomică cu audit event;
- revocarea invalidează imediat sesiunile.

## Migrare selectivă

Se importă numai:

```text
users/accounts
Auth0 identity mapping
roles
entitlement state + expiry
audit events
```

Nu se importă:

```text
EA sessions/cookies
pairing codes
device sessions
refresh tokens
browser sessions
Google Play tokens
RTDN
billing queues
club snapshots
Guardian policies
solutions
submission ledger
OCR corrections
operational events
old scoring registry
site/
```

Script:

```powershell
python -m guardian_cloud.migrate_legacy --dry-run
python -m guardian_cloud.migrate_legacy --verify
python -m guardian_cloud.migrate_legacy --apply
```

`--apply` cere explicit:

```text
source DSN
target DSN
migration batch ID
backup path
confirmation phrase
```

Entitlement legacy:

- expiry valid cunoscut → acces până la acel expiry;
- ACTIVE/GRACE fără expiry → 7 zile `LEGACY_MIGRATION_GRACE`;
- expired/canceled → PAYWALL;
- Stripe devine autoritatea după primul webhook valid;
- niciun Google token nu este copiat.

## Acceptare M4

- login/logout real;
- token rotation/revocation;
- old token invalid după revoke;
- Principal immutable;
- subscriber primește 403 pe admin;
- Stripe webhook replay este no-op;
- checkout dublu nu creează două sesiuni active;
- export/delete funcționează;
- dry-run și rehearsal migration au aceleași counts;
- zero secrets în Git/logs.

---

# M4 — Raport final

## 1. Baseline
Ramas de pe `c318f50` (FSU), peste M3 (`guardian-cloud` backend v2 + domain). Branch nou: `codex/m4-auth-stripe-admin-and-account-migration`. Nu s-a șters nimic din M0–M3. Auth0 și Stripe reale nu există în mediu → am abstractizat după adaptere (`Auth0Client`, `StripeAdapter`) și am testat cu fake-uri; secretul `SBC_PRINCIPAL_ADMIN_EMAIL` și `SBC_STRIPE_WEBHOOK_SECRET` se citesc din env la runtime (niciun hardcode).

## 2. Fișiere (NOI în M4)
- `guardian-cloud/src/guardian_cloud/domain/access.py` — `compute_access(role, entitlement_state)` (server = singura sursă de adevăr pentru access matrix).
- `guardian-cloud/src/guardian_cloud/domain/auth.py` — PKCE + `hash_token` + protocol `Auth0Client`.
- `guardian-cloud/src/guardian_cloud/domain/stripe.py` — `verify_webhook_signature` (HMAC-SHA256, format `t=,v1=`) + `reconcile_event` (mapare Stripe → entitlement).
- `guardian-cloud/src/guardian_cloud/api/auth.py` — `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/me`.
- `guardian-cloud/src/guardian_cloud/api/pairings.py` — `POST /pairings`, `POST /pairings/claim`.
- `guardian-cloud/src/guardian_cloud/api/device_sessions.py` — `/device-sessions/refresh` (rotație), `/device-sessions/revoke`.
- `guardian-cloud/src/guardian_cloud/api/billing.py` — `/billing/checkout` (idempotent), `/billing/portal`, `/billing/stripe/webhook` (semnat + idempotent), `GET /access`.
- `guardian-cloud/src/guardian_cloud/api/admin.py` — `/admin/users`, `/admin/users/{id}`, `/admin/users/{id}/role` (cere motiv, audit), `/admin/users/{id}/revoke`.
- `guardian-cloud/src/guardian_cloud/api/deps.py` — `get_session_account` (validează nonce sesiune), `require_admin` (403 dacă nu admin), adaptere injectabile `auth0_client`/`stripe_adapter`.
- `guardian-cloud/src/guardian_cloud/migrate_legacy.py` — CLI `--dry-run/--verify/--apply` (import SELECTIV doar entități permise).
- `guardian-cloud/src/guardian_cloud/persistence/models.py` — `Account.role/email`, `DeviceSession.token_hash/refresh_token_hash/revoked/last_rotated_at`, tabel nou `Pairings`, `IdempotencyRecord.value`.
- `guardian-cloud/src/guardian_cloud/persistence/repository.py` — device-session rotate/revoke/validate, pairings, `set_account_role` (principal imutabil), `get_account_by_email`, `get_latest_entitlement`, `set_entitlement`, `record_audit`, idempotency cu upsert valoare.
- `web-portal/` — scaffold React (package.json + `src/App.jsx`, `account/`, `billing/`, `admin/` pages) — structură documentată, NE-build-uit/NE-rulat aici.
- Teste: `tests/test_access_matrix.py`, `tests/test_auth_flow.py`, `tests/test_migrate_legacy.py`.

## 3. Ce s-a implementat
- Auth0 PKCE (login → callback exchange → device session cu token hash; Auth0 token NU ajunge în DOM/logs, se returnează doar `session_nonce` propriu).
- Rotație sesiune: `/device-sessions/refresh` creează nonce nou și marchează vechiul `revoked` → vechiul nonce invalid imediat. Revocare: `/auth/logout` și `/device-sessions/revoke` invalidează sesiunea.
- Access matrix computat DOAR server-side (`compute_access`); clientul nu reconstruiește entitlement.
- Pairing one-time (cod expiră) + claim de către sesiunea autentificată.
- Stripe: checkout idempotent (aceeași `idempotency_key` → un singur apel adapter, același `session_id`); portal idempotent; webhook verifică semnătura HMAC, e idempotent pe `event.id` (replay = no-op), reconcilează entitlement (ACTIVE/GRACE/CANCELED) și NU loghează payload-ul complet (doar `id`+`type`).
- Admin: `require_admin` → subscriber primește 403; schimbarea rolului cere `reason` și scrie audit event; revocarea șterge imediat sesiunile; `PRINCIPAL_ADMIN` nu poate fi demis (PermissionError).
- Migrare selectivă: importă doar accounts/roles/entitlements/audit; EXCLUDE explicit tot ce e în lista M4 (EA sessions, cookies, pairing/device/refresh tokens, Google Play, RTDN, billing queues, snapshots, policies, solutions, etc.). `--apply` cere `confirmation-phrase="MIGRATE LEGACY"`. Entitlement legacy fără expiry → `LEGACY_MIGRATION_GRACE` (7 zile) ACTIVE/GRACE.

## 4. Contracte / API / schema
- Rute noi: `GET /api/v2/auth/login`, `GET /api/v2/auth/callback`, `POST /api/v2/auth/logout`, `GET /api/v2/auth/me`, `POST /api/v2/pairings`, `POST /api/v2/pairings/claim`, `POST /api/v2/device-sessions/refresh`, `POST /api/v2/device-sessions/revoke`, `POST /api/v2/billing/checkout`, `POST /api/v2/billing/portal`, `POST /api/v2/billing/stripe/webhook`, `GET /api/v2/access`, `GET/POST /api/v2/admin/users...`.
- Headere: `X-Guardian-Session: <nonce>` pentru rute protejate (înlocuiește headerul dev `X-Guardian-Account` pentru noile rute).
- Schema v2 (migrarea `20260827_0001_v2_base` folosește `Base.metadata.create_all`): adaugă `accounts.role/email`, `device_sessions.token_hash/refresh_token_hash/revoked/last_rotated_at`, tabel `pairings`, `idempotency_records.value`.
- `requirements.in` (M3) rămâne suficient — M4 nu aduce dependențe noi (fastapi/sqlalchemy/pydantic/ortools deja prezente).

## 5. Teste
- `pytest -q` → **35 passed** (incl. noile `test_access_matrix`, `test_auth_flow`, `test_migrate_legacy` + cele M3).
- `test_access_matrix`: toate combinațiile access matrix.
- `test_auth_flow`: login returnează URL; callback→me→logout (nonce invalid după logout = 401); rotație invalidează nonce vechi; principal imutabil (demitere respinsă 400); subscriber 403 pe `/admin/users`; admin listează; checkout idempotent (același `session_id`, un singur apel adapter); webhook replay = no-op + semnătură greșită → 400.
- `test_migrate_legacy`: `dry-run` counts == `apply` counts; `--apply` fără phrase → PermissionError; cont + entitlement create în v2.

## 6. Gate results
- `ruff check .` → **All checks passed!**
- `pytest -q` → **35 passed**
- `alembic heads` → `20260827_0001_v2_base` (single head). `alembic upgrade head`/`current` necesită PostgreSQL (indisponibil în mediu) → validat prin `tests/test_migration.py` (creare schema pe SQLite, include `pairings`/`device_sessions`) care trece.

## 7. Diferențe față de plan
- `web-portal/` este scaffold (pagini React minimale), NU build-uit/derulat aici — frontend-ul complet rămâne de implementat/verificat în CI separat (npm install + vite build).
- Auth0/Stripe sunt adaptere; integrarea reală (tenant, chei, Android Custom Tab, Keystore) se face la wiring, cu secrete din env, nu în M4.
- Migrarea folosește un `LegacySource` cu schema legacy așteptată (accounts/account_roles/entitlements/audit_events/auth0_identities); maparea exactă a DB-ului legacy real (din arhivă) poate necesita ajustări la cutover — logica de excludere e deja completă.

## 8. Riscuri
- **PostgreSQL real** indisponibil → `upgrade head`/`current` nerulate pe PG; izolare row-lock/race nerulate (validate doar pe SQLite).
- **`requirements.lock` cu hash-uri** nu e generat (pip-compile n-a rulat) — rămâne de făcut de Codex.
- **web-portal** nu e verificat (fără build) — risc de eroare de compilare la primul `npm run build`; paginile sunt stub-uri funcționale.
- Exact item-ID parity vs legacy OR-Tools rămâne din M3 (status parity verificat).
- `adm-zip@0.5.16` advisory (din M1) rămâne deschis — încă aștept decizia ta.

## 9. Confirmări (acceptare M4)
- login/logout real (prin adapter) ✔; token rotation/revocation ✔ (nonce vechi invalid după revoke/rotate).
- old token invalid după revoke ✔; Principal imutabil ✔.
- subscriber 403 pe admin ✔; Stripe webhook replay = no-op ✔; checkout dublu → un singur session_id ✔.
- export/delete (din M3 `/api/v2/account/*`) ✔ (testat în M3).
- dry-run și apply au aceleași counts ✔; zero secrets în Git/logs ✔ (secrete doar din env, nicăieri în cod).

NECOMIS — așteaptă review/commit (la fel M0–M3).

