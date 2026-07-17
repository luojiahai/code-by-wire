# Contributing to flightdeck

This is a personal project, built by the owner and Claude Code. I'm not taking
outside code contributions, and pull requests from non-maintainers will be
closed.

Bug reports and ideas are genuinely welcome, though.

## How to help

The most useful thing you can send is a clear, specific issue:

- **Found a bug?** [Open a bug report.](https://github.com/wilsonwang0713/code-by-wilson/issues/new?template=bug_report.yml)
- **Want a feature?** [Open a feature request.](https://github.com/wilsonwang0713/code-by-wilson/issues/new?template=feature_request.yml)

## Running it locally

You're welcome to clone and run the app to poke around.

### Prerequisites

- macOS (Apple Silicon) or Windows (x64) for development
- Node 24 (see `.nvmrc`; `nvm use` picks it up)
- pnpm 11 (`corepack enable` or install pnpm directly)
- Claude Code installed locally, so there are sessions to observe

### Setup

```
pnpm install
pnpm rebuild:native   # rebuild better-sqlite3 + node-pty for Electron's ABI
pnpm dev              # launch the app
```

Re-run `pnpm rebuild:native` after any Electron upgrade.

### Windows

`pnpm rebuild:native` compiles `better-sqlite3` and `node-pty` from source, so a
C++ toolchain is required:

1. **VS 2022 Build Tools** with the **Desktop development with C++** workload:
   ```
   winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
   ```
2. **Spectre-mitigated VC runtime libraries** — `node-pty` fails with `MSB8040`
   without them. Add the component via an **elevated** installer modify (a quiet
   modify from a non-admin shell exits 5007; `--wait`/`--log` are not valid for
   the `modify` verb):
   ```powershell
   Start-Process "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\setup.exe" -Verb RunAs -ArgumentList 'modify --installPath "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools" --add Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre --quiet --norestart'
   ```

If `pnpm rebuild:native` fails with `'GetCommitHash.bat' is not recognized`, your
environment has `NoDefaultCurrentDirectoryInExePath` set, which stops `cmd` from
finding the batch file in its own directory. Clear it for the session:

```powershell
Remove-Item Env:\NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue
pnpm rebuild:native
```

Build an unsigned installer locally with `pnpm dist:win` (writes the `.exe` to
`release/`).

## How the project is organized

This repo is built by Claude Code agents working GitHub issues. Releases are cut
with the `release` skill (`.claude/skills/release/SKILL.md`).
