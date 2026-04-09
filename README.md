# Pokémon TCG Data

[![Discord](https://img.shields.io/badge/Pokémon%20TCG%20Developers-%237289DA.svg?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/dpsTCvg)
[![Patreon](https://img.shields.io/badge/Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white)](https://www.patreon.com/bePatron?u=8336557)
[![Ko-Fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/Z8Z25AVR)

This fork contains the raw data found within the [Pokémon TCG API](https://pokemontcg.io/) and adds Vera's automated branch pipeline plus Cardmarket enrichment for the tracker.

## Automation overview

- **`master`** – minimal integration branch; receives the daily dual-upstream sync and the rebuilt static `cardmarket/` API artifacts.
- **`dev`** – default development and preview branch; keeps the full app/docs and is verified before release.
- **`release`** – stable deployment branch for GitHub Pages and the production snapshot.

## Cardmarket static API

The generated Cardmarket data lives at repo root under `cardmarket/` and is rebuilt from the current upstream Cardmarket feeds:

- `products_singles_6.json`
- `price_guide_6.json`

Generated outputs include:

- `cardmarket/meta.json`
- `cardmarket/index/products.json`
- `cardmarket/index/names.json`
- `cardmarket/index/sets.json`
- `cardmarket/index/tracker.json`
- `cardmarket/sets/<setId>.json`

Further operational details are documented in [`docs/`](docs/README.md).

## Downloading the data

The easiest way to stay up to date and interact with the data is via the [Pokémon TCG API](http://pokemontcg.io/) and one of the associated SDKs. Otherwise, feel free to clone this repository or download a zip from the releases.

## Version 1 and 2 Data

Version 1 data is no longer being maintained. The API for V1 will continue to receive new sets until August 1st, 2021. At this time, V1 of the API will be taken offline, and you MUST be using V2.

If you rely on the V1 data, the `v2_to_v1.rb` Ruby script can generate all JSON files in v1 format.

To install Ruby: https://www.ruby-lang.org/en/documentation/installation/

You will also need the `json` gem: `gem install json`.

Run the script with:

```bash
ruby v2_to_v1.rb
```

This outputs the card data into `/cards/en/v1`.

## Contributing

Please contribute when you see missing or incorrect data.

1. Fork it (`https://github.com/[my-github-username]/pokemon-tcg-data/fork`)
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a Pull Request
