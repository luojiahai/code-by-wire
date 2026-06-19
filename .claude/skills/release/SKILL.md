---
name: release
description: >-
  Use when the maintainer wants to cut, prepare, or ship a code-by-wire release
  — e.g. says "bump version", "bump vX.Y.Z", "release it", "ship it", or "cut a
  release" — whether before the release (preparing the version bump and the
  changelog PR) or after the bump PR has merged (tagging and publishing).
---

# Release

The maintainer drives releases in two phases. Pick the phase from what they
asked and the repo state; never run both at once.

- **Phase 1 — "bump version"**: the bump/changelog/PR are not on `main` yet.
- **Phase 2 — "release it"**: the bump PR has merged to `main`; now tag and ship.

`package.json` `version` is the source of truth; the tag is `v` + that exact
string. Full mechanics and recovery steps are in `docs/RELEASING.md` — read it
when you need CI internals or to recover a botched release.

## Orient first

Two things to settle before touching anything, especially on a bare `/release`
with no phase named.

**Which phase?** Compare the working version to the latest tag:

```
node -p "require('./package.json').version"   # e.g. 0.1.5
git tag --sort=-v:refname | head -1           # e.g. v0.1.4
```

Version **equals** the latest tag → the last release shipped and nothing is
pending → **Phase 1** (cut the next version). Version is **ahead** of the latest
tag → a bump already merged but isn't tagged → **Phase 2** (tag and ship). When
unsure, `git log --oneline --first-parent vLAST..HEAD` shows what's unreleased.

**`gh` defaults to the wrong host.** This repo lives on personal GitHub, but `gh`
defaults to the work host, so every `gh` call needs both the host and the repo:

```
GH_HOST=github.com gh <cmd> -R luojiahai/code-by-wire ...
```

Plain `git push`/`git tag` are fine — only `gh` needs the prefix.

## Phase 1 — "bump version" (before release)

Do all the prep on a branch and open the PR. **Do not tag.**

1. **Pick the version.** Semantic Versioning, but read the project's habit before
   calling a bump "ambiguous": skim `CHANGELOG.md` and see how comparable changes
   were bumped. While in `0.x` this project has stayed on **patch** even for
   sizeable features (the Overall Stats view, subagent lanes, the CLI-status
   block), so a normal feature-plus-fixes range is almost always the next patch.
   Only confirm with the maintainer when the range breaks that pattern — a
   breaking change, or a deliberate minor.
2. **Branch off `main`.** `git switch main && git pull`, then a fresh branch
   named `build/release-vX.Y.Z`.
3. **Set `version` in `package.json`** to `X.Y.Z`.
4. **Update `CHANGELOG.md`.** It follows Keep a Changelog + SemVer.
   - Open a dated `## [X.Y.Z] - YYYY-MM-DD` section, with today's real date.
   - Fill it from the `vLAST..HEAD` range, grouped as
     Added / Changed / Removed / Fixed. Read the range two ways:
     `--first-parent` for the merged PRs, the full log for the commits inside
     them. Fold within-feature fixups into the feature's bullet — a follow-up PR
     that fixes a feature merged in the same range is part of that feature, not a
     separate Fixed entry. List only genuinely separate, user-facing fixes under
     Fixed. Audit the range against the entry — don't trust a first pass.
   - Repoint `[Unreleased]` and add the `[X.Y.Z]` compare link in the footer so
     the links chain (`vPREV...vX.Y.Z`).
   - If a prior shipped version has no notes, backfill it from its own tag range.
5. **Commit.** Bump + changelog in one `build(release): vX.Y.Z` commit. Keep
   unrelated changelog backfills as separate `docs(changelog):` commits.
   Conventional Commits; no `Co-Authored-By` trailer.
6. **Verify.** `pnpm format` then `pnpm lint` (CI runs `format:check` then
   `lint` and fails on either). `lint` ending in `0 errors` with warnings is
   fine — the `src/main/provider/claude/` warnings are intentional, leave them.
7. **Push and open the PR.** No tag, no PR-body footer. A tight body summarizing
   the CHANGELOG section reads well.
8. **Hand off, then merge when asked.** Tell the maintainer the PR is ready.
   They'll either merge it themselves or say "merge". To merge it yourself,
   confirm CI is green first, then use a **merge commit** to match the history
   (`main` is all "Merge pull request #NNN from …", never squashes), and tidy up:

   ```
   GH_HOST=github.com gh pr view <N> -R luojiahai/code-by-wire --json mergeStateStatus,statusCheckRollup
   GH_HOST=github.com gh pr merge <N> -R luojiahai/code-by-wire --merge
   git switch main && git pull
   git branch -d build/release-vX.Y.Z
   ```

   After it merges, the maintainer says "release it" → Phase 2.

