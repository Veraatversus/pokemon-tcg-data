# Pokémon TCG Data

[![Discord](https://img.shields.io/badge/Pokémon%20TCG%20Developers-%237289DA.svg?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/dpsTCvg)
[![Patreon](https://img.shields.io/badge/Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white)](https://www.patreon.com/bePatron?u=8336557)
[![Ko-Fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/Z8Z25AVR)


This is a fork of the data found within the [Pokémon TCG API](https://pokemontcg.io/). Currently, the raw JSON files for all the card information can be found here.

**🔄 Automatische Synchronisation:** Dieses Repository wird täglich automatisch mit dem [Original-Repository](https://github.com/PokemonTCG/pokemon-tcg-data) synchronisiert.

**🌐 GitHub Pages:** Die Daten sind auch über GitHub Pages verfügbar: [https://veraatversus.github.io/pokemon-tcg-data/](https://veraatversus.github.io/pokemon-tcg-data/)

If you find this data useful, consider donating via one of the links above to support the original project. All donations are greatly appreciated!

# Downloading the data

The easiest way to stay up to date and interact with the data is via the [Pokémon TCG API](http://pokemontcg.io/) and one of the associated SDKs. 

**Alternative Möglichkeiten:**
- **GitHub Pages:** Direkter Zugriff auf JSON-Dateien über [https://veraatversus.github.io/pokemon-tcg-data/](https://veraatversus.github.io/pokemon-tcg-data/)
- **Git Clone:** `git clone https://github.com/Veraatversus/pokemon-tcg-data.git`
- **Download:** Download als ZIP vom `release` Branch (stabile Version)

# Version 1 and 2 Data

Version 1 data is no longer being maintained. The API for V1 will continue to receive new sets until August 1st, 2021. At this time, V1 of the API will be taken offline, and you MUST be using V2. You have a 6 month window to migrate to V2.

If you rely on the V1 data, I have provided a `v2_to_v1.rb` Ruby script that you can run to generate all the json files in v1 format.

To install Ruby: https://www.ruby-lang.org/en/documentation/installation/

You will also need the `json` gem: `gem install json`.

Finally, to run the script:

```
ruby v2_to_v1.rb
```

This will output all of the card data into `/cards/en/v1`.

# Branch Structure

Dieses Repository verwendet eine strukturierte Branch-Strategie:

- **`main`** - Hauptbranch, synchronisiert mit dem upstream Repository
- **`release`** - Stabiler Branch für GitHub Pages Deployment
- **`feature/*`** - Feature-Branches für neue Funktionen

📖 **Ausführliche Dokumentation:** Siehe [WORKFLOW_DOCUMENTATION.md](WORKFLOW_DOCUMENTATION.md) für Details zu Workflows und Branch-Strategie.

# Automated Workflows

- **🔄 Sync with Upstream:** Täglich um 2:00 UTC automatische Synchronisation mit dem Original-Repository
- **🔀 Merge to Release:** Automatisches Merge von `main` zu `release` bei Updates
- **🚀 Deploy Pages:** Automatisches Deployment zu GitHub Pages bei `release` Updates

Alle Workflows können auch manuell über GitHub Actions getriggert werden.

# Contributing

Please contribute when you see missing and/or incorrect data.

**For this fork:**
1. Fork it ( https://github.com/Veraatversus/pokemon-tcg-data/fork )
2. Create your feature branch (git checkout -b feature/my-new-feature)
3. Commit your changes (git commit -am 'Add some feature')
4. Push to the branch (git push origin feature/my-new-feature)
5. Create a new Pull Request **against the `main` branch**

**For the original project:**
- Please contribute directly to [PokemonTCG/pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data)
