# Stämpelklocka, löneunderlag och Spiris

Status: byggt och verifierat lokalt på grenen `feature/tid-lon-stampelklocka`. Inget är driftsatt och inga migreringar (0027, 0028) är körda mot produktionsdatabasen.

## Två separata tider
- **Arbetad personaltid** (stämpelklockan, `attendance_entries`) ligger till grund för lön.
- **Fakturerbar kundtid** (rapporterat arbete på projekt, `work_reports`) ligger till grund för fakturaunderlag.
De kopplas aldrig automatiskt. Projektklockan (menyn "Projekttid") är den äldre klockan för tid på projekt.

## Flöde för löneunderlag
Medarbetare skickar in → ansvarig (admin/projektledare) attesterar → ekonomi/admin granskar → export.
- Preliminär tid beräknas löpande. Vid attest sparas en låst beräkning (summor, dagar, regelkopia).
- Stämplingar i attesterade/exporterade perioder kan inte ändras utan att perioden öppnas igen (attesterad) eller att en spårbar rättelse registreras (exporterad).
- Export markerar sammanställningen som exporterad. Ny export av samma person kräver bekräftelse och orsak (omexport). Rättelser exporteras som separata rader (`rättelse`).
- Alla ändringar loggas med före/efter, orsak, vem och när.

## Roller
| Åtgärd | Roller |
|---|---|
| Stämpla, lägga in missad tid, begära rättelse | alla interna användare (egen tid) |
| Se personalens tid, ändra/lägga in tid åt andra, godkänna rättelser, attestera | admin, projektledare (se personal: även ekonomi) |
| Skapa period, granska, exportera, ändra löneinställningar | admin, ekonomi |
Åtkomst tvingas i databasen via RLS och SECURITY DEFINER-funktioner (se `0028_attendance_and_payroll.sql`), inte bara i gränssnittet.

## Spiris Lön
Ingen officiellt dokumenterad filimport eller öppet API för tidrapporter/lön i Spiris Lön har kunnat verifieras. Sökning visar Spiris (f.d. Visma eEkonomi) bokförings-API ([Apideck om Spiris/Visma eAccounting-API](https://www.apideck.com/blog/spiris-visma-eaccounting-api-integration.md)) och några partnerintegrationer ([Nmbrs](https://www.spiris.se/integrationer/partner/nmbrs), [Intempus](https://www.spiris.se/integrationer/partner/intempus)), men inget för löneunderlag.
Därför finns **ingen Spiris-adapter**. Inga inofficiella API:er, skärmskrapning eller lösenordsinloggningar används.
Det som finns: CSV (semikolon, decimalkomma, BOM), XLSX och strukturerad JSON (`jk.payroll-basis.v1`) med SHA-256-kontrollsumma. Adaptern är ett litet gränssnitt (`src/lib/payrollExport/types.ts`); en Spiris-adapter läggs till i `EXPORT_ADAPTERS` när Spiris bekräftar ett stött format.
**Åtgärd för JK:** fråga Spiris support vilken lönprodukt som används och om/hur tidrapporter kan importeras. Tills dess matas CSV/XLSX in manuellt eller via Spiris egen importfunktion om den finns.

## Vad JK måste konfigurera (Inställningar → Lön och arbetstid)
1. **Regelmallar**: övertidsnivåer, om nivåer räknas per dag eller vecka, veckogräns, övertid på helg/helgdag, rastavdrag, hantering av pass över midnatt. Standardmallen är ett neutralt exempel som **måste bekräftas** mot JK:s avtal. Inga avtalsregler är hårdkodade.
2. **Per anställd**: anställningsnummer, anställningsform, veckoarbetstid, sysselsättningsgrad, individuellt schema per veckodag, giltigt från, regelmall, lönesystemsreferens. Inga personnummer lagras.
3. **Lönekoder**: koppla varje tidstyp (ordinarie, övertidsnivåer, frånvarotyper) till JK:s kod. Rader utan kod exporteras med varning.
4. Skapa löneperioder (t.ex. per månad).

## Tid och tidszon
Alla beräkningar sker i Europe/Stockholm: sommar-/vintertid, pass över midnatt och svenska helgdagar hanteras. En stämpling kan inte vara öppen i två enheter samtidigt (unikt index + förväntat läge vid stämpling).

## Tester
```
npm test          # enhetstester (regler, tid, export, flöden)
npm run test:sql  # kastbar Postgres-container: RLS, flöden, låsning, export
npx tsc --noEmit -p tsconfig.app.json && npx oxlint && npm run build
```
