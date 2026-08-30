M5_FC26_FULL_PRODUCT_AND_ANDROID_BETA.md

## Obiectiv

Livrăm primul produs complet și coerent: FC26 Traditional, FSU, Guardian, Android wrapper și toate instrumentele relevante.

## Module de integrare

```text
extension\src\guardian\
├── GuardianBridge.js
├── GuardianContracts.js
├── FsuSnapshotAdapter.js
├── GuardianApiClient.js
├── GuardianSolveFacade.js
├── GuardianSbcController.js
├── GuardianApplyController.js
├── GuardianCapabilityRegistry.js
└── fc26\
    ├── Fc26RequirementAdapter.js
    ├── Fc26SnapshotAdapter.js
    └── Fc26SolutionPresenter.js
```

Nu se accesează direct obiectele interne EA din UI. Totul trece prin adapterele FSU.

## Flow FC26

```text
1. Userul intră în EA Web App.
2. Deschide un SBC.
3. FSU detectează challenge-ul.
4. Adapterul extrage requirements.
5. Snapshotul clubului este normalizat.
6. Guardian aplică:
   - locked
   - excluded
   - duplicate preference
   - rating floor
   - special/evolution protections
7. Cloud solver creează plan.
8. UI explică fiecare jucător și fiecare warning.
9. Userul poate modifica filtrele.
10. Apply completează squad-ul, fără submit automat.
11. Submit cere confirmare nouă.
12. Rezultatul actualizează local state/history.
```

## All-features policy

Funcțiile FSU sunt vizibile și default-on:

- SBC tools;
- rating overview;
- club/search filters;
- player insights;
- squad builder;
- objectives;
- evolutions;
- market tools;
- pack tools;
- price overlays;
- locks/settings.

Excepție:

- un provider extern neauditat este `PROVIDER_UNAVAILABLE`;
- UI-ul explică motivul;
- nu se folosește un endpoint alternativ inventat;
- funcția revine automat la disponibil numai după capability probe și audit legal.

## Android final UX

Native Android conține numai:

```text
Gecko wrapper
loading/error screen
Auth0/account link
subscription status
settings/help
native confirmation dialog
update screen
```

Nu conține:

```text
Club tab
Solve tab
Guardian tab
Admin tab
vechiul Compose UI
```

UI-ul real de produs este injectat în Web App.

## Confirmări

Obligatorii pentru:

```text
SBC_APPLY
SBC_SUBMIT
MARKET_BUY
MARKET_LIST
PACK_OPEN
BATCH_ACTION
```

Preview-ul arată:

- acțiunea;
- numărul de itemi;
- itemii protejați;
- tradeable/untradeable;
- special/evolution;
- impactul;
- imposibilitatea de undo;
- butoane `Cancel` și `Confirm`.

Nu există opțiunea „Never ask again”.

## Teste

### Automat

- FC26 fixture normal;
- malformed requirements;
- partial snapshot;
- stale snapshot hash;
- duplicate action;
- stale confirmation;
- payload modificat după confirmare;
- network timeout;
- server invalid response;
- EA capability absent;
- no automatic submit;
- EN/RO completeness;
- accessibility semantics.

### Browser

- Chrome unpacked extension;
- real EA login;
- read-only scan;
- solve;
- apply;
- cancel;
- confirm;
- logout.

### Android

- instalare APK beta;
- GeckoView login;
- built-in extension;
- rotation;
- process death;
- app restart;
- network loss;
- session expiry;
- back navigation;
- current physical phone;
- emulator;
- un al doilea OEM înainte de public beta.

## Acceptare M5

Un rookie user poate:

1. instala APK;
2. intra în contul EA;
3. vedea imediat Guardian;
4. înțelege ce face fiecare buton;
5. deschide un SBC FC26;
6. primi o soluție;
7. vedea de ce au fost aleși jucătorii;
8. aplica squad-ul;
9. refuza sau confirma submit-ul;
10. termina flow-ul fără să folosească aplicația veche.
