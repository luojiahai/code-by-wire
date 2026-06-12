# Code-by-wire (CBW)

[English](README.md) | 简体中文

[![CI](https://img.shields.io/github/actions/workflow/status/luojiahai/code-by-wire/ci.yml?style=flat-square&label=CI)](https://github.com/luojiahai/code-by-wire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/luojiahai/code-by-wire?style=flat-square)](https://github.com/luojiahai/code-by-wire/releases)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?style=flat-square&logo=github&logoColor=white)](https://github.com/sponsors/luojiahai)

**本地 agentic 编码工具（如 Claude Code）的驾驶舱。**

Code-by-wire 是一款桌面应用，把每一个 agentic 编码会话都集中到一处：实时状态、完整记录、
终端，以及 CLI 默默藏起来的成本与上下文遥测。一块面板，取代十几个终端窗口。

[![下载 macOS 版（Apple Silicon）](https://img.shields.io/badge/%E4%B8%8B%E8%BD%BD%20macOS%20%E7%89%88%EF%BC%88Apple%20Silicon%EF%BC%89-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/luojiahai/code-by-wire/releases/latest)

## 名字的由来

电传飞控（fly-by-wire）并没有把飞机从飞行员手里夺走。它在操纵杆和舵面之间放进一台计算机：
飞行员下达意图，机器负责执行。飞行员依然在驾驶，只是更强、更精准。

Code-by-wire 把这个理念搬到软件上。你下达意图，agent 负责执行，而你始终是机长（pilot in
command）：实时状态、完整记录，以及随时接管的操控权。

## 预览

![code-by-wire](docs/assets/preview.png)

## 功能

- **所有会话，一个视图。** 每个会话一行，附带它的实时状态。
- **让需要你的会话浮上来。** Working、Waiting、Idle、Ended 四种状态，Waiting 最显眼。
- **完整的会话记录。** 消息、工具调用与结果，全部从 `~/.claude` 重建。
- **Token、成本与上下文。** Claude Code 藏起来的用量，外加订阅账户的等价 API 价值。
- **任务、子 agent 与 git。** 会话的任务列表、它的子 agent 树，以及它的仓库状态。
- **先观察，再接管。** 任何不是你启动的会话都能查看；接管一个已结束的会话即可继续驱动它。

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
