---
name: release
description: >-
  Use when the maintainer wants to cut, prepare, or ship a code-by-wire release
  — e.g. says "bump version", "bump vX.Y.Z", "release it", "ship it", or "cut a
  release" — whether before the release (preparing the version bump and the
  changelog PR) or after the bump PR has merged (tagging and publishing).
---

# Release

The maintainer drives releases in two phases, keyed off repo state. With the
automation checkpoint below, one run can carry straight through both without
stopping in between — pick the starting phase from what they asked and the
repo state, then keep going as far as they authorize.

- **Phase 1 — "bump version"**: the bump/changelog/PR are not on `main` yet.
- **Phase 2 — "release it"**: the bump PR has merged to `main`; now tag and ship.

`package.json` `version` is the source of truth; the tag is `v` + that exact
string. CI internals, the botched-release runbook, and platform/signing notes
live at the end of this skill.

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

## How far to take it

Merging, tagging, and publishing are each hard to reverse or visible to
others, so they still deserve a deliberate go-ahead — but asking for that
go-ahead three separate times, in three separate messages ("merge", then
later "release it", then later "publish"), is pure friction when the
maintainer already knows how far they want this to go. Collapse it: right
after orienting, before touching anything, ask **once** via AskUserQuestion
how far to drive this release. Scope the options to what's actually left
from the phase you're starting in:

- **Starting at Phase 1** (list in this order, full automation first and
  marked "(Recommended)"): "Merge once CI is green, then tag, build, and
  publish" / "Merge once CI is green, but leave the draft release for me to
  publish" / "Just open the PR — I'll drive the rest."
- **Starting at Phase 2** (same ordering): "Tag, build, and publish" / "Tag
  and build, but leave the draft release for me to publish" / "Just tag and
  shepherd the build — I'll drive the rest."

Lead with the full-automation option — that's how these releases actually
get driven in practice — but let the maintainer pick a narrower one; they
know if this particular release needs a closer look before it goes out.
Whatever they pick, honor it for the rest of *this* run without asking
again. Two things still warrant stopping regardless of the answer: a version
bump that breaks the project's patch-bump habit (Phase 1 step 1), and a real
failure (CI red, a 403, a mismatched asset list) — those are new
information, not a re-ask of a question already answered.

This is a one-time answer for this run, not a standing preference — ask
again on the next release. If a run stops short (the maintainer picked a
"stop" option, or the two phases land in separate conversations because
real time passes between opening the PR and it merging), hand off exactly
like before: "merge", "release it", and "publish" all still work as re-entry
phrases for picking the thread back up later, since the automation choice
made in one conversation doesn't carry into the next.

## Task list

Create one right after the maintainer answers "How far to take it" — at that
point you already know exactly which numbered steps this run will touch, so
there's nothing left to guess about what belongs on the list.

`TaskCreate` and `TaskUpdate` are deferred tools — look up their real schemas
once with `ToolSearch("select:TaskCreate,TaskUpdate")` before the first call.
`TaskCreate` takes one task per call (`subject`, `description`, optional
`activeForm`); there's no batched `tasks` array, so don't hand it the whole
list at once — an earlier run guessed at that shape and hit
`InputValidationError`. The fix isn't to skip the list, it's to call it once
per step: since the calls don't depend on each other, fire them all in the
same turn and the harness runs them in parallel, so the full checklist still
appears in one shot instead of trickling in turn by turn.

Use each step's bolded lead-in as the task's `subject` ("Pick the version",
"Branch off main", "Confirm state", …) — the numbered steps below already
read like task titles, so there's nothing new to compose. Create one task per
step this run will actually reach, and skip whichever tail the maintainer's
"How far" answer left out: no "Publish" task if they want to publish it
themselves, no Phase 2 tasks at all if they chose to stop after opening the
PR. Treat each background CI wait (Phase 1's merge-once-green step, Phase 2's
"Shepherd CI" step) as a single task covering the whole wait — move it to
`in_progress` when you kick off the poll, and `completed` only once the
notification confirms it, not when the poll merely starts.

Move each task to `in_progress` right before you start it and `completed`
right after, via `TaskUpdate` — that's what keeps the checklist live instead
of a snapshot from the start of the run.

If a long release loses its place — a compaction event drops earlier turns,
or a fresh conversation picks up a run that stalled between phases — call
`TaskList` first so you don't spin up a second, duplicate set for the same
release. Don't trust its statuses at face value, though: re-orient from the
same real state "Orient first" and Phase 2 step 1 already check (PR merge
status, whether the bump commit landed on `main`, whether the tag exists,
`gh run list`/`gh run view`), then reconcile the task list to match. Real
repo/CI state stays authoritative; the task list mirrors it, it doesn't
replace it.

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
8. **Merge, if the automation choice covers it.** If the maintainer picked
   "stop after the PR," hand off instead: tell them it's ready, and that
   "merge" (to merge it) or "release it" (once merged, to start Phase 2)
   both work whenever they come back to it.

   Otherwise, poll until CI is green
   (`GH_HOST=github.com gh pr view <N> -R luojiahai/code-by-wire --json mergeStateStatus,statusCheckRollup`)
   — this is still a real precondition to wait out, not a re-ask of the
   go-ahead already given — then merge with a **merge commit** to match the history
   (`main` is all "Merge pull request #NNN from …", never squashes), and
   tidy up:

   ```
   GH_HOST=github.com gh pr merge <N> -R luojiahai/code-by-wire --merge
   git switch main && git pull
   git branch -d build/release-vX.Y.Z
   ```

   Then continue straight into Phase 2 below, in this same run — no need to
   wait for a separate "release it".

