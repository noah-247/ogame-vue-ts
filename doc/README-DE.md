<div align="center">
  <img src="public/logo.svg" alt="OGame Vue TS Logo" width="128" height="128">

  # OGame Vue TS

  Ein modernes Weltraum-Strategiespiel basierend auf dem klassischen OGame, entwickelt mit Vue 3 und TypeScript.

  [![GitHub Release](https://img.shields.io/github/v/release/setube/ogame-vue-ts?style=flat&logo=github&label=Release)](https://github.com/setube/ogame-vue-ts/releases/latest)
  [![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0)
  [![Tap Tap](https://img.shields.io/badge/TapTap-OGame%20Vue%20Ts-18d6e0)](https://www.taptap.cn/app/801190)

  [简体中文](../README.md)| [繁體中文](README-zh-TW.md) | [English](README-EN.md)  | Deutsch | [Русский](README-RU.md) | [Español](README-ES.md) | [한국어](README-KO.md) | [日本語](README-JA.md)

</div>

## Über das Projekt

OGame Vue TS ist ein Einzelspieler-Weltraum-Strategiespiel im Browser, inspiriert vom klassischen OGame. Baue dein Imperium in der Galaxie auf, erforsche Technologien, konstruiere Raumschiffe und nimm an epischen Weltraumschlachten teil. Dieses Projekt wurde mit modernen Webtechnologien entwickelt und läuft vollständig im Browser mit lokaler Datenspeicherung.

## Was dieser Fork ändert

> Upstream: https://github.com/setube/ogame-vue-ts | Online spielen: https://ogame-combat-demo.pagi.workers.dev

Nach einiger Spielzeit haben mich drei Dinge so gestört, dass ich sie gleich behoben habe:

### ⚔️ Kampf: nach echten OGame-Regeln neu geschrieben
Der ursprüngliche Kampf war vereinfacht — kein Schnellfeuer, keine Schildregeneration, keine Explosionen. Das fühlte sich einfach nicht richtig an. Jetzt folgt er den echten OGame-Regeln (`src/workers/battleEngine.ts`):
- Schilde regenerieren sich jede Runde vollständig; reicht der Angriff nicht zum Durchbrechen, kratzt er nur am Lack, und Angriffe unter 1 % der Schildstärke prallen einfach ab
- Hülle = 10 % der Baukosten; ein Schiff unter 70 % Hülle kann auf der Stelle explodieren
- Schnellfeuer funktioniert endlich: Nach jedem Schuss — Treffer oder nicht, Abschuss oder nicht — wird bei einem RF-Wert >1 gegen den Zieltyp mit (RF-1)/RF Wahrscheinlichkeit sofort noch einmal gefeuert
- Mit 18 deterministischen Tests abgesichert, an klassischen OGame-Schlachtbeispielen geprüft

### 🔧 Ein Datenfehler nebenbei behoben
Die Spionagesonde hatte Angriff und Schildstärke 0, was nicht dem echten OGame entspricht. Auf 5 / 10 zurückgesetzt.

### ⏩ Kein Warten mehr im Endgame: Vorspulen
- Spielgeschwindigkeit von max. 10x auf 100x erhöht
- Zeitraffer per Klick (+1 Std. / +8 Std. / +24 Std.) auf der Übersichtsseite — Ressourcen, Bauaufträge und Flotten werden auf einmal abgerechnet, mit einer Sammelmitteilung statt Mitteilungsflut

### ☁️ Deployment: reines Cloudflare-Workers-Frontend
Dieses Spiel ist reines Frontend — es braucht überhaupt keinen Server. Der ganze Go-Server-/Docker-/Electron-/APK-Werkzeugkasten aus der ursprünglichen README ist eigentlich überflüssig. Die Demo dieses Forks läuft genau so:
1. `pnpm build` (Build-Ausgabe in `docs/`)
2. Eine `wrangler.toml` schreiben mit `[assets] directory = "./docs"`
3. `wrangler deploy` — fertig. Kein Server, kein Ops-Aufwand, das Cloudflare-Free-Kontingent reicht locker.
## Hauptfunktionen

- **Gebäudeverwaltung** - Baue und verbessere verschiedene Gebäude auf Planeten und Monden
- **Technologieforschung** - Schalte fortschrittliche Technologien frei, um dein Imperium zu stärken
- **Flottenverwaltung** - Baue Schiffe, sende Missionen und nimm an taktischen Weltraumkämpfen teil
- **Verteidigungssysteme** - Errichte Verteidigungsanlagen zum Schutz deiner Kolonien
- **Offiziersystem** - Rekrutiere Offiziere für strategische Vorteile
- **Kampfsimulator** - Teste Kampfszenarien, bevor du Ressourcen einsetzt
- **Galaxieansicht** - Erkunde das Universum und interagiere mit anderen Planeten
- **Lokale Datenspeicherung** - Alle Spieldaten werden verschlüsselt im Browser gespeichert
- **Dunkler/Heller Modus** - Wähle dein bevorzugtes visuelles Thema
- **Warteschlangenverwaltung** - Verwalte mehrere Bau- und Forschungswarteschlangen
- **Mondgenerierung** - Wahrscheinlichkeitsbasierte Monderzeugung aus Trümmerfeldern

## Technologie-Stack

- **Frontend-Framework:** [Vue 3](https://vuejs.org) + Composition API (`<script setup>` Syntax)
- **Programmiersprache:** [TypeScript](https://www.typescriptlang.org) (mit strikter Typprüfung)
- **Build-Tool:** [Vite](https://vitejs.dev) (Custom Rolldown-Vite 7.2.5), [Golang](https://golang.org) (für plattformübergreifenden Webserver), [Electron](https://www.electronjs.org) (für plattformübergreifende Desktop-Anwendung)
- **Zustandsverwaltung:** [Pinia](https://pinia.vuejs.org) + Persistenz-Plugin
- **Routing:** [Vue Router 4](https://router.vuejs.org)
- **UI-Komponenten:** [shadcn-vue](https://www.shadcn-vue.com) (New York Stil)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com) + CSS-Variablen
- **Icons:** [Lucide Vue Next](https://lucide.dev)
- **Animationen:** [tw-animate-css](https://www.npmjs.com/package/tw-animate-css)
- **Internationalisierung:** Eigene i18n-Implementierung

## Schnellstart

### Voraussetzungen

- [Node.js](https://nodejs.org) (Version 18 oder höher empfohlen)
- [pnpm](https://pnpm.io) (Version 10.13.1 oder höher)
- [Go](https://golang.org) (Version 1.21 oder höher) (optional)

### Installation

```bash
# Repository klonen
git clone https://github.com/setube/ogame-vue-ts.git

# In das Projektverzeichnis wechseln
cd ogame-vue-ts

# Abhängigkeiten installieren
pnpm install
```

### Entwicklung

```bash
# Entwicklungsserver starten (läuft auf Port 25121)
pnpm dev
```

Öffne deinen Browser und besuche `http://localhost:25121`

### Produktions-Build

```bash
# Anwendung bauen
pnpm build

# Produktions-Build vorschauen
pnpm preview
```

## Datensicherheit

Alle Spieldaten werden automatisch mit AES-Verschlüsselung verschlüsselt, bevor sie im lokalen Speicher des Browsers gespeichert werden. Dein Spielfortschritt ist sicher und privat.

## Anpassung

Die Anwendung unterstützt vollständige Theme-Anpassung durch Tailwind CSS-Variablen, die in `src/style.css` definiert sind. Du kannst einfach zwischen hellem und dunklem Modus wechseln.

## Dokumentation

- [Docker-Bereitstellungsanleitung](DOCKER.md)
- [Spielreferenzhandbuch](ogame-reference.md) - Vollständige Daten zu Gebäuden, Technologien, Schiffen, Verteidigung, Offizieren usw.

## Mitwirken

Beiträge sind willkommen! Bitte zögere nicht, Issues oder Pull Requests einzureichen.

## Lizenz

Dieses Werk ist lizenziert unter der [Creative Commons Namensnennung-Nicht kommerziell 4.0 International Lizenz](https://creativecommons.org/licenses/by-nc/4.0).

### Du darfst:
- **Teilen** — das Material in jedwedem Format oder Medium vervielfältigen und weiterverbreiten
- **Bearbeiten** — das Material remixen, verändern und darauf aufbauen

### Unter folgenden Bedingungen:
- **Namensnennung** — Du musst angemessene Urheber- und Rechteangaben machen, einen Link zur Lizenz beifügen und angeben, ob Änderungen vorgenommen wurden
- **Nicht kommerziell** — Du darfst das Material nicht für kommerzielle Zwecke nutzen

## Danksagung

Dieses Projekt wurde vom originalen [OGame](https://ogame.org) Browserspiel inspiriert. Alle Spielmechaniken und Designelemente wurden zu Bildungs- und Unterhaltungszwecken neu implementiert.

## Haftungsausschluss

Dieses Projekt ist nicht mit Gameforge AG oder dem offiziellen OGame-Spiel verbunden, wird nicht von diesen unterstützt oder ist mit diesen verbunden. Es ist ein unabhängiges Fan-Projekt, das zu Bildungszwecken und zur persönlichen Unterhaltung erstellt wurde.

---

<div align="center">
  Mit ❤️ erstellt von <a href="https://github.com/setube">setube</a>
  <br>
  © 2025 - Alle Rechte vorbehalten (außer den durch die CC BY-NC 4.0 Lizenz gewährten Rechten)
</div>
