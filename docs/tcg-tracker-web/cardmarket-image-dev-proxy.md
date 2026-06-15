# Cardmarket-Image-Quelle (dev-only)

## Was

Die Resolver-Matrix für Kartenbilder hat eine vierte optionale Quelle
`cardmarket`. URLs werden zur Laufzeit aus `cardmarketProductId`,
`categoryId` und `ptcgoCode` (z.B. `CRI`) gebaut:

```
https://product-images.s3.cardmarket.com/{categoryId}/{setCode}/{productId}/{productId}.jpg
```

Cardmarket liefert die Bilder hinter einer CloudFront-Hotlink-Prüfung
(Referer muss `https://www.cardmarket.com/` sein). Der Browser kann den
Referer aus Cross-Origin-Sicherheitsgründen nicht fälschen — der einzige
praktikable Weg ist ein **lokaler Dev-Proxy**, der das Bild serverseitig
mit korrektem Referer abruft.

## Wo sichtbar / aktiv

Die Cardmarket-Quelle und der Dev-Proxy sind **nur in lokalen
Dev-Umgebungen** aktiv. Production-Builds (z.B. GitHub Pages unter
`veraatversus.github.io`) verhalten sich exakt wie vorher:

| Verhalten                          | Dev (`localhost`)    | Production |
| ---------------------------------- | -------------------- | ---------- |
| `cardmarket` in `RESOLVER_SOURCES` | ✓                    | ✗          |
| Dropdown `card.image`              | 4 Optionen (mit CM)  | 3 Optionen |
| Dropdown `card.imageLarge`         | 4 Optionen (mit CM)  | 3 Optionen |
| Dropdown `card.name` etc.          | 3 Optionen           | 3 Optionen |
| `cardmarketImageUrl` als Quelle    | ✓ (Fallback-Pos 3)   | ✗          |
| `cardmarketImageProxyUrl` Setting | wird gelesen         | wird ignoriert |
| Proxy-Pfad in `buildCardmarketImageUrl` | wird genutzt    | wird ignoriert |

Die Env-Detection lebt in `js/core/dev-environment.js` (`isLocalDevEnvironment()`).
Sie liefert `true` für `localhost`, `127.0.0.1`, `::1` und private-Netze
(`10.x`, `192.168.x`, `172.16-31.x`). Alles andere ist Production.

## Setup (einmalig)

Die `cardmarketImageProxyUrl` muss im Browser-localStorage unter
`poke:release:user-settings` gesetzt werden:

```js
// In der DevTools-Konsole:
const s = JSON.parse(localStorage.getItem('poke:release:user-settings') || '{}');
s.cardmarketImageProxyUrl = 'http://localhost:8090';
localStorage.setItem('poke:release:user-settings', JSON.stringify(s));
location.reload();
```

## Verwendung

```bash
cd frontend/tcg-tracker-web
npm run start:dev:proxy
```

Startet parallel:

| Port | Dienst                                                  |
| ---- | ------------------------------------------------------- |
| 8080 | `http-server` (App + Cardmarket-JSON + Tracker-Index)   |
| 8090 | `dev-cardmarket-proxy` (Cardmarket-Image-Proxy)         |

`http://localhost:8080/frontend/tcg-tracker-web/index.html` öffnen
und ein Set laden. Karten mit fehlenden/fehlgeschlagenen tcgdex/vera-Bildern
laden Cardmarket-Bilder via Proxy nach.

### Endpoints

- `GET /cardmarket-image-proxy?productId=886394&categoryId=51&setCode=CRI`
  → holt `https://product-images.s3.cardmarket.com/51/CRI/886394/886394.jpg` mit
  `Referer: https://www.cardmarket.com/` und liefert das Bild aus. 30-Tage
  `Cache-Control`.
- `GET /healthz` → `200 ok`
- `OPTIONS /cardmarket-image-proxy` → CORS-Preflight

### Konfiguration

- `CARDMARKET_PROXY_PORT` (default `8090`): Port des Proxys
- `CARDMARKET_PROXY_CORS` (default `*`): `Access-Control-Allow-Origin`

## Resolver-Matrix (Expert-Modus)

`Einstellungen → Expert Resolver Modus aktivieren → Karten-Felder → image`

Vier Optionen stehen in Dev zur Auswahl (Production zeigt sie nicht):

| Reihenfolge                  | Was passiert bei Karten-Render |
| ---------------------------- | ------------------------------ |
| `Cardmarket > TCGDex > Vera > Legacy` | Cardmarket als primäres Bild (nur wenn URL vorhanden) |
| `TCGDex > Cardmarket > Vera > Legacy` | TCGDex primär, Cardmarket als 1. Fallback |
| `TCGDex > Vera > Cardmarket > Legacy` | TCGDex/Vera primär, Cardmarket als 2. Fallback (Default) |
| `TCGDex > Vera > Legacy > Cardmarket` | Cardmarket nur als letzter Ausweg |

Andere Felder (Name, Rarity, HP, …) bleiben 3-Quellen-Defaults, da die
Cardmarket-URL nur für Bilder sinnvoll ist.

## Code-Architektur

```
js/core/dev-environment.js        ← isLocalDevEnvironment() (loopback + private-net detector)
js/data/schema-contract.js       ← RESOLVER_SOURCES & DEFAULT_MATRIX dynamisch (cardmarket nur in dev)
js/data/cardmarket-ui-helpers.js ← buildCardmarketImageUrl({ productId, categoryId, setCode, proxyUrl })
                                   → env-gated: proxyUrl nur in dev wirksam
js/data/cardmarket-data.js       ← getCardmarketImageProxyUrl() (liest aus localStorage, '' in prod)
                                   → wrapper buildCardmarketImageUrl injiziert proxyUrl automatisch
js/ui/components.js              ← resolverImageOptions + Default-Order nur in dev
                                   (IMAGE_FIELDS bleibt; getResolverOptionsForField gated)
scripts/dev-cardmarket-proxy.mjs ← standalone Node-Proxy
scripts/dev-proxy-runner.mjs     ← startet http-server + Proxy parallel
```

## Produktiv-Deployment (Out of Scope)

GitHub Pages unterstützt keine Server-Endpoints. Wer das Cardmarket-Feature
in Production haben will, muss den Proxy auf einen externen Dienst
auslagern — z.B.:

- **Cloudflare Worker** (empfohlen): kostenlos bis 100k Requests/Tag,
  Edge-Cache eingebaut, ~5ms Latency. Worker-Skript analog zu
  `scripts/dev-cardmarket-proxy.mjs` (Request handler kopieren).
- **Vercel Edge Function** / **Netlify Function**: ähnlich.
- **GitHub Actions als Proxy**: technisch möglich (Cold-Start 10-30s), aber
  nicht für End-User-Traffic gedacht und von GitHub nicht offiziell
  unterstützt.

In allen Fällen muss `cardmarketImageProxyUrl` in den Settings auf die
öffentliche URL des Proxys gesetzt werden.

## ToS-Hinweis

Cardmarkets Hotlink-Schutz ist eine bewusste Entscheidung — der hier
implementierte Workaround umgeht ihn. Im lokalen Dev ist das vertretbar.
In Production verstößt es gegen Cardmarkets Nutzungsbedingungen und kann
dazu führen, dass der Datenfeed (siehe `cardmarket/`) irgendwann gesperrt
wird. Empfehlung: Cardmarket-Bilder nur als Reserve-Fallback nutzen und
in Production **deaktiviert lassen** (was durch das Env-Gating
automatisch passiert).
