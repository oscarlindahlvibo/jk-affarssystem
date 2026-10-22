# Driftmeddelanden (uppdateringar och serverunderhåll)

Vibogruppen kan skicka kritiska notiser om planerade uppdateringar och serverunderhåll till JK-systemet. De visas som en banner under topplisten för alla inloggade användare, mellan en starttid och en sluttid som anges i VI-HEM.

## Så fungerar det
1. En administratör i Vibogruppen skapar ett meddelande i VI-HEM under **Ekonomi → Driftmeddelanden**: rubrik, text, typ (uppdatering, serverunderhåll, driftstörning, övrigt), allvarlighet (information, varning, kritisk), **visa från/till** och valfritt **underhållsfönster** (när själva underhållet sker). Meddelandet gäller alla kunder eller utvalda.
2. JK:s webbläsare frågar edge-funktionen `system-notices` (kräver inloggning) var 5:e minut och när fliken blir synlig igen.
3. Funktionen hämtar server-till-server från VI-HEM (`action: "notices"`) med samma kundnyckel som AI-tolkningen (`VIHEM_AI_CLIENT_KEY`). Svaret cachas i en minut. Går VI-HEM inte att nå visas senast kända meddelanden i upp till 30 minuter och därefter inget; JK-systemet påverkas aldrig.
4. Bannern försvinner av sig själv vid sluttiden, även om sidan står öppen.

## Visning
- **Kritiska** meddelanden (röda) kan inte döljas. **Varning** (gul) och **information** (blå) kan döljas av användaren; ett ändrat meddelande visas igen.
- Underhållsfönstret visas som t.ex. "Serverunderhåll: fredag 23 oktober kl. 22:00–23:30".

## Drift
- Ingen ny konfiguration i JK: funktionen använder `VIHEM_AI_URL` och `VIHEM_AI_CLIENT_KEY` som redan finns. Saknas de visas inga meddelanden.
- Funktionen driftsätts genom att kopiera `supabase/functions/system-notices/` till JK:s functions-volym (ingen omstart krävs).
