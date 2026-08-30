M7_FC27_ACTIVATION_AND_LEGACY_RETIREMENT.md

## Obiectiv

Activăm FC27 numai pe baza sistemului live verificat și, după perioada de stabilitate, retragem definitiv vechiul Guardian.

## Research gate

Înainte de cod FC27 se verifică din surse live:

- formatul real SBC FC27;
- requirements reale;
- item taxonomy;
- scoring;
- schimbări ale bundle-ului EA;
- compatibilitatea FSU;
- capturi reale licențiate/redactate;
- orice modificare a Web App-ului.

Nu se folosesc drept adevăr:

- valori din PDF;
- presupuneri din FC26;
- mesaje vechi OX;
- valori inventate;
- nearest/interpolation/fuzzy scoring.

## FC27 gate

FC27 este blocat dacă:

```text
edition != FC27
snapshot schema < 2
taxonomy neverificată
item cu scoring category unresolved
ruleset activ absent
ruleset version mismatch
snapshot hash mismatch
EA capability mismatch
```

## Module

```text
guardian-cloud\src\guardian_cloud\domain\
├── streamlined_solver.py
├── streamlined_advisor.py
├── fc27_taxonomy.py
└── fc27_scoring.py

extension\src\guardian\fc27\
├── Fc27RequirementAdapter.js
├── Fc27SnapshotAdapter.js
├── Fc27ReviewPanel.js
└── Fc27GuardianSignals.js
```

## Smart modes

```text
DUPLICATE_FIRST
BALANCED
MINIMUM_ITEMS
```

Guardian:

- locked/excluded/consumed sunt absolute;
- special/protected/evolution sunt soft;
- override-ul este explicit;
- orice override apare în review;
- maximum trei sugestii deterministe;
- timeout diferit de infeasible;
- fiecare jucător are „Why this player?”;
- SBC-ul imposibil are „Why not solvable?”.

## Scoring registry

```text
POST /api/v2/admin/scoring-rulesets
POST /api/v2/admin/scoring-rulesets/{id}/activate
POST /api/v2/admin/taxonomy/verify
GET  /api/v2/scoring-rulesets/active?edition=FC27
```

Reguli:

- registry inițial gol;
- create produce DRAFT;
- Principal/Admin autorizat poate activa conform matricei;
- exact un ACTIVE per edition;
- old ACTIVE devine RETIRED;
- entries immutable;
- solverul înregistrează ruleset version;
- niciun punct hardcodat în extensie.

## Activare

Feature flag:

```text
FC27_STREAMLINED_ENABLED=false
```

Devine `true` numai după:

- corpus real;
- ground truth verificat;
- solver exact;
- browser fixture;
- real Web App read-only;
- dry-run solve;
- Principal Admin activation;
- Android beta smoke.

## Legacy retirement

Perioadă minimă de soak:

```text
14 zile fără incidente critice
```

După soak:

1. se oprește vechiul systemd service;
2. Caddy rămâne exclusiv pe v2;
3. se creează ultimul DB dump;
4. se verifică restore;
5. se creează ultimul Git bundle;
6. se compară manifestele;
7. se prezintă utilizatorului lista exactă a directoarelor ce ar urma să fie șterse.

Ștergerea permanentă se face numai după o nouă comandă explicită a utilizatorului.

Ținte posibile, numai după confirmare:

```text
C:\BOTS\_SBCGuardian-legacy-archive\2026-08-27\repos\SBCGuardian
C:\BOTS\_SBCGuardian-legacy-archive\2026-08-27\repos\SBCGuardian - Copy
```

Se păstrează separat:

```text
Git bundle
SHA manifests
DB backup criptat
migration report
release metadata
```

Nu se șterge niciodată generic:

```text
C:\BOTS
C:\BOTS\_SBCGuardian-legacy-archive
OneDrive root
server /opt
server /var/lib/postgresql
