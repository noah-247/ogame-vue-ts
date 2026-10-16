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

## 这个 Fork 改了什么

> 上游：https://github.com/setube/ogame-vue-ts ｜ 在线试玩：https://ogame-combat-demo.pagi.workers.dev

自己玩了一阵子，有三个地方实在忍不了，就顺手修了：

### ⚔️ 战斗公式：按 OGame 原版重写
原版的战斗是简化过的——没有连击、护盾不会回、船也不会爆炸，打起来总觉得"不太对味"。现在按 OGame 的真实规则重写了一遍（`src/workers/battleEngine.ts`）：
- 护盾每轮回满；攻击不够破盾就只蹭掉点皮，攻击力不到护盾 1% 直接跳弹
- 船体按造价的 10% 算，被打残（低于 70%）了还有可能当场爆炸
- 连击终于能用了：打爆一艘后有概率立刻再开一炮，爽感拉满
- 附了 18 个确定性测试，拿 OGame 经典战例对过，结果都对得上

### 🔧 顺手修了个数据 bug
间谍探测器的攻击和护盾原来都是 0，跟 OGame 原版对不上，改回 5 / 10。

### ⏩ 后期终于不用挂机了：快转
- 游戏速度上限从 10x 放开到 100x
- 总览页加了 +1 小时 / +8 小时 / +24 小时一键快转，资源、建造、舰队一次结算完，不会弹一堆通知烦你

### ☁️ 部署：纯 Cloudflare Workers 前端
这游戏是纯前端，根本不需要服务器——原版 README 里的 Go 服务器 / Docker / Electron / APK 全家桶其实都可以省掉。这个 fork 的试玩站就是这么部署的：
1. `pnpm build`（产物在 `docs/`）
2. 写一个 `wrangler.toml`，`[assets] directory = "./docs"`
3. `wrangler deploy` ——完事，零服务器、零运维，Cloudflare 免费额度都用不完

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
