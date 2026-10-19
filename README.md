# Tavernlight

A virtual tabletop **compatible with the 5th edition** (SRD 5.2): character builder and interactive sheets, server-side dice, map editor with walls, doors and fog of war, bestiary and encounter builder, assisted combat, and two synchronized views. The game master's screen shows everything; the players' view (TV, projector) shows only what the characters can see. It also has an Android app built with React Native and Expo.

## Quick start (Docker)

```bash
docker compose up --build
```

Open <http://localhost:3000>. On first start, the server applies the database migrations, imports the SRD and creates the demo campaign. All three steps are skipped when already done.

| Account | Role | Password |
|---|---|---|
| `gm@tavernlight.test` | Game master of *The Lantern of Hollowmere* | `tavernlight` |
| `alex@` `sam@` `robin@` `charlie@tavernlight.test` | Players (Thorin, Lyra, Mira, Pip) | `tavernlight` |

The demo campaign contains:
- 4 characters of different classes and levels: Fighter 5, Wizard 3, Cleric 4, Rogue 1.
- 3 maps: a crypt with walls, doors and a secret door; a forest road on a hex grid; an ogre's cave.
- One encounter per map, plus notes, NPCs, quests and documents to reveal.

To play: log in as the GM, open the campaign, then click **Open the GM table** and **Open the players' view**. Drag the second window to the TV.

## Development

Requirements: Node.js ≥ 22, pnpm 10 (`corepack enable`), Docker (for PostgreSQL).

```bash
pnpm setup      # install, .env, build packages, start the DB, migrate, import the SRD, seed the demo
pnpm dev        # API on :3000 (watch) + web app on http://localhost:5173 (Vite, proxied to the API)
```

PostgreSQL from `docker compose up -d db` listens on **port 5433** on the host, so it can't collide with a local PostgreSQL. All settings are in `.env` (see `.env.example`).

| Command | What it does |
|---|---|
| `pnpm srd:import` | Imports the pinned SRD dataset (`data/srd/5e-database-v5.12.0`) with the overrides of `data/rules`. Safe to run again: an identical import is just re-activated (`--dry-run`, `--force`). |
| `pnpm srd:fetch` | Downloads the raw SRD files of `SRD_VERSION` (only needed to change the version). |
| `pnpm seed:demo` | Creates the demo campaign (`-- --reset` recreates it). |
| `pnpm build` / `pnpm typecheck` | Builds or typechecks every package (Turborepo). |
| `pnpm mobile` | Starts the Expo dev server for the mobile app. |

The API documentation (OpenAPI) is served at <http://localhost:3000/api/docs>.

### Mobile app (Android)

```bash
cp apps/mobile/.env.example apps/mobile/.env   # EXPO_PUBLIC_API_URL; 10.0.2.2 = the host, seen from the Android emulator
pnpm mobile                                    # then press "a" to open the Android emulator, or scan the QR code with Expo Go
```

On a physical phone, set `EXPO_PUBLIC_API_URL` to your computer's LAN address, for example `http://192.168.1.20:3000`. The app covers character creation (with the same rules engine as the web app), the character sheet, and dice.

## Project layout

```
packages/
  dice/     Dice notation parser, roller (injectable RNG) and exact probability calculator
  engine/   Rules engine: character derivation & validation, level up, rests, combat resolution
            (proposal → apply → undo), encounter difficulty, grids, line of sight, fog, area templates,
            players' view filtering
  shared/   API contracts: request schemas (zod), response and socket types
apps/
  server/   NestJS + Prisma (PostgreSQL) + Socket.IO; SRD importer; demo seed
  web/      React + Vite + React Aria Components + Tailwind + PixiJS
  mobile/   React Native + Expo (Android)
data/
  srd/      Pinned raw SRD 5.2 dataset (5e-bits/5e-database)
  rules/    Hand-written rules data: structured effects for class features, species, feats, spells,
            encounter tables (the "rules as data" overrides)
```

### How the pieces fit

- **Rules are data.** The importer turns the SRD into the Tavernlight rules format (`packages/engine/src/rules/types.ts`). Spells, monster actions and features are described with a few generic effects: attack, save, damage, healing, condition, modifier, free effect. The engine interprets those structures and never reads rules text. Spells that the importer can't structure automatically are described by hand in `data/rules/spells.json`.
- **The server is authoritative.** Dice use `crypto.randomInt`. Combat actions are computed on the server as a *proposal* that the GM reviews, edits and applies. Every applied result is stored in the game log with the operations needed to undo it.
- **Two views, filtered on the server.** After every change, the server builds two snapshots: the full GM view and a players' view without the GM layer, hidden tokens, hidden rolls, notes or unrevealed areas. The map background itself is masked on the server for the players.

## Licences and attribution

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Tavernlight is compatible with the 5th edition and is not affiliated with Wizards of the Coast. Structured SRD data comes from [5e-bits/5e-database](https://github.com/5e-bits/5e-database). The interface icons are [Lucide](https://lucide.dev) (ISC). The logo, map tiles, decor and tokens are vector shapes drawn for Tavernlight.
