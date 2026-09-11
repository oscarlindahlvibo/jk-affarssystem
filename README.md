# JK Projektlogistik – internt affärssystem (Basic-version)

Internt webbaserat system för kunder, projekt/transporter, status, dokument, gods och koppling till ett framtida ruttmätningssystem. Byggt med Vite, React, TypeScript, Tailwind CSS och förberett för Supabase.

## Kom igång

```bash
npm install
npm run dev
```

Appen körs mot mockdata (`src/data/mockData.ts`) tills Supabase kopplas in. Login-sidan visar en lista med testanvändare (olika roller, statusar och två separata bolag) i detta läge – klicka på en för att logga in som den personen.

## Personal, roller och behörigheter

Admin hanterar bolagets användare under **Personal** (`/personal`, endast synlig/åtkomlig för admin): bjuda in, redigera, inaktivera/aktivera. En ny användare får status **Inbjuden** och kan inte logga in förrän den aktiveras (i mockläget sker det genom att en admin sätter status till Aktiv).

Fyra roller (`src/lib/permissions.ts`):

| Roll | Kunder/projekt/kontakter/leverantörer/dokument | Fakturering | Användare | Inställningar |
|---|---|---|---|---|
| **Admin** | Full åtkomst | Full åtkomst | Hanterar | Full åtkomst |
| **Projektledare** | Skapa/redigera/radera | Läser | Nej | Nej |
| **Ekonomi** | Endast läsa | Redigerar pris/kostnad/faktureringsstatus | Nej | Nej |
| **Läsare** | Endast läsa | Endast läsa | Nej | Nej |

Tre statusar: **Aktiv**, **Inbjuden**, **Inaktiverad** – ett inaktiverat konto blockeras redan vid inloggning.

Gränssnittet döljer knappar/vyer användaren saknar rätt till (`usePermissions()`), men skyddet ligger även i datalagret: `StoreProvider` (`src/data/store.tsx`) kontrollerar roll och kontostatus i varje skriv-funktion innan något muteras, oavsett vad UI råkar visa. SQL-migrationen [`0004_roles_and_permissions.sql`](supabase/migrations/0004_roles_and_permissions.sql) speglar samma regler som Row Level Security-policyer för när Supabase kopplas in skarpt.

### Bolagstillhörighet (multi-tenant)

Varje användare, kund, projekt och leverantör tillhör ett bolag (`org_id`). Store filtrerar automatiskt all data till det inloggade kontots bolag, och nya poster stämplas alltid med rätt `org_id` – ett bolag kan varken se eller nå ett annat bolags data, inte heller via direkt URL till ett projekt-id. Mockdatan innehåller ett andra testbolag ("Exempel Spedition AB", inloggning: Sara Holm) med egen kund/projekt/leverantör för att verifiera isoleringen.

## Koppla in Supabase

1. Skapa ett Supabase-projekt.
2. Kör `supabase/migrations/0001_init.sql` i SQL-editorn (skapar tabeller, RLS-policyer och en `project-documents`-bucket för dokument).
3. Kopiera `.env.example` till `.env` och fyll i:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
4. Starta om `npm run dev`. Login-sidan växlar automatiskt till Supabase Auth (e-post/lösenord).

Frontend-koden läser fortfarande från `src/data/mockData.ts` via `src/data/store.tsx` tills datalagret kopplas om till Supabase-queries – datamodellen (`src/types/index.ts`) speglar databasschemat 1:1 för att göra den övergången enkel.

## Koppla in Google Drive (dokumentlagring)

Uppladdade dokument (ritningar, tillstånd, offerter m.m.) kan sparas som riktiga filer i en mapp i JK:s
Google Drive, istället för bara i webbläsarens minne. Kund-, projekt- och annan strukturerad data ligger
kvar i Supabase (ovan) – det är inte praktiskt att köra sökbar/filtrerbar data mot Drive, men filer passar bra där.

Detta kräver ett Google Cloud-projekt med en OAuth-klient. Steg för steg:

