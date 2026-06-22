![Code-by-wire — 本地 Claude Code 的驾驶舱](docs/assets/cbw-hero.png)

# <img src="docs/assets/logo.svg" alt="" height="64" align="center"> Code-by-wire

[English](README.md) | 简体中文

[![CI](https://img.shields.io/github/actions/workflow/status/luojiahai/code-by-wire/ci.yml?style=flat-square&label=CI)](https://github.com/luojiahai/code-by-wire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/luojiahai/code-by-wire?style=flat-square)](https://github.com/luojiahai/code-by-wire/releases)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?style=flat-square&logo=github&logoColor=white)](https://github.com/sponsors/luojiahai)

**本地 Claude Code 的驾驶舱。**

Claude Code 一边工作，一边把丰富的轨迹写进 `.claude` 目录：每一个回合、每一个 token、每一次工具
调用、实时花费、上下文窗口。可 CLI 几乎什么都不给你看。

Code-by-wire 读取这份轨迹，把它变成一块实时仪表盘。你机器上的每个会话都集中到一处：实时状态、
完整记录、一个可驱动或随时接管的内嵌终端，以及终端从不展示给你的遥测。一块面板，取代十几个终端
窗口。

![Code-by-wire](docs/assets/cbw-demo.gif)

**[下载 macOS 版（Apple Silicon）](https://github.com/luojiahai/code-by-wire/releases/latest)**\
**[下载 Windows 版（x64）](https://github.com/luojiahai/code-by-wire/releases/latest)**

## 你能得到什么

- **所有会话，一条侧栏。** 活跃会话汇成一条实时列表，每张卡片各自标出状态；结束的则折叠进下方的区块。
- **驱动、fork，或只是旁观。** 在内嵌终端里启动一个 managed 会话，fork 或接管任意其他会话，或只读旁观一个。
- **完整的会话记录。** 每条消息、每次工具调用与结果，从磁盘重建并清晰渲染。
- **CLI 藏起来的遥测。** 实时成本、上下文窗口、token 吞吐、git、任务、子 agent 与后台 shell，逐会话呈现。
- **纵观全貌。** 一个跨会话的 Overview，配一整年的贡献日历，以及精确、绝不估算的总量。
- **看清你的账户。** 直接从 `.claude` 目录读出你的套餐和限流量表。

## 功能

无需任何配置。打开应用，你机器上正在跑的每个会话就都在这里。

### 👀 一眼看尽所有会话

**活跃在上，结束折叠。** 还在跑的会话汇成一条实时列表，最新创建的在前，每张卡片都带一个小小的
状态图标，区分 working、waiting 还是 idle。一个筛选框随输入实时收窄列表。结束的会话折叠进下方
各自的区块，那是归档，不是当下的活儿。

### 🕹️ 启动、驱动或旁观任意会话

**一键开一个。** 新会话先选一个目录和一个模型，再在内嵌终端里启动 Claude Code。fork 任意会话，
从它停下的地方分出一份新的副本；或者直接在会话头部结束一个正在跑的会话。

**安全旁观，结束后接管。** 你在别处启动的会话以只读形式出现，因为两个进程写同一份会话记录会
把它写坏。它结束后，接管它即可在应用内恢复并拿到操控权。接管按钮只在原进程退出后才出现，而
那正是唯一安全的时机。

**终端或会话记录。** 一个 managed 会话可以在实时终端和渲染后的会话记录之间切换。切走只是把
视图分离，终端仍在持续缓冲，所以你永远不会丢失滚动历史。

**随手命名，随手打开。** 给任意会话就地改名，取个你一眼能认出的名字。把它的工作目录直接在你的
编辑器或文件浏览器里打开。

### 📜 看清 agent 究竟做了什么

**完整的会话记录，一步一步。** 每条消息、每次工具调用与工具结果，都从磁盘上的原始记录重建并
清晰渲染。

**一个跟着活儿走的停靠栏。** 在实时视图下方，一个停靠栏用标签页切换会话的结构，并随时跳到正在
发生的事：

- **任务。** 任务列表，附每一项的状态以及它被什么阻塞。
- **子 agent。** 会话派生出的子会话，画成一条可下钻的实时时间线。
- **Shell。** 会话起的后台 shell，从会话记录重建，需要时可看完整输出。
- **回合。** 一条逐回合的条带：你发出的每条提示、它触发了多少次工具、跑了多久，以及多久之前。

### 📊 Claude Code 藏起来的遥测

右侧一栏实时面板：

- **上下文。** 窗口填了多满，画成一个朝上限收拢的环，有 Claude 自己报的数字时就用它。会话
  侧栏还会标出任何上下文逼近上限的会话。
- **成本。** 会话的花费，配一个甜甜圈图显示按 token 类别的去向，以及提示缓存省下了多少。订阅
  账户下，这是 _等价 API 价值_：这些 token 按 API 价格会花多少钱。一个参考数字，绝不是欠款。
- **Token。** 输入、输出与缓存的总量，画成一根堆叠条。
- **Token 速度。** 实时吞吐，按滚动窗口算出的输出与输入速率。
- **Git。** 分支、增删行数、领先/落后、当前 SHA，以及工作区状态。目录不是仓库时隐藏。
- **会话。** 模型、思考力度，以及运行时钟。

### 📈 纵观每一个会话的全貌

**应用打开就是 Overview。** 它从固定在侧栏顶部的账户卡片进入，是一个应用级视图，汇总你机器上的
每个 Claude Code 会话，而不只是你正在看的那一个。选一个区间：Today、7d、30d、90d 或 All。

**头条数字。** 区间内的会话数、回合数、token 数与等价 API 价值，并配一根堆叠条显示 token 的
去向。

**贡献日历。** 把一整年的活跃度画成热力图，可按回合、token 或等价 API 价值着色。点任意一天即可
把整页收窄到那一天。

**每日用量。** 每天一根堆叠条，可按 token 类别或按模型拆分。

**三种切法。** 按模型、按项目（每个项目的分支折叠在各自项目行下），以及在一张可排序的表里按
会话。一个 _Include cache_ 开关决定缓存 token 是否计入总量。

**精确，绝不估算。** 每个数字都直接从磁盘上的会话记录读出，去重后汇总。不抽样，不猜测。首次
启动会在进度条后回填你的历史，之后便像其余部分一样保持实时。

### 💳 看清你的账户

侧栏顶部的卡片直接从 `.claude` 目录读出你的账户。订阅账户（Pro 或 Max）下，它显示你的套餐和
限流量表，附实时的重置倒计时，让你看清自己离上限还有多远。API 账户下，它显示接口主机和套餐。
账户邮箱默认打码，点一下即可显示，方便你共享屏幕时不泄露它。同一张卡片也是进入 Overview 的入口。

### ⚙️ 设置与 CLI 健康

标题栏里有个齿轮，点开就是设置。**System** 检查你本地的 Claude Code：是否找得到、是否够新、是否
已登录，有问题时给你递上确切的修法，还带一个字段把应用指向非标准路径的二进制。**Account** 展开
你的套餐和限额；**Appearance** 和 **About** 收尾。齿轮上挂着一枚警示徽标，CLI 一需要留意就亮起
琥珀或红色，让坏掉或退登的安装绝不会被忽略。

## 安装

下载预编译好的应用，或者自己构建。

### 下载

1. [下载最新的 `.dmg`](https://github.com/luojiahai/code-by-wire/releases/latest)。
2. 打开后把 Code-by-wire 拖进「应用程序」。
3. 启动它。应用已由 Apple 签名并公证，可以直接打开，没有 Gatekeeper 警告，也不需要绕过
   隔离标记。

Windows 上下载 `.exe` 直接运行。目前未签名，SmartScreen 可能会警告——点 **更多信息 → 仍要运行**。也可用 `pnpm dist:win` 从源码构建（见 CONTRIBUTING）。

### 从源码构建

也可以在本地构建一个未签名的应用。按你的平台运行对应命令：

```
pnpm install
pnpm rebuild:native   # 为 Electron 的 ABI 重新编译 better-sqlite3 + node-pty
pnpm dist             # macOS：把 .dmg 输出到 release/
pnpm dist:win         # Windows：把 .exe 输出到 release/
```

macOS 上从 `release/` 打开 `.dmg`，把 Code-by-wire 拖进「应用程序」。由于它未签名，首次启动可能需要
右键 → **打开**，或清除隔离标记：

```
xattr -dr com.apple.quarantine /Applications/Code-by-wire.app
```

Windows 上从 `release/` 运行 `.exe`。它未签名，SmartScreen 可能会警告——点 **更多信息 → 仍要运行**。

## 环境要求

- macOS（Apple Silicon）或 Windows（x64）
- 本地安装了 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)，这样才有会话
  可供观察和控制

## 开发

```
pnpm install
pnpm rebuild:native   # 为 Electron 的 ABI 重新编译 better-sqlite3 + node-pty
pnpm dev              # 启动应用
```

`pnpm test` 会针对 `tests/fixtures/` 中脱敏后的 `.claude` fixture 运行 provider 读取测试。
`pnpm typecheck` 检查主进程和渲染进程两个项目。

这是个人项目，不接受外部代码贡献，但欢迎反馈问题和想法。[提交 issue](https://github.com/luojiahai/code-by-wire/issues/new/choose)，或查看 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
