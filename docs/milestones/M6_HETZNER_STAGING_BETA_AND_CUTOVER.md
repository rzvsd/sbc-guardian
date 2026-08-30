M6_HETZNER_STAGING_BETA_AND_CUTOVER.md

## Obiectiv

Deploy side-by-side pe serverul Hetzner, beta controlată, apoi cutover verificabil.

## Server cunoscut

```text
IP: 89.167.78.100
Host: sbc-guardian.duckdns.org
SSH key local: C:\Users\razva\.ssh\hetzner_ed25519
OS: Ubuntu 24.04 LTS
```

Tokenul DuckDNS afișat anterior într-un screenshot este considerat expus și trebuie rotit înainte de producție. Nu se reutilizează și nu se scrie în repo.

## Structură server

```text
/opt/sbcguardian-v2/
├── releases/
│   └── <release-id>/
├── current -> releases/<release-id>
└── shared/

/etc/sbcguardian-v2/
├── backend.env
├── auth0.env
├── stripe.env
└── backup.env

/var/log/sbcguardian-v2/
/var/backups/sbcguardian-v2/
```

Permisiuni:

```text
root:root
chmod 600 pentru env
service user: sbcguardian
backend bind: 127.0.0.1:8100
```

## PostgreSQL

Se creează separat:

```text
database: sbc_guardian_v2
role: sbc_guardian_v2
```

Nu se atinge DB-ul vechi în rehearsal.

Ordine:

```bash
createdb scratch_sbc_guardian_v2
alembic upgrade head
alembic current --check-heads
alembic upgrade head
pytest PostgreSQL integration suite
pg_dump scratch
restore into second scratch DB
verify counts and invariants
```

## Systemd

```ini
[Unit]
Description=SBC Guardian v2 API
After=network-online.target postgresql.service

[Service]
User=sbcguardian
WorkingDirectory=/opt/sbcguardian-v2/current/guardian-cloud
EnvironmentFile=/etc/sbcguardian-v2/backend.env
EnvironmentFile=/etc/sbcguardian-v2/auth0.env
EnvironmentFile=/etc/sbcguardian-v2/stripe.env
ExecStart=/opt/sbcguardian-v2/current/.venv/bin/uvicorn guardian_cloud.main:app --host 127.0.0.1 --port 8100
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

## Caddy side-by-side

În prima etapă:

```caddy
sbc-guardian.duckdns.org {
    encode zstd gzip

    handle /api/v2/* {
        reverse_proxy 127.0.0.1:8100
    }

    handle /v2/* {
        reverse_proxy 127.0.0.1:3100
    }

    handle {
        reverse_proxy 127.0.0.1:<OLD_PORT>
    }
}
```

După cutover, noul portal devine root. `/api/v1` poate rămâne temporar pentru rollback.

## Firewall

```text
22/tcp  → doar IP-ul administrativ curent
80/tcp  → public
443/tcp → public
8100    → niciodată public
PostgreSQL → loopback/private only
```

Înainte de a elimina regula SSH veche se testează o a doua sesiune SSH cu noua regulă.

## Secrete

Nu se pun în:

- Git;
- milestone docs;
- screenshots;
- command history;
- logs.

Secretele sunt scrise direct în `/etc/sbcguardian-v2/*.env`, root-only.

## Backup gratuit

Fără Storage Box și fără add-on plătit:

1. timer server face `pg_dump`;
2. dump-ul este criptat cu o cheie publică `age`;
3. Windows Scheduled Task îl descarcă prin SSH în:

```text
C:\BOTS\_backups\SBCGuardian\
```

4. cheia privată rămâne numai pe PC;
5. se face restore drill înainte de cutover.

Dacă PC-ul nu a preluat un backup recent, cutover-ul este blocat.

## Cutover

1. Backup DB vechi.
2. Freeze temporar pe vechile write-uri.
3. Dry-run migrare conturi.
4. Apply migrare în DB v2.
5. Verificare accounts/roles/entitlements/audit.
6. Deploy release cu SHA verificat.
7. Auth0 smoke.
8. Stripe test webhook.
9. FC26 browser smoke.
10. Android beta smoke.
11. Caddy switch.
12. Monitorizare erori, latență și login.
13. Vechiul serviciu rămâne disponibil pentru rollback.

## Rollback

Rollback înseamnă:

- Caddy înapoi la old upstream;
- activarea vechiului serviciu;
- noul serviciu oprit;
- fără downgrade Alembic;
- fără `git reset --hard`;
- fără ștergerea DB-ului v2.

## Acceptare M6

- DNS indică IP-ul corect;
- HTTPS valid;
- API v2 healthy;
- PostgreSQL rehearsal și restore drill verzi;
- Auth0 funcționează;
- Stripe test mode funcționează;
- FC26 E2E verde;
- Android beta verde;
- backup off-server verificat;
- rollback testat;
- zero Docker;
- zero secrets expuse.
