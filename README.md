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


## Wedstrijdenpagina met API-Football

Deze versie bevat een extra publieke pagina:

```txt
/wedstrijden.html
```

Deze pagina toont gespeelde WK-wedstrijden bovenaan en komende wedstrijden onderaan. Wedstrijden van vandaag krijgen een aparte sectie. Bij het openen van de pagina springt de browser automatisch naar de eerste wedstrijd van vandaag die nog niet is afgelopen. Als alle wedstrijden van vandaag al gespeeld zijn, springt de pagina naar de wedstrijden van vandaag.

### API-Football instellen

Maak een account aan bij API-Football / API-SPORTS en haal je API key op. Voeg daarna in Netlify deze Environment variable toe:

```txt
API_FOOTBALL_KEY=je-api-key
```

De app gebruikt standaard deze instellingen:

```txt
API_FOOTBALL_LEAGUE=1
API_FOOTBALL_SEASON=2026
API_FOOTBALL_TIMEZONE=Europe/Amsterdam
MATCH_CACHE_MINUTES=30
```

`league=1` en `season=2026` zijn bedoeld voor de FIFA World Cup 2026. Als je een andere competitie of seizoen wilt gebruiken, pas je deze environment variables aan in Netlify.

Na het toevoegen van environment variables moet je de site opnieuw deployen.

### Database-update voor wedstrijden

De wedstrijden worden tijdelijk gecachet in de database, zodat je niet bij elke bezoeker direct een nieuwe API-call doet. De setup-functie maakt automatisch de tabel `match_cache` aan wanneer je `/setup.html` opnieuw gebruikt.

Je kunt de tabel ook handmatig aanmaken met:

```txt
database/002_add_match_cache.sql
```

Bestaande updates en admin-gebruikers blijven behouden.