## Phase 2 — "release it" (after the PR merges)

The tag is the trigger; CI builds the installers into a draft release. If
you're landing here directly — a fresh conversation, or "release it" said
without Phase 1 running first in this run — the automation choice from "How
far to take it" above hasn't been made yet in this conversation; ask it now,
scoped to what's left (tag/build/publish, no merge option since that's
already done).

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
   draft release on `ubuntu-latest`; then the `build` matrix runs four parallel
   legs — mac `arm64` and mac `x64` (both sign/notarize on `macos-14`, the
   `x64` leg cross-compiling on the Apple Silicon runner, ~10-20 min), and win
   `x64` (`windows-latest`) and win `arm64` (`windows-11-arm`, both unsigned,
   ~5-10 min) — followed by a `merge` job that combines each platform's
   per-arch `latest*.yml` into one arch-aware auto-update manifest. Poll in
   the background so you get pinged on exit — but in zsh, **don't name the
   loop variable `status`**: it's read-only and silently kills the loop on
   the first iteration. Use `st` or similar.

   That background poll's completion notification is the only wakeup this
   needs — don't also reach for `ScheduleWakeup` as a belt-and-suspenders
   fallback "in case the notification doesn't fire." That tool only exists
   for `/loop`'s dynamic-pacing mode; calling it here errors (`prompt` is
   required unless `stop: true`) and, more to the point, is redundant even
   if it took a prompt — the harness already tracks the background command
   and will notify on exit regardless of how long the matrix takes. If a
   background notification genuinely seems lost, check the run directly
   (`gh run view`) rather than scheduling a timer.
   - **On failure:** pull the job logs, report the cause. If it was a flake,
     re-trigger by re-pushing the tag
     (`git push origin :refs/tags/vX.Y.Z && git push origin vX.Y.Z`) — yourself if
     local, otherwise hand it to the maintainer (same sandbox 403 applies).
   - **On success:** confirm the **draft** release carries all assets:

     ```
     GH_HOST=github.com gh release view vX.Y.Z -R luojiahai/code-by-wire --json isDraft,assets --jq '{draft:.isDraft, assets:[.assets[].name]}'
     ```

     Expect `draft: true` and 14 assets: from the mac legs,
     `Code-by-wire-arm64.dmg` + `Code-by-wire-x64.dmg` (each with a
     `.blockmap`) plus `Code-by-wire-arm64.zip` + `Code-by-wire-x64.zip` (each
     with a `.blockmap`); from the Windows legs, `Code-by-wire-Setup-arm64.exe`
     + `Code-by-wire-Setup-x64.exe` (each with a `.blockmap`); and from the
     `merge` job, `latest-mac.yml` + `latest.yml`. An empty or partial asset
     list means an upload step (or the `merge` job) didn't run — read the
     relevant job log. (`isLatest` isn't valid on `gh release view` — use
     `isDraft`/`isPrerelease` here, or `gh release list --json isLatest` to
     check which release is latest.)
4. **Drop the notes in.** Set the draft body from the `X.Y.Z` CHANGELOG section
   so it's ready to read, keeping it a draft:

   ```
   GH_HOST=github.com gh release edit vX.Y.Z -R luojiahai/code-by-wire --notes "$(...)"
   ```

   Editing a draft prints an `untagged-…` URL — that's just how GitHub addresses
   an unpublished draft, not an error.
5. **Publish, if the automation choice covers it.** If it does, and the
   draft is verified (assets + notes both confirmed above), publish:

   ```
   GH_HOST=github.com gh release edit vX.Y.Z -R luojiahai/code-by-wire --draft=false --latest
   ```

   Publishing flips `latest-mac.yml`/`latest.yml` into the public auto-update
   feed, so existing installs pick up the version on their next check — say
   that out loud when you confirm it's live.

   If the maintainer picked a "leave it for me to publish" option, hand off
   instead: remind them to open the draft, confirm the notes match the
   `X.Y.Z` CHANGELOG section, and **Publish release** — or say "publish" and
   you'll do it. If the tag was created via the web UI (already published, no
   draft), just verify the assets landed on that release.

## Why CI uploads assets by hand

Don't "simplify" the release job back to `electron-builder --publish always`. Its
GitHub publisher uploads files in parallel, and a draft release can't be looked up
by tag, so each upload races to create its own draft. v0.1.0's first run produced
**two** draft releases with the dmg, blockmap, and `latest-mac.yml` scattered
across them, and the job still went green looking like a clean release.

So the job builds with `--publish never` and uploads through `gh` instead: it
creates the draft once (or reuses it on a re-run) and uploads with `--clobber`,
which is deterministic and idempotent.

## Recovering a botched release

If a release ends up wrong (empty, or assets split across duplicate drafts from an
old `--publish always` run):

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

## Platforms & signing

macOS releases cover both Apple Silicon (`arm64`) and Intel (`x64`) — the
`x64` leg cross-compiles on the same `macos-14` arm64 runner (native modules
are rebuilt for the target arch explicitly, not the host's) rather than
depending on GitHub's scarce, slow `macos-13` Intel runners. Both arches sign
with the same Developer ID certificate and are notarized by Apple (the
`CSC_*` and `APPLE_*` secrets in CI), so the downloaded `.dmg` opens without
a Gatekeeper warning.

Windows releases cover `x64` (`windows-latest`) and `arm64`
(`windows-11-arm`), both unsigned NSIS installers. On first launch
SmartScreen shows an "unknown publisher" warning; users click **More info →
Run anyway**. Windows code-signing isn't set up yet.
