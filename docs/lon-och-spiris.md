# Stämpelklocka, rapporterat arbete, löneunderlag och Spiris

Status: byggt och verifierat lokalt/i testdatabas på grenen `feature/tid-lon-stampelklocka`. Inget är driftsatt och inga migreringar (0027–0029) är körda mot produktionsdatabasen. 0027 och 0028 har ändrats i efterhand eftersom de aldrig körts i drift; 0029 är nytt.

## Fyra skilda saker (blanda aldrig ihop dem)
| Vy | Vad | Används till |
|---|---|---|
| **Stämpelklocka** (`/stampelklocka`) | Faktisk arbetstid per person (`attendance_*`) | Lön |
| **Rapporterat arbete** (på projektet) | Timmar, mil, väntetid per uppdrag (`work_reports`) | Underlag för kundfakturering |
| **Fakturaunderlag** (på projektet) | Debiterbara mängder × priser, justeringar, fakturerat/återstår | Faktura till kund |
| **Löneunderlag** (`/loneunderlag`) | Attesterad arbetstid, övertid, frånvaro per löneperiod | Lönekörning |

Exempel: 07–17 stämplat = 10 h lön. Tre uppdrag med 6 + 5 + 4 = 15 fakturerbara timmar är avsiktligt och ger ingen varning. Det finns ingen spärr och ingen automatisk koppling åt något håll. Testas i `src/lib/workedVsBillable.integration.test.ts` och `supabase/tests/32_worked_vs_billable.sql` (bl.a. att löneunderlagets fingeravtryck inte ändras när fakturerbar tid justeras 4 → 6 h, att dubbeldebitering nekas och att flera chaufförer på samma projekt får egen lön).

## En klocka: uppdrag, väntetid och rapport (0030)
Det finns en enda klocka att starta: **Stämpelklockan**. Under arbetsdagen:
1. Stämpla in (görs automatiskt om man startar ett uppdrag utan att vara instämplad).
2. **Starta uppdrag**: välj projekt (sök på nummer, namn eller kund) och eventuell arbetsorder, antingen på Stämpelklockan eller med knappen på projektet. Flera uppdrag på olika projekt kan pågå samtidigt (högst fem; samma projekt inte två gånger).
3. **Väntar / Sluta vänta** per uppdrag stämplar väntetid. Väntetid är arbetad tid för lön: den ligger redan inom stämplingen och ändrar ingenting i närvaron.
4. **Klar med uppdraget** öppnar rapporten förifylld: arbetstid från klockan (raster avdragna och väntetid frånräknad, så väntetid inte debiteras två gånger), väntetid och uppdragets projekt. Man lägger bara till körsträcka (km eller mil) och sparar. Allt kan ändras. Uppdraget avslutas och rapporten sparas i samma databastransaktion (`session_finish`); misslyckas sparningen förblir uppdraget öppet.
5. Stämpla ut. Man kan inte stämpla ut med pågående uppdrag i gränssnittet (avsluta eller avbryt dem först).
Eftersom varje uppdrag rapporteras för sig och flera kan pågå samtidigt kan **fakturerbar tid bli högre än arbetad tid**. Det finns ingen spärr. Den gamla projektklockan ("Projekttid") är borttagen ur appen eftersom ingen tid var registrerad i den; `/tid` omdirigerar till Stämpelklockan. Databastabellerna från 0025 (`time_entries`, `time_categories`) ligger kvar orörda och oanvända.

## Löneflöde och skydd mot felaktigt underlag
Preliminär → Inskickad → Attesterad → Granskad → Exporterad.

**Serververifierad attest (0029).** Tidigare tog databasen emot färdiga summor från klienten. Nu:
1. Klienten hämtar färska indata med `payroll_inputs(period, person)`: stämplingar, frånvaro, scheman, regelmallar och ett fingeravtryck (md5) som bara servern beräknar.
2. Klienten räknar med samma TypeScript-motor som visas i gränssnittet (en enda beräkningsmotor, ingen kopia av reglerna i SQL, så de kan inte glida isär).
3. `payroll_statement_attest` tar samma lås som stämpling/ändring av tid (ingen kan ändra personens tid under verifieringen), jämför fingeravtrycket mot aktuell data (stale data eller ändrad tid nekas) och räknar själv ut arbetad tid, rast, automatiskt rastavdrag (inkl. delning vid midnatt) och frånvaro per dag. Dessa måste stämma exakt. Dessutom kontrolleras: ordinarie + övertid = arbetad tid, ordinarie ≤ schema minus frånvaro, endast kända övertidstyper, att alla dagar med data finns med, att summorna stämmer med dagarna, att personen inte har pågående stämpling och att varje dag har gällande schema och en **godkänd** regelmall.
4. Servern sparar sin egen regelkopia (scheman + regelmallar) som underlag, inte klientens.
Samma verifiering gäller `payroll_record_adjustment` (rättelse efter export). Direktanrop med manipulerade summor, gammalt fingeravtryck eller andras id nekas (tester: `30_payroll_verification.sql`, `20_attendance_payroll.sql`).

