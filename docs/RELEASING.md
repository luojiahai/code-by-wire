# Releasing

The app ships a signed macOS `.dmg` (Apple Silicon, `arm64`) and an unsigned
Windows NSIS `.exe` (x64), attached to a GitHub release built in CI. You never
build a release on your own machine.

The whole flow is driven by pushing a `vX.Y.Z` tag. CI builds both artifacts and
uploads them to a **draft** GitHub release. You review the draft, then publish it.

## Cut a release

1. **Pick the version.** Semantic Versioning. `package.json` `version` is the
   source of truth; the tag is `v` + that exact string.

2. **Bump and changelog, on `main`.**
   - Set `version` in `package.json`.
   - In `CHANGELOG.md`, move the `[Unreleased]` entries into a new
     `## [X.Y.Z] - YYYY-MM-DD` section and fix the compare links at the bottom.
   - Commit (`build(release): vX.Y.Z`), open a PR, merge it.

3. **Tag the release commit and push the tag** (and only the tag):

   ```
   git switch main && git pull
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   The push triggers `.github/workflows/release.yml`.

4. **Wait for CI.** The run does:
   - `verify`: fails fast if the tag doesn't equal `v` + `package.json` version.
     Cheap guard before any runner spins up.
   - `draft` on `ubuntu-latest`: creates the GitHub draft release exactly once
     (or reuses it on a re-run).
   - `build` matrix: two parallel legs after `draft` succeeds.
     - `macos-14`: install → `rebuild:native` → `build` →
       `electron-builder --mac --arm64 --publish never` (signs and notarizes),
       then uploads the `.dmg`, its blockmap, and `latest-mac.yml`.
     - `windows-latest`: same install/rebuild/build steps →
       `electron-builder --win --x64 --publish never` (unsigned), then uploads
       the `.exe`, its blockmap, and `latest.yml`.

5. **Publish the draft.** Releases → find the draft → confirm the notes match the
   changelog → **Publish release**.

## Why CI uploads the assets by hand

Don't "simplify" the release job back to `electron-builder --publish always`. Its
GitHub publisher uploads files in parallel, and a draft release can't be looked
up by tag, so each upload races to create its own draft. v0.1.0's first run
produced **two** draft releases with the dmg, blockmap, and `latest-mac.yml`
scattered across them, and the job still went green looking like a clean release.

So the job builds with `--publish never` and uploads through `gh` instead: it
creates the draft once (or reuses it on a re-run) and uploads with `--clobber`,
which is deterministic and idempotent.

## Platforms

macOS releases are Apple Silicon (`arm64`) only. The Intel (`x64`) macOS leg was
dropped: GitHub's `macos-13` runners queue for 10-30+ min and are on the way out,
and the user base is Apple Silicon.

Windows releases are `x64` only and unsigned. SmartScreen will warn on first
launch; users click **More info → Run anyway**. Code-signing for Windows is not
set up yet.

## Verify a published release

```
GH_HOST=github.com gh release view vX.Y.Z -R luojiahai/code-by-wire
```

Expect `Code-by-wire-X.Y.Z-arm64.dmg` (+ `.blockmap`) and `latest-mac.yml` from
the macOS leg, and `Code-by-wire Setup X.Y.Z.exe` (+ `.blockmap`) and
`latest.yml` from the Windows leg. An empty or partial asset list means an upload
step didn't run or failed — read the relevant `build` job log.

## Build a dmg locally (testing only, no publish)

For a throwaway dmg to smoke-test packaging, never for a release:

```
pnpm rebuild:native   # rebuild better-sqlite3 + node-pty for Electron's ABI first
pnpm dist             # electron-vite build && electron-builder --mac --publish never
```

The dmg lands in `release/`. It's your current arch only and unsigned. `pnpm
dist` does **not** run `rebuild:native` for you; skip it and the app crashes on
launch with a native-module ABI mismatch.

## Recovering a botched release

If a release ends up wrong (empty, or assets split across duplicate drafts from
an old `--publish always` run):

1. The dmg may already be on GitHub, just attached to the wrong/duplicate draft.
   Download each asset by id:
   `GH_HOST=github.com gh api repos/luojiahai/code-by-wire/releases/assets/<id> -H "Accept: application/octet-stream" > <name>`.
2. Delete the bad release(s), keeping the git tag:
   `GH_HOST=github.com gh api -X DELETE repos/luojiahai/code-by-wire/releases/<release_id>`.
3. Assemble one clean release from the downloaded files:
   `GH_HOST=github.com gh release create vX.Y.Z -R luojiahai/code-by-wire --latest --title "code-by-wire vX.Y.Z" --notes "..." <files>`.

   Or, to rebuild from scratch, re-push the tag
   (`git push origin :refs/tags/vX.Y.Z && git push origin vX.Y.Z`) and let CI
   produce a fresh draft.

## Code signing

macOS releases are signed with a Developer ID certificate and notarized by Apple
(`CSC_*` and `APPLE_*` secrets in CI), so the downloaded `.dmg` opens without a
Gatekeeper warning.

Windows releases are unsigned. On first launch SmartScreen shows an "unknown
publisher" warning; users click **More info → Run anyway**. Windows code-signing
is not set up yet.