## Phase 2 — "release it" (after the PR merges)

The tag is the trigger; CI builds the dmg into a draft release.

1. **Confirm state.** `git switch main && git pull`; check the bump commit is on
   `main`, `node -p "require('./package.json').version"` equals the version to
   tag, and the tag doesn't already exist (`git tag -l vX.Y.Z`).
2. **Tag the release — environment-aware.** Who pushes the tag depends on where
   Claude Code is running:
   - **Local Claude Code** (on the maintainer's machine): push the tag yourself.

     ```
     git tag vX.Y.Z
     git push origin vX.Y.Z
     ```

   - **Claude Code on the web / remote sandbox**: the git proxy is scoped to the
     session's feature branch and **403s any other ref** (tags included), and the
     GitHub tools here can't create a tag/ref. So prepare and verify everything,
     then hand the maintainer the same two commands to run from a local clone.
   - **Unsure which?** Just attempt the push — a clean push (exit 0) means you're
     local and done; an **HTTP 403** on the tag ref (while branch pushes succeed)
     means you're in the sandbox, so fall back to the handoff.

   Web-UI alternative (maintainer, any environment): Releases → Draft a new
   release → choose tag `vX.Y.Z` ("create on publish"), target `main` →
   **Publish** (saving a draft does *not* create the tag, so CI won't fire). This
   publishes immediately, so the release is briefly visible without assets until
   CI's upload step finishes.
3. **Shepherd CI to a verified draft.** CI success and new tags aren't delivered
   as webhook events, so you have to poll. Find the run and watch its jobs:

   ```
   GH_HOST=github.com gh run list -R luojiahai/code-by-wire --workflow=Release --limit 3 --json databaseId,headBranch,status
   GH_HOST=github.com gh run view <id> -R luojiahai/code-by-wire --json jobs --jq '.jobs[] | {name,status,conclusion}'
   ```

   `verify` fails fast if tag ≠ `package.json`; then `draft` creates the GitHub
   draft release on `ubuntu-latest`; then the `build` matrix runs two parallel
   legs: `macos-14` (signs/notarizes, ~10-20 min) and `windows-latest` (unsigned,
   ~5-10 min). Poll in the background so you get pinged on exit — but in zsh,
   **don't name the loop variable `status`**: it's read-only and silently kills
   the loop on the first iteration. Use `st` or similar.
   - **On failure:** pull the job logs, report the cause. If it was a flake,
     re-trigger by re-pushing the tag
     (`git push origin :refs/tags/vX.Y.Z && git push origin vX.Y.Z`) — yourself if
     local, otherwise hand it to the maintainer (same sandbox 403 applies).
   - **On success:** confirm the **draft** release carries all assets:

     ```
     GH_HOST=github.com gh release view vX.Y.Z -R luojiahai/code-by-wire --json isDraft,assets --jq '{draft:.isDraft, assets:[.assets[].name]}'
     ```

     Expect `draft: true` and `Code-by-wire-X.Y.Z-arm64.dmg` + `.blockmap` +
     `latest-mac.yml` (from macOS), and `Code-by-wire Setup X.Y.Z.exe` +
     `.blockmap` + `latest.yml` (from Windows). An empty or partial asset list
     means an upload step didn't run — read the relevant `build` job log.
     (`isLatest` isn't valid on `gh release view` — use `isDraft`/`isPrerelease`
     here, or `gh release list --json isLatest` to check which release is latest.)
4. **Drop the notes in.** Set the draft body from the `X.Y.Z` CHANGELOG section
   so it's ready to read, keeping it a draft:

   ```
   GH_HOST=github.com gh release edit vX.Y.Z -R luojiahai/code-by-wire --notes "$(...)"
   ```

   Editing a draft prints an `untagged-…` URL — that's just how GitHub addresses
   an unpublished draft, not an error.
5. **Hand back to publish, or publish when delegated.** Publishing is the
   maintainer's call by default: remind them to open the draft, confirm the notes
   match the `X.Y.Z` CHANGELOG section, and **Publish release**. But if they
   explicitly say "you publish" and the draft is verified, do it:

   ```
   GH_HOST=github.com gh release edit vX.Y.Z -R luojiahai/code-by-wire --draft=false --latest
   ```

   Publishing flips `latest-mac.yml` into the public auto-update feed, so existing
   installs pick up the version on their next check — worth saying out loud when
   you confirm it's live. If the tag was created via the web UI (already
   published, no draft), just verify the assets landed on that release.
