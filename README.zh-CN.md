# <img src="docs/assets/logo.svg" alt="" height="64" align="center"> Code-by-wire

[English](README.md) | 简体中文

[![CI](https://img.shields.io/github/actions/workflow/status/luojiahai/code-by-wire/ci.yml?style=flat-square&label=CI)](https://github.com/luojiahai/code-by-wire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/luojiahai/code-by-wire?style=flat-square)](https://github.com/luojiahai/code-by-wire/releases)

[![Buy Me A Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=luojiahai&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://buymeacoffee.com/luojiahai)

**驾驭每一个 Claude Code 会话，追踪其完整的会话记录，监控遥测数据，尽在一个界面。**

![Code-by-wire：一个实时 Claude Code 会话，含会话侧栏、会话记录与遥测面板](docs/assets/cbw-screenshot.png)

## 功能

本地需要已安装 Claude Code。打开应用，你机器上正在跑的每个会话就已经在这里。

- **所有会话，一条侧栏。** 管理你机器上正在跑的每一个会话，全都在这一条侧栏里：按项目分组，
  可搜索，标出实时状态。
- **驱动、fork，或只是旁观。** 在内嵌终端里启动一个会话，fork 一个正在跑的，接管一个你在别处
  启动的，或只读旁观它。
- **完整的会话记录。** 每条消息、每次工具调用与结果，从磁盘重建并清晰渲染。
- **CLI 隐藏的遥测。** 上下文压力、花费、token 吞吐、占空比、git、任务、子 agent 与后台
  shell，实时呈现，逐会话展示。
- **纵观全貌。** 一个跨会话的 Stats 视图，配一整年的贡献日历，以及精确、绝不估算的总量。
- **限额尽收眼底。** 直接从磁盘读出你账户的限流窗口，附实时重置倒计时。

## 下载

| 平台                  | 文件                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| macOS · Apple Silicon | [`Code-by-wire-arm64.dmg`](https://github.com/luojiahai/code-by-wire/releases/latest/download/Code-by-wire-arm64.dmg)             |
| macOS · Intel         | [`Code-by-wire-x64.dmg`](https://github.com/luojiahai/code-by-wire/releases/latest/download/Code-by-wire-x64.dmg)                 |
| Windows · x64         | [`Code-by-wire-Setup-x64.exe`](https://github.com/luojiahai/code-by-wire/releases/latest/download/Code-by-wire-Setup-x64.exe)     |
| Windows · ARM64       | [`Code-by-wire-Setup-arm64.exe`](https://github.com/luojiahai/code-by-wire/releases/latest/download/Code-by-wire-Setup-arm64.exe) |

点一下即开始下载，始终是最新版本。你需要在本地安装
[Claude Code](https://docs.anthropic.com/en/docs/claude-code)，这样才有会话可供观察和控制。

macOS 上打开 `.dmg`，把 Code-by-wire 拖进「应用程序」。应用已由 Apple 签名并公证，可以直接
打开。Windows 上运行 `.exe`；目前未签名，如果 SmartScreen 警告，点 **更多信息 → 仍要运行**。

安装后，应用会在启动时检查新版本，并可在 设置 → About 中更新。

## 从源码构建

```
pnpm install
pnpm rebuild:native   # 为 Electron 的 ABI 重新编译 better-sqlite3 + node-pty
pnpm dist             # macOS：把 .dmg 输出到 release/
pnpm dist:win         # Windows：把 .exe 输出到 release/
```

本地构建的应用未签名：macOS 上首次启动可能需要右键 → **打开**，或用
`xattr -dr com.apple.quarantine /Applications/Code-by-wire.app` 清除隔离标记；
Windows 上 SmartScreen 可能会警告：点 **更多信息 → 仍要运行**。

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
