# FrontMusic

En frontend i HTML, CSS, Vue og Axios. Start `index.html` med Live Server på port 5500. Upload `index.html`, `index.css` og `index.js` til `/site/wwwroot` for at opdatere Azure-siden.

## Login og musik

- **Log ind** åbner loginformularen og sender oplysningerne til `/api/Auth/login`.
- Efter login vises **Log ud**, **Tilføj nummer** samt **Opdater** og **Slet** ved hvert nummer.
- Oprettelse og opdatering kræver titel, kunstner, positiv varighed i sekunder og et udgivelsesår fra 1 til 9999.
- **Slet** åbner først en bekræftelse. Nummeret slettes først efter klik på **Slet nummer**.
- Login-tokenet er kun i hukommelsen. Logout og genindlæsning af siden fjerner login; adgangskoden gemmes ikke.
- Favoritter gemmes fortsat i browserens localStorage og bevares, når et favoritnummer omdøbes via denne frontend.

Frontend sender Bearer-token med POST, PUT og DELETE. Backend skal selv kontrollere adgang. Backend har nu JWT-validering og Admin-beskyttelse af POST, PUT og DELETE. På Azure skal Jwt__Key sættes, og den opdaterede backend skal publiceres, før login virker på hjemmesiden. Se backendens JWT-SETUP.md.

## Test

Kør frontendens 17 unittests uden at ændre Azure-data:

```powershell
node --test tests/admin.test.cjs
```

De bruger et test-API i hukommelsen og kontrollerer login, logout, de sendte data, token-header, validering og fejltilstande. De kontrollerer ikke serverens JWT-opsætning.

Browserens Selenium-tests ligger i den separate MusicTest-løsning.

## Musiknumrenes id

Backend bestemmer id ved oprettelse. Frontend bruger det til PUT og DELETE og til favoritter; brugeren skal aldrig udfylde det. En titelændring beholder samme id og favorit.

Publicér backend med id-adresserne, før den nye index.js uploades. De nye adresser er GET/PUT/DELETE `/api/Collection/{id}`. Liste og søgning er fortsat GET `/api/Collection?title=...&artist=...`. Gamle lokale favoritter baseret på titel/kunstner overføres til id ved indlæsning af hele samlingen.