1. **Skapa ett Google Cloud-projekt**
   Gå till [console.cloud.google.com](https://console.cloud.google.com/), logga in med det Google-konto/den
   Google Workspace-organisation som ska äga Drive-mappen, och skapa ett nytt projekt (t.ex. "JK Projektlogistik").

2. **Aktivera Google Drive API**
   I sidomenyn: *APIs & Services → Library*, sök upp **Google Drive API** och klicka **Enable**.

3. **Konfigurera samtyckesskärmen (OAuth consent screen)**
   *APIs & Services → OAuth consent screen*. Välj **External** (om ni inte har Google Workspace) eller
   **Internal** (om ni har det och bara interna användare ska logga in). Fyll i appnamn ("JK Projektlogistik"),
   supportmejl och kontakt-e-post. Under **Scopes**, lägg till `.../auth/drive.file` (endast filer appen
   själv skapar). Om appen hamnar i status "Testing", lägg till JK:s egna Google-konton under **Test users** –
   annars fungerar inte inloggningen förrän appen publiceras/verifieras.

4. **Skapa en OAuth-klient**
   *APIs & Services → Credentials → Create Credentials → OAuth client ID*. Välj **Web application**.
   Under **Authorized JavaScript origins**, lägg till de adresser appen körs från, t.ex.:
   - `http://localhost:5173` (lokal utveckling)
   - er produktionsdomän när appen driftsätts (t.ex. `https://projekt.jkprojektlogistik.se`)

   Ingen *redirect URI* behövs – inloggningen sker via en popup (token-flöde), inte en omdirigering.
   Klicka **Create** och kopiera det **Client ID** som visas (ser ut som `123456789-abc...apps.googleusercontent.com`).

5. **Lägg till Client ID i appen**
   I `.env` (kopiera från `.env.example` om filen inte redan finns):
   ```
   VITE_GOOGLE_CLIENT_ID=123456789-abc...apps.googleusercontent.com
   ```
   Starta om `npm run dev`.

6. **Anslut i appen**
   Logga in i systemet, gå till **Inställningar**, klicka **Anslut till Google Drive** och godkänn i
   Google-popupen. Uppladdade dokument hamnar därefter i en mapp som heter **"JK Projektlogistik - Dokument"**
   i Drive-kontot som loggade in. Varje användare som ska ladda upp dokument behöver ansluta sitt eget
   Google-konto (eller ni delar ett gemensamt "systemkonto" för JK).

Tekniskt sett används [Google Identity Services](https://developers.google.com/identity/oauth2/web) för
inloggningen och Drive REST API v3 direkt via `fetch` (`src/lib/googleDrive.ts`) – ingen tung SDK laddas in.
Är Drive inte anslutet fungerar dokumentuppladdning fortfarande, men filerna sparas bara temporärt i
webbläsarens minne under sessionen (tydligt märkt i UI:t).

## Struktur

- `src/pages` – sidorna: Dashboard, Projektlista, Projektdetalj, Kundlista, Kunddetalj, Kontaktpersoner, Kontaktpersondetalj, Leverantörer, Dokument, Inställningar
- `src/components` – layout, UI-primitiver, projekt-/kund-/leverantörs-/kartkomponenter
- `src/data` – mockdata + in-memory store (`StoreProvider`)
- `src/lib` – Supabase-klient, Google Drive-integration, auth-context, status-/formathjälpare
- `supabase/migrations` – SQL-schema för Supabase/PostgreSQL

## Ingår i denna version

Kunder, kontaktpersoner, projekt/transporter, statusflöde (14 statusar), gods, dokumentsektion (metadata, redo för Supabase Storage), interna anteckningar, uppgifter/checklista, leverantörsregister, sök/filter på projekt, samt en förberedd panel "Kopplad ruttmätning" med mockad kartvy och klickbara mätpunkter.

Ingen publik hemsida eller offertformulär ingår – fokus är det interna arbetsverktyget.

### Excel-import (`/importera`)

Tre steg: välj/ladda upp fil (riktig `.xlsx`/`.xls`/`.csv`-parsning lokalt i webbläsaren, eller "Använd exempeldata") → mappa kolumner (auto-gissning mot JK:s typiska Excel-rubriker) → förhandsgranska och importera. Varje rad valideras (saknar kund/lastning/lossning/mått) och jämförs mot befintliga projekt för dubblettvarning, med möjlighet att importera ändå, hoppa över eller uppdatera befintligt projekt. Importen skapar automatiskt kund och kontaktperson om de inte redan finns.

### Projektlista som Excel-ersättare

Snabbfilter (Alla/Nya/Planering/Ruttkontroll/Denna vecka/Väntar på kund/Klar för fakturering/Saknar uppgifter), fler kolumner (Från/Till/Höjd/Bredd/Vikt/Fakturering/Saknade uppgifter) samt CSV-export.

### Validering av saknade uppgifter

`src/lib/validation.ts` flaggar projekt som saknar kund, kontaktperson, lastnings-/lossningsplats, höjd/bredd/vikt, datum, ansvarig eller dokument – visas i projektlistan, projektdetaljen och på dashboarden under "Projekt som behöver kompletteras".

### Projektmallar

Vid skapande av nytt projekt kan en mall väljas (Specialtransport, Tungt lyft, Ruttkontroll, Följebil/dispens, Transportförmedling, Projektlogistik) som automatiskt lägger till standarduppgifter, definierade i `src/data/templates.ts`.

### Export

CSV-export av projektlistan samt en utskriftsvänlig projektvy (`/projekt/:id/skriv-ut`) med kund, kontaktperson, transport- och godsdata, ruttmätning, dokument, uppgifter och anteckningar – "Skriv ut / Spara som PDF" använder webbläsarens utskriftsfunktion.

### Kund-, kontakt- och leverantörshantering

Kunder kan skapas direkt inifrån "Nytt projekt" (utan att lämna dialogen), och raderas från kundens redigeringsläge (blockeras om projekt fortfarande är kopplade). Kontaktpersoner har egna sidor (`/kontakter/:id`) för visning, redigering och radering. Leverantörer har full hantering (skapa/redigera/radera) på `/leverantorer`, med samma skydd mot radering av leverantörer som har kopplade projekt.
