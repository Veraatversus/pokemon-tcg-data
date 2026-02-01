# GitHub Copilot Instructions

This document provides context and guidelines for GitHub Copilot when working with this repository.

## Project Overview

This is a Pokémon Trading Card Game (TCG) data repository that serves as a fork of [PokemonTCG/pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data). It contains JSON files with comprehensive card data in multiple languages and is automatically synchronized with the upstream repository.

## Repository Structure

- `/cards/` - Card data organized by language (en, de, es, fr, it, la, ptbr)
- `/sets/` - Set information files (one JSON file per language)
- `/decks/` - Deck data
- `v2_to_v1.rb` - Ruby script for converting v2 data format to v1
- `.github/workflows/` - Automated workflows for sync, merge, and deployment

## Key Technologies

- **Data Format**: JSON files with 2-space indentation (see `.editorconfig`)
- **Scripting**: Ruby (for data conversion scripts)
- **Automation**: GitHub Actions workflows
- **Deployment**: GitHub Pages

## Branch Strategy

This repository uses a structured three-branch strategy:

1. **`main`** - Primary branch, synchronized with upstream repository
2. **`release`** - Stable branch for GitHub Pages deployment
3. **`feature/*`** - Feature branches for new contributions

### Important Rules:
- **Never push directly to `release`** - All changes must go through `main` first
- Use feature branches for all modifications
- Pull requests should target the `main` branch

## Automated Workflows

1. **Sync with Upstream** (`.github/workflows/sync-upstream.yml`)
   - Runs daily at 2:00 UTC
   - Synchronizes `main` with upstream repository
   - Creates issues on merge conflicts

2. **Merge to Release** (`.github/workflows/merge-to-release.yml`)
   - Triggered on push to `main`
   - Automatically merges `main` into `release`
   - Creates issues on merge conflicts

3. **Deploy to GitHub Pages** (`.github/workflows/deploy-pages.yml`)
   - Triggered on push to `release`
   - Deploys content to GitHub Pages

## Data Guidelines

### JSON File Format
- Use 2-space indentation (enforced by `.editorconfig`)
- Follow existing structure patterns in card and set files
- Maintain consistency across language variants

### Card Data Structure
- Each card set has its own JSON file (e.g., `base1.json`, `bw1.json`)
- Files are organized by language in `/cards/{language}/`
- Preserve all existing fields when modifying cards

### Set Data
- Set information is stored in `/sets/{language}.json`
- Each language has a single consolidated sets file

## Contributing

When making changes:

1. **Data Changes**: Follow the existing JSON structure precisely
2. **Workflow Changes**: Test thoroughly with manual workflow runs
3. **Documentation**: Update relevant .md files when changing functionality
4. **Ruby Scripts**: Maintain compatibility with existing data formats

## Conflict Resolution

If automatic workflows fail due to merge conflicts:
- An issue will be automatically created with resolution instructions
- Follow the provided git commands to resolve conflicts locally
- Refer to `WORKFLOW_DOCUMENTATION.md` for detailed conflict resolution steps

## Testing and Validation

This is a data repository without traditional unit tests:
- Validate JSON syntax after changes
- Verify data structure matches existing patterns
- Test workflows manually via GitHub Actions UI when modifying workflow files
- For Ruby scripts, ensure compatibility with existing JSON structure

## Documentation

- `README.md` - General repository information and usage
- `ARCHITECTURE.md` - Visual workflow architecture diagrams
- `WORKFLOW_DOCUMENTATION.md` - Detailed workflow and branch strategy documentation
- `QUICKSTART.md` - Quick reference for common tasks
- `SETUP.md` - Initial setup instructions

## Language Support

The repository supports multiple languages:
- **en** - English
- **de** - German (Deutsch)
- **es** - Spanish
- **fr** - French
- **it** - Italian
- **la** - Latin America Spanish
- **ptbr** - Brazilian Portuguese

When working with multilingual content, maintain consistency across all language variants.

## Best Practices

1. **Minimal Changes**: Make the smallest possible changes to achieve the goal
2. **Preserve Data Integrity**: Never remove or modify working data files unless absolutely necessary
3. **Follow Existing Patterns**: Match the structure and style of existing files
4. **Respect Upstream**: Remember this is a fork - major structural changes should be considered carefully
5. **Test Workflows**: Always test workflow changes manually before merging
6. **Document Changes**: Update documentation when modifying processes or structures

## GitHub Pages

The repository is deployed to: https://veraatversus.github.io/pokemon-tcg-data/

Changes to the `release` branch automatically trigger a new deployment.

## Original Project

This fork maintains synchronization with:
- **Original Repository**: https://github.com/PokemonTCG/pokemon-tcg-data
- **Pokémon TCG API**: https://pokemontcg.io/

Support the original project maintainers if this data is useful to you.
