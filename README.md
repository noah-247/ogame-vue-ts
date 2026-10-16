<div align="center">
  <img src="public/logo.svg" alt="OGame Vue TS Logo" width="128" height="128">

  # OGame Vue TS

  一个基于 Vue 3 和 TypeScript 构建的现代化 OGame 太空策略游戏。

  [![GitHub Release](https://img.shields.io/github/v/release/setube/ogame-vue-ts?style=flat&logo=github&label=Release)](https://github.com/setube/ogame-vue-ts/releases/latest)
  [![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0)
  [![Tap Tap](https://img.shields.io/badge/TapTap-OGame%20Vue%20Ts-18d6e0)](https://www.taptap.cn/app/801190)
  
  简体中文 | [繁體中文](doc/README-zh-TW.md) | [English](doc/README-EN.md) | [Deutsch](doc/README-DE.md) | [Русский](doc/README-RU.md) | [Español](doc/README-ES.md) | [한국어](doc/README-KO.md) | [日本語](doc/README-JA.md)

</div>

## 关于项目

OGame Vue TS 是一款受经典 OGame 游戏启发的单机版、基于浏览器的太空策略游戏。在银河系中建立你的帝国，研究科技，建造舰船，参与史诗般的太空战斗。本项目采用现代 Web 技术构建，完全在浏览器中运行，提供流畅且响应迅速的游戏体验，所有数据都存储在本地。

## 本 Fork 的调整（相对上游 setube/ogame-vue-ts）

> 上游：https://github.com/setube/ogame-vue-ts ｜ 试玩站：https://ogame-combat-demo.pagi.workers.dev

### ⚔️ 战斗公式重写为 OGame 原版（`src/workers/battleEngine.ts`）
原版实现是简化版（逐舰船类型随机单发、无连击、无护盾回充、无爆炸判定），已按 OGame 战斗公式逐条还原：
- **护盾**：每轮开始完全恢复；攻击 ≤ 护盾时全吸收，攻击 > 护盾时护盾吸收等量、剩余打船体；攻击 < 护盾 1% 时 99% 跳弹
- **船体**：(金属 + 晶体造价) × 10% × 装甲科技加成；船体低于 70% 时每次受击有 `(1 - 剩余/上限)` 概率爆炸
- **连击 (Rapid Fire)**：击毁目标后以 `(RF-1)/RF` 概率立即再射一次，可连锁触发（原版 config 里有连击表但从未被使用）
- **回合**：攻击方全体先开火、再防守方；6 轮后双方仍有存活则平局；防御设施 70% 概率修复保留
- 引擎支持注入种子 RNG，`scripts/test-battle-engine.ts` 提供 18 项确定性测试（含 OGame 经典战例对照）

### 🔧 数据修正
- 间谍探测器：`attack 0 → 5`、`shield 0 → 10`（原 repo 数据与 OGame 原版不符，探测器应有微弱攻防）

### ⏩ 快转功能（解决后期节奏太慢）
- **游戏速度上限 10x → 100x**（设置页可调）
- **一键时间快转**：总览页新增 +1 小时 / +8 小时 / +24 小时按钮，一次性静默结算资源、建造/研究队列与舰队动态，并汇总通知（避免通知轰炸）

## 核心特性

- **建筑管理** - 在行星和月球上建造和升级各种建筑
- **科技研究** - 解锁先进科技来增强你的帝国
- **舰队管理** - 建造舰船、派遣任务、参与战术太空战斗
- **防御系统** - 部署防御设施来保护你的殖民地
- **军官系统** - 招募军官以获得战略优势
- **战斗模拟器** - 在投入资源前测试战斗场景
- **银河视图** - 探索宇宙并与其他星球互动
- **本地数据持久化** - 所有游戏数据都经过加密并存储在浏览器本地
- **深色/浅色主题** - 选择你喜欢的视觉主题
- **队列管理** - 管理多个建造和研究队列
- **月球生成** - 基于概率的月球从残骸场生成机制

## 技术栈

- **前端框架:** [Vue 3](https://vuejs.org) + Composition API (`<script setup>` 语法)
- **开发语言:** [TypeScript](https://www.typescriptlang.org) (启用严格类型检查)
- **构建工具:** [Vite](https://vitejs.dev) (自定义 Rolldown-Vite 7.2.5)、[Golang](https://golang.org)(构建跨平台的Web服务端)、[Electron](https://www.electronjs.org)(构建跨平台可视化界面)
- **状态管理:** [Pinia](https://pinia.vuejs.org) + 持久化插件
- **路由管理:** [Vue Router 4](https://router.vuejs.org)
- **UI 组件:** [shadcn-vue](https://www.shadcn-vue.com) (New York 风格)
- **样式方案:** [Tailwind CSS v4](https://tailwindcss.com) + CSS 变量
- **图标库:** [Lucide Vue Next](https://lucide.dev)
- **动画效果:** [tw-animate-css](https://www.npmjs.com/package/tw-animate-css)
- **国际化:** 自定义 i18n 实现

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org) (推荐 18 或更高版本)
- [pnpm](https://pnpm.io) (版本 10.13.1 或更高)
- [Go](https://golang.org) (版本 1.21 或更高版本)(可选)

### 安装

```bash
# 克隆仓库
git clone https://github.com/setube/ogame-vue-ts.git

# 进入项目目录
cd ogame-vue-ts

# 安装依赖
pnpm install
```

### 开发

```bash
# 启动开发服务器 (运行在端口 25121)
pnpm dev
```

在浏览器中访问 `http://localhost:25121`

### 生产构建

```bash
# 构建应用
pnpm build

# 预览生产构建
pnpm preview
```

## 数据安全

所有游戏数据在存储到浏览器的本地存储之前都会使用 AES 加密自动加密。您的游戏进度是安全且私密的。

## 自定义

应用支持通过 `src/style.css` 中定义的 Tailwind CSS 变量进行完整的主题自定义。您可以轻松地在浅色和深色模式之间切换。

## 贡献

欢迎贡献！请随时提交 issue 或 pull request。

## 文档

- [Docker 部署指南](doc/DOCKER.md)
- [游戏参考手册](doc/ogame-reference.md) - 建筑、科技、舰船、防御、军官等完整数据

## 许可证

本作品采用 [知识共享署名-非商业性使用 4.0 国际许可协议](https://creativecommons.org/licenses/by-nc/4.0) 进行许可。

### 您可以自由地：
- **共享** — 在任何媒介以任何形式复制、发行本作品
- **演绎** — 修改、转换或以本作品为基础进行创作

### 惟须遵守下列条件：
- **署名** — 您必须给出适当的署名，提供指向本许可协议的链接，同时标明是否对原始作品作了修改
- **非商业性使用** — 您不得将本作品用于商业目的

## 致谢

本项目受原版 [OGame](https://ogame.org) 浏览器游戏启发。所有游戏机制和设计元素都是为了教育和娱乐目的而重新实现的。

## 免责声明

本项目与 Gameforge AG 或官方 OGame 游戏没有任何关联、认可或联系。这是一个独立的粉丝项目，创建目的仅用于教育和个人娱乐。

---

<div align="center">
  用 ❤️ 制作，作者：<a href="https://github.com/setube">setube</a>
  <br>
  © 2025 - 保留所有权利（除 CC BY-NC 4.0 许可证授予的权利外）
</div>
