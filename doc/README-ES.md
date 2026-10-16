<div align="center">
  <img src="public/logo.svg" alt="OGame Vue TS Logo" width="128" height="128">

  # OGame Vue TS

  Un juego de estrategia espacial moderno basado en Vue 3 y TypeScript.

  [![GitHub Release](https://img.shields.io/github/v/release/setube/ogame-vue-ts?style=flat&logo=github&label=Release)](https://github.com/setube/ogame-vue-ts/releases/latest)
  [![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0)
  [![Tap Tap](https://img.shields.io/badge/TapTap-OGame%20Vue%20Ts-18d6e0)](https://www.taptap.cn/app/801190)

  [简体中文](../README.md) | [繁體中文](README-zh-TW.md) | [English](README-EN.md) | [Deutsch](README-DE.md) | [Русский](README-RU.md) | Español | [한국어](README-KO.md) | [日本語](README-JA.md)

</div>

## Acerca del Proyecto

OGame Vue TS es un juego de estrategia espacial basado en navegador, versión offline, inspirado en el clásico OGame. Construye tu imperio en la galaxia, investiga tecnologías, construye naves y participa en épicas batallas espaciales. Este proyecto está construido con tecnologías web modernas, se ejecuta completamente en el navegador, ofrece una experiencia de juego fluida y responsiva, y todos los datos se almacenan localmente.

## Qué cambia este fork

> Original: https://github.com/setube/ogame-vue-ts | Jugar online: https://ogame-combat-demo.pagi.workers.dev

Después de jugar un tiempo, hubo tres cosas que no pude aguantar y las arreglé:

### ⚔️ Combate: reescrito según el OGame real
El combate original estaba simplificado — sin fuego rápido, sin regeneración de escudos, sin explosiones. No se sentía bien. Ahora sigue las reglas reales de OGame (`src/workers/battleEngine.ts`):
- Los escudos se regeneran por completo cada ronda; si el ataque no rompe el escudo solo lo araña, y los ataques por debajo del 1 % del escudo simplemente rebotan
- El casco es el 10 % del coste de construcción; una nave por debajo del 70 % del casco puede explotar en el acto
- El fuego rápido por fin funciona: destruyes una nave y puedes disparar de nuevo al instante
- Cubierto con 18 pruebas deterministas, verificadas con ejemplos clásicos de batallas de OGame

### 🔧 Un bug de datos arreglado de paso
La sonda de espionaje tenía ataque y escudo a 0, lo que no coincide con el OGame real. Restaurado a 5 / 10.

### ⏩ Adiós a la espera en el late game: avance rápido
- Velocidad de juego máxima de 10x a 100x
- Avance de tiempo en un clic (+1 h / +8 h / +24 h) en la vista general — recursos, colas de construcción y flotas se resuelven de golpe, con una sola notificación resumen en vez de una avalancha
## Características Principales

- **Gestión de Edificios** - Construye y mejora varios edificios en planetas y lunas
- **Investigación Tecnológica** - Desbloquea tecnologías avanzadas para fortalecer tu imperio
- **Gestión de Flotas** - Construye naves, envía misiones, participa en batallas espaciales tácticas
- **Sistema de Defensa** - Despliega instalaciones defensivas para proteger tus colonias
- **Sistema de Oficiales** - Recluta oficiales para obtener ventajas estratégicas
- **Simulador de Batallas** - Prueba escenarios de combate antes de invertir recursos
- **Vista Galáctica** - Explora el universo e interactúa con otros planetas
- **Persistencia de Datos Local** - Todos los datos del juego están encriptados y almacenados localmente en el navegador
- **Tema Oscuro/Claro** - Elige tu tema visual preferido
- **Gestión de Colas** - Administra múltiples colas de construcción e investigación
- **Generación de Lunas** - Mecanismo de generación de lunas basado en probabilidad desde campos de escombros

## Stack Tecnológico

- **Framework Frontend:** [Vue 3](https://vuejs.org) + Composition API (sintaxis `<script setup>`)
- **Lenguaje de Desarrollo:** [TypeScript](https://www.typescriptlang.org) (verificación de tipos estricta habilitada)
- **Herramientas de Construcción:** [Vite](https://vitejs.dev) (Rolldown-Vite 7.2.5 personalizado), [Golang](https://golang.org) (servidor web multiplataforma), [Electron](https://www.electronjs.org) (interfaz visual multiplataforma)
- **Gestión de Estado:** [Pinia](https://pinia.vuejs.org) + plugin de persistencia
- **Enrutamiento:** [Vue Router 4](https://router.vuejs.org)
- **Componentes UI:** [shadcn-vue](https://www.shadcn-vue.com) (estilo New York)
- **Estilos:** [Tailwind CSS v4](https://tailwindcss.com) + Variables CSS
- **Iconos:** [Lucide Vue Next](https://lucide.dev)
- **Animaciones:** [tw-animate-css](https://www.npmjs.com/package/tw-animate-css)
- **Internacionalización:** Implementación i18n personalizada

## Inicio Rápido

### Requisitos

- [Node.js](https://nodejs.org) (versión 18 o superior recomendada)
- [pnpm](https://pnpm.io) (versión 10.13.1 o superior)
- [Go](https://golang.org) (versión 1.21 o superior) (opcional)

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/setube/ogame-vue-ts.git

# Entrar al directorio del proyecto
cd ogame-vue-ts

# Instalar dependencias
pnpm install
```

### Desarrollo

```bash
# Iniciar servidor de desarrollo (puerto 25121)
pnpm dev
```

Visita `http://localhost:25121` en tu navegador

### Construcción para Producción

```bash
# Construir la aplicación
pnpm build

# Vista previa de la construcción
pnpm preview
```

## Seguridad de Datos

Todos los datos del juego se encriptan automáticamente usando AES antes de almacenarse en el almacenamiento local del navegador. Tu progreso de juego es seguro y privado.

## Personalización

La aplicación soporta personalización completa de temas a través de variables CSS de Tailwind definidas en `src/style.css`. Puedes cambiar fácilmente entre modo claro y oscuro.

## Documentación

- [Guía de despliegue Docker](DOCKER.md)
- [Manual de referencia del juego](ogame-reference.md) - Datos completos de edificios, tecnologías, naves, defensa, oficiales, etc.

## Contribuciones

¡Las contribuciones son bienvenidas! No dudes en enviar issues o pull requests.

## Licencia

Este trabajo está licenciado bajo la [Licencia Creative Commons Atribución-NoComercial 4.0 Internacional](https://creativecommons.org/licenses/by-nc/4.0).

### Eres libre de:
- **Compartir** — Copiar y redistribuir el material en cualquier medio o formato
- **Adaptar** — Remezclar, transformar y construir a partir del material

### Bajo los siguientes términos:
- **Atribución** — Debes dar crédito apropiado, proporcionar un enlace a la licencia e indicar si se realizaron cambios
- **NoComercial** — No puedes usar el material para fines comerciales

## Agradecimientos

Este proyecto está inspirado en el juego de navegador original [OGame](https://ogame.org). Todas las mecánicas de juego y elementos de diseño han sido reimplementados con fines educativos y de entretenimiento.

## Aviso Legal

Este proyecto no está afiliado, respaldado ni conectado con Gameforge AG o el juego oficial OGame. Este es un proyecto independiente de fans creado únicamente con fines educativos y de entretenimiento personal.

---

<div align="center">
  Hecho con ❤️ por <a href="https://github.com/setube">setube</a>
  <br>
  © 2025 - Todos los derechos reservados (excepto los otorgados por la licencia CC BY-NC 4.0)
</div>
