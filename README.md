# Poule van Moise - Netlify productieversie

Dit is een Netlify-native webapp voor WK-updates, uitslagen en wedstrijden.

## Wat zit erin

- Publieke Nederlandse homepage
- Nieuwste update uitgelicht bovenaan
- Alle updates volledig leesbaar op de homepage
- Like-knop per update met toggle: liken of like verwijderen
- Wedstrijdenpagina met gespeelde wedstrijden, wedstrijden van vandaag en komende wedstrijden
- Wedstrijdtijden worden getoond in Amsterdamse tijd
- Landnamen en vlaggen op de wedstrijdenpagina
- Teller wanneer de scores voor het laatst zijn bijgewerkt
- Deelknop in de footer
- Contactlink in de footer via `mailto:moisemaatje2@gmail.com`
- Link naar de admin-login in de footer: `/admin-login.html`
- Admin-login
- Admin dashboard
- Updates aanmaken, bewerken en verwijderen
- Foto's uploaden bij updates
- Foto's opslaan via Netlify Blobs
- Data opslaan in Netlify Database/Postgres
- Markdown-opmaak voor updates

## Projectstructuur

```txt
index.html
wedstrijden.html
admin-login.html
admin-overview.html
admin-create.html
admin-edit.html
setup.html
assets/
  css/app.css
  js/app.js
netlify/
  functions/
    setup-db.js
    auth-login.js
    auth-check.js
    updates.js
    admin-updates.js
    update-get.js
    update-create.js
    update-edit.js
    update-delete.js
    update-like.js
    matches.js
    photo.js
    photo-delete.js
    _shared.js
database/
  schema.sql
  002_add_match_cache.sql
netlify.toml
package.json
.env.example
```

## Deploy op Netlify

1. Upload deze map naar GitHub of vervang je bestaande repo met deze bestanden.
2. Koppel de GitHub repo aan Netlify.
3. Netlify gebruikt `index.html` direct vanuit de hoofdmap.
4. Voeg Netlify Database toe aan de site.
5. Zet de environment variables.
6. Deploy de site.
7. Open `/setup.html` om de tabellen en eerste admin aan te maken.
8. Log in via `/admin-login.html`.

## Environment variables

Zet deze waarden in Netlify:

```txt
JWT_SECRET=een-lange-random-geheime-string
ADMIN_SETUP_SECRET=een-tijdelijke-setup-code
```

De app probeert automatisch Netlify Database te gebruiken. Als dat niet werkt, zet dan handmatig je read/write Postgres connection string als:

```txt
DATABASE_URL=postgresql://...
```

Optioneel:

```txt
WORLD_CUP26_API_BASE=https://worldcup26.ir
MATCH_TIMEZONE=Europe/Amsterdam
MATCH_CACHE_MINUTES=30
```

## Eenmalige setup

Open na deploy:

```txt
/setup.html
```

Vul daar de setup-code, het admin e-mailadres en het admin wachtwoord in.

Na de setup kun je inloggen via:

```txt
/admin-login.html
```

Voor extra veiligheid kun je na de setup `setup.html` en `netlify/functions/setup-db.js` verwijderen of de `ADMIN_SETUP_SECRET` wijzigen.

## Wedstrijden

De wedstrijdenpagina staat op:

```txt
/wedstrijden.html
```

De data komt uit de open-source WK 2026 API via de Netlify Function:

```txt
/.netlify/functions/matches
```

De API-key van API-Football is niet meer nodig.

## Foto's

Toegestane bestandsformaten:

- JPG
- PNG
- WebP

Limieten:

- Maximaal 5 MB per foto
- Maximaal 5 foto's per uploadactie