**Kvarstående begränsning:** fördelningen mellan ordinarie tid och övertidsnivåer inom den verifierade arbetstiden beräknas av klienten och begränsas av invarianterna ovan, men servern räknar inte om nivåfördelningen (helgdagar, veckogräns, nivågränser). Skälet är att undvika två motorer som glider isär. Attestanten ser och intygar fördelningen. Vill JK ha full serverberäkning kan den tas fram senare, antingen genom portad SQL eller en Edge Function som kör samma TypeScript.

**Regelmallar är inte JK:s avtal förrän admin säger det.** Alla mallar börjar som ej godkända (exempelmallen heter "EXEMPEL – ej bekräftade avtalsregler"). Attest blockeras i gränssnitt och databas tills admin godkänt mallen med angiven grund (avtal, datum). Ändras reglerna återkallas godkännandet. Export kräver verifierat underlag. Saknade lönekoder stoppar exporten om man inte uttryckligen bekräftar export utan kod.

**Lås och rättelser.** Attesterad period låses; återöppning kräver orsak (admin/projektledare). Exporterad tid ändras bara via spårbar rättelse (admin) som exporteras som differensrader. Dubbelexport kräver bekräftelse och orsak. Allt loggas (vem, vad, när, orsak) i `attendance_audit` och `payroll_log`.

## Historiska perioder
Webbläsaren laddar bara de senaste 100 dagarnas närvaro. När en löneperiod öppnas hämtas just dess intervall (plus en veckas marginal) vid behov, sida för sida (PostgREST begränsar annars tyst till ~1000 rader). Tills intervallet är inläst är attest blockerad och en "Hämtar…"-rad visas. Äldre attesterade underlag visas från den sparade, låsta beräkningen. Rättelse av äldre perioder räknar på färska serverindata (`payroll_inputs`), inte på det som råkar vara inläst. RLS gäller lika vid historiska hämtningar.

## Roller
| Åtgärd | Roller |
|---|---|
| Stämpla, lägga in missad tid, begära rättelse, skicka in period | alla interna användare (egen tid) |
| Se personalens tid, ändra/lägga in åt andra, godkänna rättelser, attestera, öppna attest igen | admin, projektledare (se: även ekonomi). Egen tid attesteras bara av admin |
| Skapa period, granska, exportera, scheman, regelmallar, lönekoder | admin, ekonomi |
| Godkänna regelmall | endast admin |
| Extern transportör | endast egna tilldelade uppdrag/rapporter via `carrier_*`-funktioner; ingen tabellåtkomst |
Alla RPC:er är `security definer`, kontrollerar `auth.uid()` + `status = 'aktiv'` + organisation, och direkt skrivning i tabellerna är återkallad.

## Säkerhetsgranskning (fynd och åtgärder)
Åtgärdade i 0027/0028/0029: serverkontroll av attest (ovan); samtidig fakturering kunde dubbeldebitera (rader låses nu med `for update`); en rapport kunde flyttas mellan projekt via återanvänt id; transportör kunde ändra rapport till annat uppdrag och rapportera på fakturerat/avbokat projekt; frånvarorad kunde skrivas över av annan organisation via känt id; frånvaro skrevs utan samma lås som stämpling; stämpling kunde backdateras (nu max 15 min från serverns tid, missad tid läggs in manuellt med orsak/logg); orimliga datum (före 2020) nekas; regelmallar valideras i databasen.
Kvarstår/medvetet: alla interna användare kan läsa organisationens rapporterade arbete (inte kostnad/pris); anställd kan lägga in egen missad tid utan åldersgräns om perioden inte är attesterad (spåras i logg, kan begränsas).

