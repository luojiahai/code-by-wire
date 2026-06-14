# Code-by-wire (CBW)

[English](README.md) | 简体中文

[![CI](https://img.shields.io/github/actions/workflow/status/luojiahai/code-by-wire/ci.yml?style=flat-square&label=CI)](https://github.com/luojiahai/code-by-wire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/luojiahai/code-by-wire?style=flat-square)](https://github.com/luojiahai/code-by-wire/releases)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?style=flat-square&logo=github&logoColor=white)](https://github.com/sponsors/luojiahai)

**Claude Code 的驾驶舱。**

Claude Code 跑在你的终端里，一边工作一边把丰富的轨迹写进 `~/.claude`：每一个回合、每一个
token、每一次工具调用、实时花费、上下文窗口。可 CLI 几乎什么都不给你看。状态栏（statusline）
不过是某个终端底部的一行字，一旦你同时跑起第二个会话，它就已经不够用了。

Code-by-wire 读取这份轨迹，把它变成一块实时仪表盘。你机器上的每个 Claude Code 会话都集中到
一处：实时状态、完整记录、一个可驱动或随时接管的内嵌终端，以及终端从不展示给你的成本、上下文
与用量遥测。一块面板，取代十几个终端窗口。

[![下载 macOS 版（Apple Silicon）](https://img.shields.io/badge/%E4%B8%8B%E8%BD%BD%20macOS%20%E7%89%88%EF%BC%88Apple%20Silicon%EF%BC%89-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/luojiahai/code-by-wire/releases/latest)

## 名字的由来

电传飞控（fly-by-wire）并没有把飞机从飞行员手里夺走。它在操纵杆和舵面之间放进一台计算机：
飞行员下达意图，机器负责执行。飞行员依然在驾驶，只是更强、更精准。

Code-by-wire 把这个理念搬到软件上。你下达意图，agent 负责执行，而你始终是机长（pilot in
command）：实时状态、完整记录，以及随时接管的操控权。

## 预览

![code-by-wire](docs/assets/preview.png)

## 功能

Code-by-wire 读取 Claude Code 写入 `~/.claude` 的一切，把它们变成一块实时仪表盘。无需任何
配置：打开应用，你机器上正在跑的每个会话就都在这里。

### 👀 一眼看尽所有会话

**一条侧栏，所有会话。** 左侧栏列出你机器上的每个 Claude Code 会话，一个一行。一个筛选框
随输入实时收窄列表。

**按谁需要你来分组。** 会话按状态分组，优先级从高到低：**Waiting → Working → Idle →
Ended**，每组都有一个粘性表头和实时计数。Ended 默认折叠。它是归档，不是当下的活儿。

### 🕹️ 驱动或旁观任意会话

**启动一个 managed 会话。** 选好目录和模型，Code-by-wire 就会在那里启动 `claude`，并从内嵌
在工作区里的实时终端驱动它。

**旁观其余会话。** 你在别处启动的会话以只读形式出现：完整的状态与会话记录，但无法输入，
因为两个进程写同一份会话记录会把它写坏。

**结束后再接管。** 一个 observed 会话结束后，接管它即可在应用内恢复它并拿到操控权。按钮只在
原进程退出后才出现，而那正是唯一安全的时机。

**终端或会话记录。** 一个 managed 会话可以在实时终端和渲染后的会话记录之间切换。切走只是把
视图分离，终端仍在持续缓冲，所以你永远不会丢失滚动历史。

### 📜 看清 agent 究竟做了什么

**完整的会话记录。** 每条消息、每次工具调用与工具结果，都从磁盘上的原始记录重建并清晰渲染，
一步一步呈现。

**回合时间线。** 在实时视图下方，一条逐回合的条带：你发出的每条提示、它触发了多少次工具、
这一回合跑了多久，以及它是多久之前开始的。

### 📊 Claude Code 藏起来的遥测

右侧一栏实时面板：

- **上下文。** 窗口填了多满，画成一个朝上限收拢的环，有 Claude 自己报的数字时就用它。会话
  侧栏还会标出任何上下文逼近上限的会话。
- **成本。** 会话的花费，配一个甜甜圈图显示按 token 类别的去向，以及提示缓存省下了多少。订阅
  账户下，这是 _等价 API 价值_：这些 token 按 API 价格会花多少钱。一个参考数字，绝不是欠款。
- **Token。** 输入、输出与缓存的总量，画成一根堆叠条。
- **Token 速度。** 实时吞吐，按滚动窗口算出的输出与输入速率。
- **Git。** 分支、增删行数、领先/落后、当前 SHA，以及工作区状态。目录不是仓库时隐藏。
- **任务。** 会话的任务列表，附每一项的状态以及它被什么阻塞。
- **子 agent。** 会话派生出的子会话树，按深度嵌套。
- **会话。** 模型、思考力度，以及运行时钟。

### 📈 纵观每一个会话的全貌

**应用打开就是 Overview。** 它被固定在侧栏顶部，是一个应用级视图，汇总你机器上的每个 Claude
Code 会话，而不只是你正在看的那一个。选一个区间：Today、7d、30d、90d 或 All。

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

侧栏顶部直接从 `~/.claude` 读出你的账户。订阅账户（Pro 或 Max）下，它显示你的套餐和限流量
表，附实时的重置倒计时，让你看清自己离上限还有多远。API 账户下，它显示接口主机和套餐。应用
会根据你的会话是否上报限流来判断属于哪种，并为每种以正确的方式展示成本。

## 安装

下载预编译好的应用，或者自己构建。

### 下载

1. [下载最新的 `.dmg`](https://github.com/luojiahai/code-by-wire/releases/latest)。
2. 打开后把 code-by-wire 拖进「应用程序」。
3. 启动它。应用已由 Apple 签名并公证，可以直接打开，没有 Gatekeeper 警告，也不需要绕过
   隔离标记。

### 从源码构建

也可以在本地构建一个未签名的 `.dmg`：

```
pnpm install
pnpm rebuild:native   # 为 Electron 的 ABI 重新编译 better-sqlite3 + node-pty
pnpm dist             # 把 .dmg 输出到 release/
```

从 `release/` 打开 `.dmg`，把 code-by-wire 拖进「应用程序」。由于它未签名，首次启动可能需要
右键 → **打开**，或清除隔离标记：

```
xattr -dr com.apple.quarantine /Applications/code-by-wire.app
```

## 环境要求

- macOS（Apple Silicon）
- 本地安装了 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)，这样才有会话
  可供观察和控制

## 开发

```
pnpm install
pnpm rebuild:native   # 为 Electron 的 ABI 重新编译 better-sqlite3 + node-pty
pnpm dev              # 启动应用
```

`pnpm test` 会针对 `tests/fixtures/` 中脱敏后的 `~/.claude` fixture 运行 provider 读取测试。
`pnpm typecheck` 检查主进程和渲染进程两个项目。

想参与开发请看 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 项目结构

```
src/
  main/       Electron 主进程：provider、db、git、终端、同步
  preload/    IPC 桥接层
  renderer/   React UI（会话列表、工作区面板、终端）
  shared/     跨进程共享的类型与工具
```

## 许可证

[MIT](LICENSE)
