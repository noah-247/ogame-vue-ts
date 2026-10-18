<div align="center">
  <img src="public/logo.svg" alt="OGame Vue TS Logo" width="128" height="128">

  # OGame Vue TS

  A modern of the classic OGame space strategy game, built with Vue 3 and TypeScript.

  [![GitHub Release](https://img.shields.io/github/v/release/setube/ogame-vue-ts?style=flat&logo=github&label=Release)](https://github.com/setube/ogame-vue-ts/releases/latest)
  [![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0)
  [![Tap Tap](https://img.shields.io/badge/TapTap-OGame%20Vue%20Ts-18d6e0)](https://www.taptap.cn/app/801190)

  [简体中文](../README.md)| [繁體中文](README-zh-TW.md) | English  | [Deutsch](README-DE.md) | [Русский](README-RU.md) | [Español](README-ES.md) | [한국어](README-KO.md) | [日本語](README-JA.md)

</div>

## About

OGame Vue TS is a single-player, browser-based space strategy game inspired by the classic OGame. Build your empire across the galaxy, research technologies, construct ships, and engage in epic space battles. This project is built with modern web technologies, offering a smooth and responsive gaming experience entirely in your browser with local data persistence.

## What This Fork Changes

> Upstream: https://github.com/setube/ogame-vue-ts | Play online: https://ogame-combat-demo.pagi.workers.dev

After playing it for a while, three things bugged me enough to fix:

### ⚔️ Combat: rewritten to match real OGame
The original combat was simplified — no rapid fire, shields never regenerated, ships never exploded. It just didn't feel right. So I rewrote it against the real OGame rules (`src/workers/battleEngine.ts`):
- Shields fully regenerate each round; if your attack can't break the shield it only scratches the paint, and attacks below 1% of shield strength just bounce off
- Hull is 10% of build cost; a ship below 70% hull can explode on the spot
- Rapid fire finally works: after every shot — hit or miss, destroyed or not — an RF value above 1 against that target type gives a (RF-1)/RF chance to fire again immediately — very satisfying
- Covered by 18 deterministic tests, checked against classic OGame battle examples

### 🔧 Fixed a data bug along the way
The espionage probe had 0 attack and 0 shield, which doesn't match real OGame. Restored to 5 / 10.

### ⏩ No more idling in the late game: fast-forward
- Game speed cap raised from 10x to 100x
- One-click time skip (+1h / +8h / +24h) on the overview page — resources, build queues and fleets all resolve at once, with a single summary notification instead of a spam storm

### ☁️ Deployment: pure Cloudflare Workers frontend
This game is pure frontend — it doesn't need a server at all. The whole Go server / Docker / Electron / APK toolbox from the original README is actually unnecessary. This fork's demo is deployed exactly like this:
1. `pnpm build` (artifacts in `docs/`)
2. Write a `wrangler.toml` with `[assets] directory = "./docs"`
3. `wrangler deploy` — done. Zero servers, zero ops, the Cloudflare free quota is more than enough.
## Features

- **Building Management** - Construct and upgrade various buildings on planets and moons
- **Research Technologies** - Unlock advanced technologies to enhance your empire
- **Fleet Management** - Build ships, send missions, and engage in tactical space battles
- **Defense Systems** - Deploy defensive structures to protect your colonies
- **Officers System** - Recruit officers to gain strategic advantages
- **Battle Simulator** - Test combat scenarios before committing resources
- **Galaxy View** - Explore the universe and interact with other planets
- **Local Data Persistence** - All game data is encrypted and stored locally in your browser
- **Dark/Light Mode** - Choose your preferred visual theme
- **Queue Management** - Manage multiple build and research queues
- **Moon Generation** - Chance-based moon creation from debris fields

## Tech Stack

- **Frontend Framework:** [Vue 3](https://vuejs.org) with Composition API (`<script setup>`)
- **Language:** [TypeScript](https://www.typescriptlang.org) with strict type checking
- **Build Tool:** [Vite](https://vitejs.dev) (Custom Rolldown-Vite 7.2.5)、[Golang](https://golang.org)(Building cross-platform Web server.)、[Electron](https://www.electronjs.org)(Building cross-platform visual interfaces)
- **State Management:** [Pinia](https://pinia.vuejs.org) with persisted state plugin
- **Routing:** [Vue Router 4](https://router.vuejs.org)
- **UI Components:** [shadcn-vue](https://www.shadcn-vue.com) (New York style)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com) with CSS variables
- **Icons:** [Lucide Vue Next](https://lucide.dev)
- **Animations:** [tw-animate-css](https://www.npmjs.com/package/tw-animate-css)
- **Internationalization:** Custom i18n implementation

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) (version 18 or higher recommended)
- [pnpm](https://pnpm.io) (version 10.13.1 or higher)
- [Go](https://golang.org) (version 1.21 or higher recommended) (optional for binary builds)

### Installation

```bash
# Clone the repository
git clone https://github.com/setube/ogame-vue-ts.git

# Navigate to project directory
cd ogame-vue-ts

# Install dependencies
pnpm install
```

### Development

```bash
# Start development server (runs on port 25121)
pnpm dev
```

Open your browser and visit `http://localhost:25121`

### Build for Production

```bash
# Build the application
pnpm build

# Preview production build
pnpm preview
```

## Data Security

All game data is automatically encrypted using AES encryption before being stored in your browser's local storage. Your game progress is secure and private.

## Customization

The application supports full theme customization through Tailwind CSS variables defined in `src/style.css`. You can easily switch between light and dark modes.

## Documentation

- [Docker Deployment Guide](DOCKER.md)
- [Game Reference Manual](ogame-reference.md) - Complete data for buildings, technologies, ships, defense, officers, etc.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

This work is licensed under the [Creative Commons Attribution-NonCommercial 4.0 International License](https://creativecommons.org/licenses/by-nc/4.0).

### You are free to:
- **Share** — copy and redistribute the material in any medium or format
- **Adapt** — remix, transform, and build upon the material

### Under the following terms:
- **Attribution** — You must give appropriate credit, provide a link to the license, and indicate if changes were made
- **NonCommercial** — You may not use the material for commercial purposes

**Original Author:** Jun Qian (谦君)

## Acknowledgments

This project is inspired by the original [OGame](https://ogame.org) browser game. All game mechanics and design elements are reimplemented for educational and entertainment purposes.

## Disclaimer

This project is not affiliated with, endorsed by, or connected to Gameforge AG or the official OGame game. It is an independent fan project created for educational purposes and personal enjoyment.

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/setube">setube</a>
  <br>
  © 2025 - All rights reserved (except those granted by CC BY-NC 4.0 License)
</div>
