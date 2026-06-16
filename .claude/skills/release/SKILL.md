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

## Phase 1 — "bump version" (before release)

Do all the prep on a branch and open the PR. **Do not tag.**

1. **Pick the version.** Semantic Versioning. If the bump level (patch/minor)
   is ambiguous from the commit range, confirm with the maintainer.
2. **Branch off `main`.** `git switch main && git pull`, then a fresh branch.
3. **Set `version` in `package.json`** to `X.Y.Z`.
4. **Update `CHANGELOG.md`.** It follows Keep a Changelog + SemVer.
   - Open a dated `## [X.Y.Z] - YYYY-MM-DD` section.
   - Fill it from the `vLAST..HEAD` commit range, grouped as
     Added / Changed / Removed / Fixed. Fold within-feature fixups into the
     feature's bullet; list only genuinely separate, user-facing fixes under
     Fixed. Audit the range against the entry — don't trust a first pass.
   - Repoint `[Unreleased]` and add the `[X.Y.Z]` compare link in the footer so
     the links chain (`vPREV...vX.Y.Z`).
   - If a prior shipped version has no notes, backfill it from its own tag range.
5. **Commit.** Bump + changelog in one `build(release): vX.Y.Z` commit. Keep
   unrelated changelog backfills as separate `docs(changelog):` commits.
   Conventional Commits; no `Co-Authored-By` trailer.
6. **Verify.** `pnpm format` and `pnpm lint` (CI runs `format:check` then
   `lint` and fails on either). Lint warnings in `src/main/provider/claude/`
   are intentional — leave them.
7. **Push and open the PR.** No tag, no PR-body footer.
8. **Hand off.** Tell the maintainer the PR is ready; after it merges they'll
   say "release it" (phase 2).

## Phase 2 — "release it" (after the PR merges)

The tag is the trigger; CI builds the dmg into a draft release.

1. **Confirm state.** `git switch main && git pull`; check the bump commit is on
   `main` and `node -p "require('./package.json').version"` equals the version to
   tag.
2. **Tag the release — environment-aware.** Who pushes the tag depends on where
   Claude Code is running:
   - **Local Claude Code** (on the maintainer's machine): push the tag yourself.

     ```
     git switch main && git pull
     git tag vX.Y.Z
     git push origin vX.Y.Z
     ```

   - **Claude Code on the web / remote sandbox**: the git proxy is scoped to the
     session's feature branch and **403s any other ref** (tags included), and the
     GitHub tools here can't create a tag/ref. So prepare and verify everything,
     then hand the maintainer the same three commands to run from a local clone.
   - **Unsure which?** Just attempt the push — a successful push means you're
     local and you're done; an **HTTP 403** on the tag ref (while branch pushes
     succeed) means you're in the sandbox, so fall back to the handoff.

   Web-UI alternative (maintainer, any environment): Releases → Draft a new
   release → choose tag `vX.Y.Z` ("create on publish"), target `main` →
   **Publish** (saving a draft does *not* create the tag, so CI won't fire). This
   publishes immediately, so the release is briefly visible without assets until
   CI's upload step finishes.
3. **Shepherd CI to a verified draft.** CI success and new tags aren't delivered
   as webhook events, so wait for the maintainer's "tag pushed" ping (or arm a
   monitor). Then:
   - Watch the `Release` run via the GitHub Actions tools: `verify` (fails fast
     if tag ≠ `package.json`) → the `macos-14` build.
   - **On failure:** pull the job logs, report the cause. If it was a flake,
     re-trigger by re-pushing the tag
     (`git push origin :refs/tags/vX.Y.Z && git push origin vX.Y.Z`) — yourself if
     local, otherwise hand it to the maintainer (same sandbox 403 applies).
   - **On success:** confirm the **draft** release for `vX.Y.Z` carries all three
     assets: `Code-by-wire-X.Y.Z-arm64.dmg`, its `.blockmap`, and
     `latest-mac.yml`. An empty asset list means the upload step didn't run —
     read the release job log.
4. **Hand back to publish.** Remind the maintainer to open the draft, confirm the
   notes match the `X.Y.Z` CHANGELOG section, and **Publish release** —
   publishing is the maintainer's call. If the tag was created via the web UI
   (already published, no draft), just verify the assets landed on that release.