## Spiris och export
Stödda exporter: **CSV** (semikolon, decimalkomma, BOM, skydd mot formelinjektion), **XLSX** och **strukturerad JSON** (`jk.payroll-basis.v1`), alla med SHA-256-kontrollsumma, anställningsnummer, period, tidstyp, lönekod, timmar/minuter, status och rättelserader (negativa differenser stöds). Ingen filtyp utger sig för att vara Spiris-format.

Verifierade fakta från Spiris egen dokumentation (hämtad 2026-10):
- **Visma Lön 300/600** (äldre produkter, numera under Spiris) har ett officiellt dokumenterat importformat för tidsredovisning: XML med ändelsen `.tlu`, teckenkodning ISO-8859-1, version 1.4, rotelement `SalaryData`, anställd matchas på `EmploymentNo`, varje tidkod (1–10 tecken) måste kopplas till löneart/snabbval i Lön 300/600, datum ISO, timmar med decimalpunkt, minst en normalarbetstidsrad krävs. Källor: [Filformat, Lön 600](https://support.spiris.se/visma-lon-600/content/online-help/filformat-tidsredovisningsfil.htm), [Filformat, Lön 300](https://support.spiris.se/visma-lon-300/content/online-help/filformat-tidsredovisningsfil.htm).
- **Spiris Lön** (nyare molnprodukten): importerar registreringar i lönekörningen från Anställd, Tid & Projektplanering, Resor & Utlägg och Byråstöd. Ingen fil- eller API-import av tid har hittats i dokumentationen. Källa: [Hjälp om Lön](https://support.spiris.se/lon/sv-se/content/online-help/payrun-adjust-payslip.htm).
- Inget öppet developer-API för löneunderlag har hittats för någon av produkterna.

Beslut: ingen Spiris-adapter byggs förrän JK bekräftat **vilken produkt** som används (Lön 300/600 vs. Spiris Lön). Om det är Lön 300/600 finns en officiell specifikation att bygga en `.tlu`-adapter på; datamodellen har redan anställningsnummer, tidskodsmappning och dagsdata. Om det är Spiris Lön behöver Spiris bekräfta en importväg (t.ex. via Tid & Projektplanering) innan något byggs. Inga inofficiella API:er, skärmskrapning eller lösenordsinloggning används. Adaptergränssnittet finns i `src/lib/payrollExport/types.ts`.

## Vad Jesper och Ulrika behöver göra
1. **Ulrika/admin:** Inställningar → Lön och arbetstid: skapa regelmall enligt JK:s avtal (övertidsnivåer, dag/vecka, helg, rastavdrag, midnatt), **admin godkänner** den med grund. Ange schema per anställd (veckoarbetstid, schema per veckodag, giltigt från, regelmall, anställningsnummer). Ange lönekod per tidstyp (ordinarie, övertidsnivåer, frånvarotyper). Skapa löneperioder.
2. **Bekräfta med Spiris/lönebyrå** vilken lönprodukt som används och hur tid läses in (se ovan).
3. **Jesper:** sätt kund-/projektpriser (timme, mil, väntetid) under kund/projekt. Fakturerbara mängder justeras per rapport utan att originalet ändras.
4. Chaufförer och transportörer behöver inga inställningar: de rapporterar datum, timmar, körsträcka (km eller mil) och väntetid; allt annat ligger under "Fler val".

## Särskilda steg vid framtida deploy
1. Ta backup. Kör 0027, 0028, 0029 i ordning (additivt: nya tabeller/funktioner, ändrar ingen befintlig data; testat mot en databas med produktionsliknande data, se `supabase/tests/pre/legacy_seed.sql` och `05_legacy_data_intact.sql`).
2. Bygg och synka `dist` på servern enligt gängse rutin; äldre appversioner fortsätter fungera eftersom inga befintliga tabeller/funktioner ändrats.
3. Edge-funktionen `invite-user` har ändrats (transportörskonton) och måste driftsättas om.
4. Konfigurera enligt listan ovan **innan** någon attesterar. Inga verkliga löneuppgifter bör exporteras innan reglerna godkänts och verifierats mot en manuell kontrollräkning.

## Tester
```
npm test          # enhetstester: regler, tid, export, flöden, 10h/15h-scenariot
npm run test:sql  # kastbar Postgres-container: migreringar (inkl. uppgradering från produktionsliknande data), RLS, flöden, låsning, export, säkerhetsregressioner
npx tsc --noEmit -p tsconfig.app.json && npx oxlint && npm run build
```
