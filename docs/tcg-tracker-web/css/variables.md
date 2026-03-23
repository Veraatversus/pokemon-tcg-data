# CSS Variables

← [../README.md](../README.md) | [overview.md](overview.md)

---

## Zweck

Dokumentiert Design-Tokens und zentrale CSS Custom Properties.

## Primäre Quellen

- `frontend/tcg-tracker-web/css/main.css` (derzeit)
- künftige Auslagerung nach `css/base/variables.css`

## Typische Token-Gruppen

- Farbwerte (`--color-*`)
- Abstände (`--space-*`)
- Radius/Border (`--radius-*`, `--border-*`)
- Typografie (`--font-*`, `--line-height-*`)
- Z-Index-Layer (`--z-*`)

## Regeln

1. Neue Farben zuerst als Token definieren, nicht inline hartkodieren.
2. Komponenten verwenden nur semantische Token, keine Hex-Werte.
3. Theme-Overrides ändern Token, nicht Komponentenregeln direkt.

## Verwandte Seiten

- [overview.md](overview.md)
- [../architecture.md](../architecture.md)
