# AI-tolkning av orderblad utan textlager

Status: byggt och testat lokalt. Inte driftsatt. Kräver att VI-HEM-sidan (gren `feature/ai-interpretation-billing` i vi-hem) är på plats först.

## Så fungerar det
1. Vid **Importera order** läser webbläsaren PDF:en som vanligt (textlager, ingen kostnad).
2. Saknar PDF:en läsbar text (skannad eller utskriven som bild, t.ex. "Microsoft Print to PDF") erbjuds **AI-tolkning**. Användaren ser först kostnaden: *5,00 kr per sida exkl. moms, antal sidor, summa + moms*. Inget skickas och inget debiteras förrän man trycker **Tolka med AI**. Alternativet är **Fortsätt utan AI**, som lägger in bladet tomt för manuell ifyllnad.
3. Webbläsaren renderar sidorna till bilder och skickar dem till JK:s funktion `interpret-order-document` (endast aktiva admin/projektledare). Den vidarebefordrar server-till-server till VI-HEM:s `vihem-ai-interpret-document` med JK:s kundnyckel.
4. VI-HEM kör OCR (Google Vision) och strukturering (OpenAI, bildtolkning som komplement) med Vibogruppens befintliga nycklar, loggar tolkningen och returnerar orderfälten i samma struktur som textläsningen (`ParsedLtcOrder`).
5. Resultatet visas i den vanliga granskningsvyn med en tydlig varning om att bladet är AI-tolkat. **Inget projekt skapas utan att användaren granskat och bekräftat.**

## Debitering
- **5 kr per tolkad sida exkl. moms (+ 25 % moms)**, per kund inställbart i VI-HEM.
- Bara **lyckade** tolkningar debiteras. Misslyckade försök, omförsök med samma id och vanliga text-PDF:er är gratis.
- Varje dokument får ett stabilt `request_id`. Ett omförsök efter nätverksfel ger samma resultat utan ny debitering (resultatet cachas 24 timmar hos VI-HEM).
- Underlaget byggs månadsvis i VI-HEM (Fakturering & AI) och kan exporteras som CSV med en rad per tolkning (tid, användare, fil, sidor).

## Skydd
- Nyckeln ligger bara som serverhemlighet i JK:s Edge-container och i VI-HEM (hashad). Webbläsaren ser den aldrig.
- Gränser per kund i VI-HEM: högst 10 sidor per dokument, valfri månadsgräns, av/på-knapp och återkallning av nyckeln.
- Dokumentinnehåll sparas inte. VI-HEM sparar metadata (tid, användare, filnamn, filens kontrollsumma, sidor, modell, tokens, kostnad) och resultatet i högst 24 timmar.
- Går VI-HEM eller AI-tjänsten inte att nå visas ett tydligt meddelande och bladet läggs in för manuell ifyllnad. Ingenting debiteras.

## Det som måste göras innan det går att använda
1. Kör VI-HEM:s migration `20261022100000_vibogruppen_billing_ai.sql` och driftsätt funktionen `vihem-ai-interpret-document` **med `--no-verify-jwt`** (se vi-hems `docs/vibogruppen-billing-ai.md`).
2. I VI-HEM → *Fakturering & AI*: skapa kunden "JK Projektlogistik AB", kontrollera pris per sida (5,00 kr) och fyll i hosting och eventuella tillägg. Skapa en API-nyckel (visas en gång).
3. På servern: sätt `VIHEM_AI_URL` (VI-HEM:s funktions-URL, t.ex. `https://<vihem-supabase>/functions/v1/vihem-ai-interpret-document`) och `VIHEM_AI_CLIENT_KEY` i JK:s miljöfil och starta om Edge-containern.
4. Driftsätt `supabase/functions/interpret-order-document` i JK:s Edge-container.
5. Verifiera med en text-lös PDF (t.ex. en "utskriven" LTC) och kontrollera att tolkningen dyker upp i VI-HEM:s underlag.

## Tester
- `npm test` (bl.a. `src/lib/aiInterpretation.test.ts`: när AI erbjuds, mappning till `ParsedLtcOrder`, kostnadsberäkning).
- I vi-hem: `node scripts/ai-interpret-check.mjs`, `node scripts/billing-format-check.mjs` och `bash scripts/test_billing_ai_sql.sh` (29 SQL-kontroller i en tillfällig databas).
- Inte provat live: själva AI-anropen mot OpenAI/Google Vision (kräver nycklar och driftmiljö) och kedjan JK → VI-HEM över nätverket. Gör ett provanrop efter driftsättning innan fler får använda funktionen.

## Begränsningar
- Läser bilder av sidorna (högst 10 sidor, ca 1400 px bredd). Mycket dåliga skanningar kan ge ofullständiga resultat; då fyller man i manuellt.
- Flera ordrar i samma dokument (uppdragslista) kan tolkas, men noggrannheten är lägre än för textläsning. Granska alltid.
