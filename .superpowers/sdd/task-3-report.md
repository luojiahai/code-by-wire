# Task 3 Report: Addon Importer (xterm-addon-importer.ts)

## Summary

Successfully implemented the XtermAddonImporter class, a lazy-loading wrapper for three @xterm addon packages with module-level constructor caching.

## Implementation Details

### Files Created

1. **src/renderer/src/xterm/xterm-addon-importer.ts** (41 lines)
   - Exported `XtermAddonImporter` class with async `importAddon<T>(name: T)` method
   - Exported `XtermAddonName` type union: `"serialize" | "unicode11" | "webgl"`
   - Exported `XtermAddonNameToCtor` interface mapping addon names to their ctor types
   - Module-level `importedAddons` Map shared across all importer instances
   - Lazy dynamic imports with fallback error handling

2. **tests/xterm/xterm-addon-importer.test.ts** (37 lines)
   - Mocks all three @xterm addon packages (Fake1, Fake2, Fake3 constructors)
   - Test 1: "resolves each managed addon to its constructor" — verifies all three addons resolve to correct constructor
   - Test 2: "caches constructors module-wide across importer instances" — verifies cache is shared across instances

### Architecture Decisions

- **Module-level cache**: The `importedAddons` Map lives outside the class, ensuring all XtermAddonImporter instances share the same cache (matches vscode pattern per brief comment :33)
- **Dynamic imports**: Uses `await import()` for each addon, allowing Vite to code-split each into its own chunk
- **Type safety**: Full TypeScript types with generic constraint `<T extends XtermAddonName>` ensuring compile-time correctness
- **Error handling**: Throws clear error if switch statement doesn't catch a name (defensive programming)

## TDD Process

### RED Phase (Failing Test)
```
pnpm vitest run tests/xterm/xterm-addon-importer.test.ts
→ FAIL: "Failed to resolve import ...xterm-addon-importer". Module doesn't exist.
```

### GREEN Phase (Passing Test)
After implementation:
```
✓ tests/xterm/xterm-addon-importer.test.ts (2 tests) 1ms
✓ Test Files  1 passed (1)
✓ Tests  2 passed (2)
```

### Full Suite Verification
All tests pass (no regressions):
```
Test Files  158 passed (158)
Tests  1488 passed (1488)
```

### Typecheck
```
$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json
→ No errors
```

## Self-Review Findings

✅ **Completeness:**
- All three managed addon names (serialize, unicode11, webgl) handled
- Module-level cache shared correctly across instances
- Both test cases present and passing

✅ **Quality:**
- Code matches brief exactly (line-for-line)
- Clear JSDoc attribution to vscode source
- Follows project TypeScript conventions

✅ **Discipline:**
- Nothing added beyond brief specification
- No unused imports or exports
- Proper error messages for debugging

✅ **Testing:**
- Both test cases pass with expected output names (Fake1, Fake2, Fake3)
- Cache test confirms referential equality across instances
- Mocked addon imports work as intended with vi.mock pattern

## Files Changed

- ✅ src/renderer/src/xterm/xterm-addon-importer.ts (NEW)
- ✅ tests/xterm/xterm-addon-importer.test.ts (NEW)

## Commit

```
a4e6b7c feat(xterm): port vscode lazy addon importer
```

Staged files: 2 files, 63 insertions

## Concerns

None. The implementation is complete, tested, and follows the brief exactly.

---

**Status:** DONE  
**Date:** 2026-07-15  
**Branch:** refactor/xterm-terminal-port (HEAD a4e6b7c)

## Fix: review finding (hollow cache test)

### Finding

A task reviewer flagged that the second `it()` in `tests/xterm/xterm-addon-importer.test.ts`
("caches constructors module-wide across importer instances") didn't actually prove the
module-level `importedAddons` cache does anything: it called `importAddon("webgl")` on two
separate importer instances and asserted `a === b`. Dynamic `import()` of the same specifier
string is already deduped by the ECMAScript module system itself — so the assertion would pass
identically even with the `Map` deleted from the implementation entirely.

### What changed

Rewrote `tests/xterm/xterm-addon-importer.test.ts` to use `vi.doMock` + `vi.resetModules()`
instead of top-level `vi.mock` + static imports:

- Removed the static top-of-file `import { XtermAddonImporter } from "..."` and the three
  top-level `vi.mock(...)` calls.
- Added `beforeEach(() => vi.resetModules())` so each test starts with a clean module registry.
- Test 1 ("resolves each managed addon to its constructor") now does its `vi.doMock(...)` calls
  and a dynamic `await import(".../xterm-addon-importer")` inside the test body.
- Test 2 was replaced with "caches the resolved constructor across calls even if the underlying
  module later changes": it mocks `@xterm/addon-webgl` to `FakeA`, dynamically imports
  `XtermAddonImporter` once, creates ONE instance, and calls `importAddon("webgl")` (caching
  `FakeA` internally on that already-evaluated module). It then calls `vi.resetModules()` and
  re-mocks `@xterm/addon-webgl` to a DIFFERENT constructor, `FakeB`, without re-importing
  `XtermAddonImporter` (the held class/instance reference survives the reset). Calling
  `importAddon("webgl")` again on the *same* instance must still return `FakeA` if the importer's
  own cache is doing the work — a fresh, uncached `import()` after the reset would resolve to
  `FakeB` instead.

### RED/GREEN test-the-test evidence (required proof)

**RED** — temporarily neutered the cache in `src/renderer/src/xterm/xterm-addon-importer.ts`
(removed the `importedAddons.get(name)` read and the `if (!ctor)` guard/`importedAddons.set(...)`
write, so `importAddon` always resolves fresh via the `switch` + `import()`):

```
❯ tests/xterm/xterm-addon-importer.test.ts (2 tests | 1 failed) 9ms
   × ... caches the resolved constructor across calls even if the underlying module later changes
     → expected [Function FakeB] to be [Function FakeA] // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```

The new test failed exactly as predicted — the neutered implementation re-resolved after the
reset and returned `FakeB`, proving the test discriminates cached vs. uncached behavior.

**GREEN** — reverted the neutering (`git checkout -- src/renderer/src/xterm/xterm-addon-importer.ts`,
confirmed `git diff` on that file is empty), reran:

```
 ✓ tests/xterm/xterm-addon-importer.test.ts (2 tests) 6ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

### Full-suite result (after restoring the real implementation)

```
pnpm test
 Test Files  158 passed (158)
      Tests  1488 passed (1488)
```

```
pnpm typecheck
$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json
→ No errors
```

No regressions elsewhere; counts match the pre-fix baseline (158 files / 1488 tests).

### Files changed in this fix

- ✅ tests/xterm/xterm-addon-importer.test.ts (rewritten)
- ✅ .superpowers/sdd/task-3-report.md (this section)
- src/renderer/src/xterm/xterm-addon-importer.ts — untouched in the final state (temporarily
  edited only to prove the RED phase, then reverted)

### Concerns

None. The new test empirically proven to fail against a broken (uncached) implementation and
pass against the real one.
