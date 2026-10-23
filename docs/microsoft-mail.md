# All utgående e-post via Microsoft 365

Mål: allt som systemet skickar (bokningar till transportörer, arbetsordernotiser, inbjudningar och lösenordsåterställning) ska gå från JK:s egen Microsoft 365-miljö och inte via Brevo. Skälet är leveransen: mejlen hamnar idag ofta i skräpposten eller kommer inte fram.

## Läget idag (kontrollerat 2026-10-23)
- Mejl skickas via Brevo från `system@utskick.jkprojekt.se` med `bokning@jkprojekt.se` som Reply-To.
- `jkprojekt.se` har Microsoft 365 som mottagare (MX `jkprojekt-se.mail.protection.outlook.com`) och SPF `v=spf1 include:spf.protection.outlook.com -all` (utan Brevo).
- **DKIM-signering för domänen är inte påslagen i Microsoft 365** (`selector1._domainkey.jkprojekt.se` saknas).
- DMARC är `p=none` med rapporter till Brevo.
- Servern har fast publik IP **194.17.156.10** och når Microsoft på port 25.

## Två vägar, båda behövs
| Vad | Väg | Varför |
|---|---|---|
| Bokningar och arbetsordernotiser (edge-funktionerna) | **Microsoft Graph**, appen skickar som den delade brevlådan `bokning@jkprojekt.se` | OAuth, ingen SMTP-inloggning (Microsoft stänger av Basic auth för SMTP som standard i slutet av 2026). Skickade mejl hamnar i brevlådans Skickat-mapp, så hela JK ser vad transportören fått. |
| Supabase Auth (inbjudningar, lösenordsåterställning) | **SMTP-relä** (connector i Microsoft 365 låst till serverns IP) | Supabase Auth kan bara SMTP, inte Graph. |

## Beställning till Nordlo (Microsoft 365-administratör)
1. **Entra-app för e-postutskick**
   - Skapa en appregistrering, t.ex. `JK Affärssystem – e-post`.
   - Behörighet: Microsoft Graph, *Application permissions*, `Mail.Send`. Ge administratörsgodkännande.
   - Begränsa appen så att den **bara** får skicka som `bokning@jkprojekt.se`, med Exchange Online RBAC för program (eller Application Access Policy). Appen ska inte kunna skicka som andra brevlådor.
   - Skapa en klienthemlighet (24 månader, sätt påminnelse om förnyelse) och lämna **katalog-ID, klient-ID och hemlighet** till WPE via säker kanal (inte vanlig e-post).
2. **Delad brevlåda** `bokning@jkprojekt.se` enligt `docs/nordlo-bokning-mailbox.md`. Skickat från appen sparas automatiskt i brevlådans Skickat-mapp.
3. **Relä-connector för Supabase Auth**
   - Inkommande connector, typ *Din organisations e-postserver*, begränsad till IP **194.17.156.10**, TLS krävs.
   - Tillåt skickande med avsändare i `jkprojekt.se` till externa mottagare.
   - Använd en avsändaradress i `jkprojekt.se` (förslag `system@jkprojekt.se`, kan vara en delad brevlåda).
4. **DKIM för jkprojekt.se**: slå på DKIM-signering i Microsoft 365 Defender och publicera de två CNAME-posterna (`selector1._domainkey`, `selector2._domainkey`). WPE kan lägga in DNS-posterna om ni vill.
5. **DMARC**: när DKIM är på, ändra till `p=quarantine`. Behåll rapportadressen till Brevo tills Brevo är avvecklat.

## Byte på servern (WPE)
Koden stöder båda vägarna och väljer med `MAIL_TRANSPORT` (standard `smtp`, alltså ingen ändring förrän man byter). Sätt i JK:s `.env`:
```
MAIL_TRANSPORT=graph
GRAPH_TENANT_ID=…
GRAPH_CLIENT_ID=…
GRAPH_CLIENT_SECRET=…
GRAPH_SENDER=bokning@jkprojekt.se
```
Starta om bara functions-containern. Behåll `SMTP_*` kvar: misslyckas Graph med ett tydligt fel används SMTP som reserv, men aldrig vid osäkra fel (timeout) så att inget skickas dubbelt. Provskicka en bokningskopia till en intern adress före bytet. Tillbaka: `MAIL_TRANSPORT=smtp`.

Supabase Auth byts separat med det befintliga skriptet:
```
/home/vibo/jkprojekt/configure-smtp.sh --relay jkprojekt-se.mail.protection.outlook.com 25 system@jkprojekt.se
```

## Avveckla Brevo
När Graph och reläet fungerar: ta bort `SMTP_*` ur `.env`, lämna Brevo och ta bort `utskick.jkprojekt.se`-posterna. Behåll DMARC-rapporteringen tills dess.
