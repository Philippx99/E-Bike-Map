# E-Bike-Map

Routenplanung für E-Bikes und E-Mofas: Anmeldung, eigene Fahrzeuge mit ungefährer Reichweite, eigene und öffentliche Lademöglichkeiten, automatische Ladestopps bei langen Strecken.

## Kostenlos einrichten

1. **Backend (Supabase, Free):** Projekt auf supabase.com erstellen. Im *SQL Editor* den Inhalt von `schema.sql` ausführen. Unter *Project Settings → API* die `Project URL` und den `anon public` Key kopieren.
2. **Routing (OpenRouteService, Free):** Auf openrouteservice.org registrieren und einen API-Key erzeugen (ca. 2000 Anfragen pro Tag gratis).
3. Beide Werte in `config.js` eintragen.
4. **Hosting:** Dateien ins GitHub-Repo hochladen und das Repo bei Netlify, Cloudflare Pages oder GitHub Pages verbinden (kein Build-Befehl, Ordner ist das Hauptverzeichnis).
5. In Supabase unter *Authentication → URL Configuration* die Adresse der Webseite als Site URL eintragen.

## Hinweise

- Es wird nur 80 % der angegebenen Reichweite eingeplant. Ändern: `SAFETY` in `app.js`.
- Ladepunkte werden nur berücksichtigt, wenn sie höchstens 2 km von der Route entfernt sind (`MAX_OFF_KM`).
- E-Mofas nutzen das normale Fahrrad-Routing. Sie dürfen oft nicht auf Radwegen fahren, die Strecke deshalb prüfen.
- Der ORS-Key ist im Browser sichtbar. Beim Anbieter ggf. auf die eigene Domain beschränken.
