# Oranje Updates - Netlify productieversie

Dit is een Netlify-native webapp voor WK-updates.

## Wat zit erin

- Publieke Nederlandse homepage zonder zichtbare admin-link
- Nieuwste update uitgelicht bovenaan
- Alle updates volledig leesbaar op de homepage
- Like-knop per update
- Deelknop voor de website
- Contactknop via `mailto:moisemaatje2@gmail.com`
- Admin-login via aparte URL: `/admin-login.html`
- Updates aanmaken, bewerken en verwijderen
- Foto's uploaden bij updates
- Foto's opslaan via Netlify Blobs
- Data opslaan in Netlify Database/Postgres
- Markdown-opmaak voor updates

## Projectstructuur

```txt
index.html
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
    photo.js
    photo-delete.js
    _shared.js
database/
  schema.sql
netlify.toml
package.json
.env.example
```

## Deploy op Netlify

1. Upload deze map of koppel hem aan een Git repository.
2. Netlify gebruikt `index.html` direct vanuit de hoofdmap.
3. Voeg Netlify Database toe aan de site.
4. Zet de environment variables.
5. Deploy de site.
6. Open `/setup.html` om de tabellen en eerste admin aan te maken.
7. Log in via `/admin-login.html`.

## Environment variables

Zet deze waarden in Netlify:

```txt
JWT_SECRET=een-lange-random-geheime-string
ADMIN_SETUP_SECRET=een-tijdelijke-setup-code
```

De database connection string moet beschikbaar zijn als een van deze variabelen:

```txt
NETLIFY_DATABASE_URL
NETLIFY_DB_URL
DATABASE_URL
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

## Foto's

Toegestane bestandsformaten:

- JPG
- PNG
- WebP

Limieten:

- Maximaal 5 MB per foto
- Maximaal 5 foto's per uploadactie

## Belangrijk

De admin-link staat bewust nergens op de publieke website. De admin gebruikt zelf de directe URL:

```txt
/admin-login.html
```
