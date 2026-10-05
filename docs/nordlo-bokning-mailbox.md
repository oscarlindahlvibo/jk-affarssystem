# Beställning till Nordlo: gemensam bokningsinkorg

Skapa en delad postlåda i JK Projektlogistiks befintliga Microsoft 365-miljö.

- Visningsnamn: `JK Projektlogistik Bokning`
- Primär e-postadress: `bokning@jkprojekt.se`
- Typ: delad postlåda, inte en separat användare med delat lösenord
- Postlådan ska kunna ta emot e-post från externa avsändare
- Behåll postlådan synlig i den globala adresslistan
- Blockera direkt interaktiv inloggning för postlådans underliggande konto
- Tilldela berörda JK-användare både `Full Access` och `Send As`
- Aktivera kopiering av meddelanden som personal skickar med `Send As` till den delade postlådans Skickat-mapp
- Lägg inte till vidarebefordran och ändra inte domänens MX-, SPF-, DKIM- eller DMARC-poster

Systemet skickar transaktionsmejl via WPE:s befintliga Brevo-integration. Nordlo
behöver därför inte skapa något SMTP-lösenord, någon Exchange-connector eller
någon Entra-applikation för denna funktion. Svar går till den delade postlådan.

När postlådan är skapad behöver WPE verifiera `bokning@jkprojekt.se` som
avsändare i Brevo. Fram till dess används den redan verifierade tekniska
avsändaren `system@utskick.jkprojekt.se`, med `bokning@jkprojekt.se` som
Reply-To.
