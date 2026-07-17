import { describe, it, expect } from "vitest";
import {
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
  statSync,
  chmodSync,
  symlinkSync,
  lstatSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { createSettingsManager } from "../../src/main/settings/manager";
import { wrapperScript } from "../../src/main/settings/wrapper";
import { recoverWrappedCommandWin } from "../../src/main/settings/wrapper-win";
import { tempHomes } from "../helpers/temp-home";

const makeWinHome = tempHomes("cbw-mgr-win-");

const NOW = 1781000000000; // fixed clock (ms) for deterministic backup timestamps

const makeHome = tempHomes("cbw-settings-");

const settingsPath = (home: string) => join(home, "settings.json");
const readRaw = (home: string) => readFileSync(settingsPath(home), "utf8");
const readJson = (home: string) => JSON.parse(readRaw(home));
const readState = (home: string) =>
  JSON.parse(readFileSync(join(home, ".flightdeck", "state.json"), "utf8"));

// The exact command install writes — the contract the wrapper script (issue #11) will live behind.
// Uses "linux" as the injected platform so these POSIX tests exercise the sh path on all host OSes.
const appCommandFor = (home: string) =>
  `"${join(home, ".flightdeck", "statusline-wrapper.sh")}"`;

describe("install — clean (AC #2)", () => {
  it("adds the app statusLine and preserves every other key when none exists", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { theme: "dark", permissions: { allow: ["Bash"] } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    expect(mgr.isInstalled()).toBe(false);
    const result = mgr.install();

    const after = readJson(home);
    expect(after.statusLine).toEqual({
      type: "command",
      command: appCommandFor(home),
    });
    expect(after.theme).toBe("dark"); // untouched
    expect(after.permissions).toEqual({ allow: ["Bash"] }); // untouched
    expect(result.wrappedExisting).toBe(false);
    expect(mgr.isInstalled()).toBe(true);
  });

  it("creates settings.json from scratch when the file is absent", () => {
    const home = makeHome();
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    expect(existsSync(settingsPath(home))).toBe(false);
    const result = mgr.install();

    expect(readJson(home).statusLine).toEqual({
      type: "command",
      command: appCommandFor(home),
    });
    expect(result.wrappedExisting).toBe(false);
    expect(mgr.isInstalled()).toBe(true);
  });
});

describe("install — backup before modification (AC #3)", () => {
  it("writes a timestamped backup whose bytes equal the original, before modifying", () => {
    const home = makeHome();
    // Deliberately non-canonical (single-line, no trailing newline) so this can't pass against a backup
    // taken from the reserialized in-memory settings instead of the raw pre-install bytes.
    const original = '{"theme":"dark"}';
    writeFileSync(settingsPath(home), original);
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    const { backupPath } = mgr.install();

    expect(backupPath).not.toBeNull();
    expect(backupPath!.endsWith(".bak")).toBe(true);
    expect(backupPath!.startsWith(home)).toBe(true); // next to settings.json, easy to find by hand
    expect(readFileSync(backupPath!, "utf8")).toBe(original); // exact pre-install bytes, formatting and all
  });

  it("writes no backup when there was no settings.json to back up", () => {
    const home = makeHome();
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    const { backupPath } = mgr.install();

    expect(backupPath).toBeNull();
    expect(readdirSync(home).filter((f) => f.endsWith(".bak"))).toHaveLength(0);
  });
});

describe("install — wrap an existing statusLine (AC #1)", () => {
  it("records the original command in state.json and reports it wrapped, not clobbered", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        {
          statusLine: {
            type: "command",
            command: "my-prompt --color",
            padding: 2,
          },
        },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    const result = mgr.install();

    // The app's command is now installed (upstream knobs like padding ride along; see the
    // carry-through describe at the bottom)...
    expect(readJson(home).statusLine).toEqual({
      type: "command",
      command: appCommandFor(home),
      padding: 2,
    });
    // ...and the user's original is preserved for the wrapper (issue #11) to call through to.
    const state = readState(home);
    expect(state.wrappedCommand).toBe("my-prompt --color");
    expect(state.originalAbsent).toBe(false);
    expect(state.backupPath).toBe(result.backupPath);
    expect(result.wrappedExisting).toBe(true);
  });

  it("records originalAbsent + null wrappedCommand when settings.json did not exist", () => {
    const home = makeHome();
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    mgr.install();

    const state = readState(home);
    expect(state.originalAbsent).toBe(true);
    expect(state.wrappedCommand).toBeNull();
    expect(state.backupPath).toBeNull();
  });
});

describe("uninstall — restore byte-for-byte (AC #4)", () => {
  it("restores arbitrary original bytes exactly (4-space indent, no trailing newline, existing statusLine)", () => {
    const home = makeHome();
    // Deliberately not our canonical format: byte-for-byte must hold regardless of formatting.
    const original =
      '{\n    "theme": "dark",\n    "statusLine": {"type":"command","command":"my-prompt","padding":2}\n}';
    writeFileSync(settingsPath(home), original);
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    const { backupPath } = mgr.install();
    expect(readRaw(home)).not.toBe(original); // proves install actually changed the file
    mgr.uninstall();

    expect(readRaw(home)).toBe(original); // byte-for-byte
    expect(mgr.isInstalled()).toBe(false);
    expect(existsSync(backupPath!)).toBe(true); // backups are kept as an audit/recovery trail
  });

  it('restores "no settings.json" by deleting the file install created', () => {
    const home = makeHome();
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    mgr.install();
    expect(existsSync(settingsPath(home))).toBe(true);
    mgr.uninstall();

    expect(existsSync(settingsPath(home))).toBe(false);
    expect(mgr.isInstalled()).toBe(false);
  });

  it("throws rather than silently leaving wrapped settings when the backup is gone", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    const { backupPath } = mgr.install();
    rmSync(backupPath!); // the backup vanishes

    expect(() => mgr.uninstall()).toThrow(/backup missing/);
    expect(mgr.isInstalled()).toBe(true); // still wrapped — we did NOT silently clear it
    expect(existsSync(join(home, ".flightdeck", "state.json"))).toBe(true); // record kept so a retry can restore
  });
});

describe("trust-safety", () => {
  it("install is idempotent: a second install neither re-wraps nor writes a second backup", () => {
    const home = makeHome();
    const original =
      JSON.stringify(
        {
          statusLine: { type: "command", command: "my-prompt" },
          theme: "dark",
        },
        null,
        2,
      ) + "\n";
    writeFileSync(settingsPath(home), original);
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    const first = mgr.install();
    const second = mgr.install(); // must be a no-op

    expect(readdirSync(home).filter((f) => f.endsWith(".bak"))).toHaveLength(1); // no second backup
    expect(readState(home).wrappedCommand).toBe("my-prompt"); // still the user's, not our own command
    expect(second.wrappedExisting).toBe(true);
    expect(second.backupPath).toBe(first.backupPath);

    mgr.uninstall();
    expect(readRaw(home)).toBe(original); // round-trip still pristine
  });

  it("refuses to touch a malformed settings.json (parse before any write)", () => {
    const home = makeHome();
    const malformed = "{ this is not valid json";
    writeFileSync(settingsPath(home), malformed);
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    expect(() => mgr.install()).toThrow();
    expect(readRaw(home)).toBe(malformed); // untouched
    expect(existsSync(join(home, ".flightdeck", "state.json"))).toBe(false); // no state written
    expect(readdirSync(home).filter((f) => f.endsWith(".bak"))).toHaveLength(0); // no backup written
  });

  it("uninstall is a no-op when nothing was installed", () => {
    const home = makeHome();
    const original = JSON.stringify({ theme: "dark" }, null, 2);
    writeFileSync(settingsPath(home), original);
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    expect(() => mgr.uninstall()).not.toThrow();
    expect(readRaw(home)).toBe(original); // untouched
  });

  it("captures a non-string statusLine command as null, but still marks it wrapped", () => {
    const home = makeHome();
    // A hand-edited file could hold a non-string command. StatusLine.command is *typed* string,
    // but the value comes from JSON.parse with no runtime check — guard the trust boundary.
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: 123 } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    const result = mgr.install();

    expect(result.wrappedExisting).toBe(true); // a statusLine did exist
    expect(readState(home).wrappedCommand).toBeNull(); // ...but there was no string command to call through to
  });

  it("surfaces a corrupt state.json on uninstall instead of silently leaving the user wrapped", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    writeFileSync(
      join(home, ".flightdeck", "state.json"),
      "{ corrupt not json",
    ); // the record we rely on is broken

    expect(() => mgr.uninstall()).toThrow();
    expect(mgr.isInstalled()).toBe(true); // still wrapped — we did NOT silently pretend to uninstall
    expect(existsSync(join(home, ".flightdeck", "state.json"))).toBe(true); // broken record kept, not deleted
  });
});

describe("trust-safety — desync between settings.json and state.json", () => {
  it("uninstall surfaces a wrapped settings.json whose state record is missing, never silently no-ops", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    rmSync(join(home, ".flightdeck", "state.json")); // the record we rely on vanishes while still wrapped

    expect(() => mgr.uninstall()).toThrow(/install record|wrapped/i);
    expect(mgr.isInstalled()).toBe(true); // still wrapped — a missing record must not read as "not installed"
  });

  it("install self-heals a wrapped settings.json with no state record by recovering from the wrapper", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    rmSync(join(home, ".flightdeck", "state.json")); // the record vanishes while the wrapper survives

    const healed = mgr.install();
    expect(healed.healed).toBe(true);
    expect(healed.wrappedExisting).toBe(true);
    expect(mgr.isInstalled()).toBe(true); // still wrapped, now consistent again

    // state.json is rebuilt with the original command recovered from the wrapper, not our own wrapper path.
    expect(readState(home).wrappedCommand).toBe("mine");
    // ...and the new backup holds the reconstructed original, so uninstall can still restore it.
    expect(
      JSON.parse(readFileSync(healed.backupPath!, "utf8")).statusLine.command,
    ).toBe("mine");

    mgr.uninstall();
    expect(readJson(home).statusLine.command).toBe("mine");
  });

  it("install re-wraps from the record when the statusLine entry was stripped externally", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" }, theme: "dark" },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    // An external tool strips the statusLine entry while our record survives — ccstatusline's
    // uninstall deletes whichever statusLine is present, ours included.
    const stripped = readJson(home);
    delete stripped.statusLine;
    writeFileSync(settingsPath(home), JSON.stringify(stripped, null, 2));
    expect(mgr.isInstalled()).toBe(false);

    const healed = mgr.install();
    expect(healed.healed).toBe(true);
    expect(healed.wrappedExisting).toBe(true);
    expect(mgr.isInstalled()).toBe(true);

    // The recorded command survives into the rebuilt state and the wrapper's call-through…
    expect(readState(home).wrappedCommand).toBe("mine");
    expect(
      readFileSync(join(home, ".flightdeck", "statusline-wrapper.sh"), "utf8"),
    ).toContain("| mine");
    // …the stripped file's other keys survive…
    expect(readJson(home).theme).toBe("dark");
    // …and the new backup holds the reconstructed original, so uninstall restores the user's prompt.
    expect(
      JSON.parse(readFileSync(healed.backupPath!, "utf8")).statusLine.command,
    ).toBe("mine");
    mgr.uninstall();
    expect(readJson(home).statusLine.command).toBe("mine");
  });

  it("reinstall after an external strip stays capture-only when the record wrapped no command", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify({ theme: "dark" }, null, 2),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install(); // wrapped nothing — the user had no statusLine of their own

    const stripped = readJson(home);
    delete stripped.statusLine;
    writeFileSync(settingsPath(home), JSON.stringify(stripped, null, 2));

    const again = mgr.install();
    expect(again.healed).toBe(false); // nothing recoverable — a plain reinstall, not a heal
    expect(readState(home).wrappedCommand).toBeNull();
    expect(mgr.isInstalled()).toBe(true);
  });

  it("recovers the wrapped command from the record even when settings.json was deleted wholesale", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    rmSync(settingsPath(home)); // the whole file vanishes while state.json survives

    const healed = mgr.install();
    expect(healed.healed).toBe(true);
    expect(readState(home).wrappedCommand).toBe("mine"); // not clobbered to null
    expect(
      readFileSync(join(home, ".flightdeck", "statusline-wrapper.sh"), "utf8"),
    ).toContain("| mine");
  });

  it("install self-heals to a clean reinstall when the wrapper is also gone (nothing to recover)", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    rmSync(join(home, ".flightdeck"), { recursive: true }); // state.json AND wrapper both wiped

    const healed = mgr.install();
    expect(healed.healed).toBe(true);
    expect(healed.wrappedExisting).toBe(false); // no original recoverable
    expect(mgr.isInstalled()).toBe(true);
    expect(readState(home).wrappedCommand).toBeNull(); // capture-only; the lost original is gone for good
  });

  it("uninstall surfaces a structurally wrong (but valid JSON) state.json", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    writeFileSync(join(home, ".flightdeck", "state.json"), "{}"); // valid JSON, wrong shape

    expect(() => mgr.uninstall()).toThrow(/corrupt|invalid/i);
    expect(mgr.isInstalled()).toBe(true); // still wrapped — wrong-shape state must not strand the user
  });
});

describe("trust-safety — valid-but-non-object settings.json", () => {
  it("refuses a settings.json that is a JSON array, leaving it untouched", () => {
    const home = makeHome();
    writeFileSync(settingsPath(home), "[]");
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    expect(() => mgr.install()).toThrow(/not a JSON object/i);
    expect(readRaw(home)).toBe("[]"); // untouched
    expect(existsSync(join(home, ".flightdeck", "state.json"))).toBe(false); // no state written
    expect(readdirSync(home).filter((f) => f.endsWith(".bak"))).toHaveLength(0); // no backup written
  });

  it("refuses a settings.json that is the literal null, with a clear error not a raw TypeError", () => {
    const home = makeHome();
    writeFileSync(settingsPath(home), "null");
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    expect(() => mgr.install()).toThrow(/not a JSON object/i);
    expect(readRaw(home)).toBe("null"); // untouched
  });
});

describe("trust-safety — reinstall after uninstall (backup collision)", () => {
  it("does not collide on the backup filename when the clock has not advanced", () => {
    const home = makeHome();
    const original =
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ) + "\n";
    writeFileSync(settingsPath(home), original);
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    mgr.install();
    mgr.uninstall(); // keeps the first backup as an audit trail
    expect(() => mgr.install()).not.toThrow(); // same NOW must not throw EEXIST on the kept backup

    expect(mgr.isInstalled()).toBe(true);
    expect(readdirSync(home).filter((f) => f.endsWith(".bak"))).toHaveLength(2); // both backups kept, distinct names
  });
});

describe("trust-safety — symlinked settings.json", () => {
  it("writes through a symlinked settings.json instead of replacing the link (dotfiles-style)", () => {
    const home = makeHome();
    const real = join(home, "real-settings.json");
    writeFileSync(
      real,
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    symlinkSync(real, settingsPath(home)); // settings.json → real-settings.json, e.g. linked into a dotfiles repo
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    mgr.install();

    expect(lstatSync(settingsPath(home)).isSymbolicLink()).toBe(true); // link preserved, not clobbered to a file
    expect(JSON.parse(readFileSync(real, "utf8")).statusLine.command).toBe(
      appCommandFor(home),
    ); // written through

    mgr.uninstall();

    expect(lstatSync(settingsPath(home)).isSymbolicLink()).toBe(true); // still a link after restore
    expect(JSON.parse(readFileSync(real, "utf8")).statusLine.command).toBe(
      "mine",
    ); // restored through the link
  });
});

// POSIX fixture: Windows chmod does not enforce POSIX file mode bits (0o600 vs 0o666)
describe.skipIf(process.platform === "win32")(
  "trust-safety — file permissions",
  () => {
    it("preserves a restrictive (0600) settings.json mode through install and uninstall", () => {
      const home = makeHome();
      writeFileSync(
        settingsPath(home),
        JSON.stringify(
          { statusLine: { type: "command", command: "mine" } },
          null,
          2,
        ),
      );
      chmodSync(settingsPath(home), 0o600);
      const mgr = createSettingsManager({
        claudeDir: home,
        now: () => NOW,
        platform: "linux",
      });

      const { backupPath } = mgr.install();

      const mask = 0o777;
      expect(statSync(backupPath!).mode & mask).toBe(0o600); // backup must not widen a 0600 secret to 0644
      expect(statSync(settingsPath(home)).mode & mask).toBe(0o600); // nor the live wrapped file

      mgr.uninstall();
      expect(statSync(settingsPath(home)).mode & mask).toBe(0o600); // nor the restored file
    });
  },
);

describe("install — materializes the wrapper script (issue #11)", () => {
  const wrapperPath = (home: string) =>
    join(home, ".flightdeck", "statusline-wrapper.sh");

  it("writes an executable wrapper that calls through to the wrapped command", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "my-prompt" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    mgr.install();

    expect(existsSync(wrapperPath(home))).toBe(true);
    const src = readFileSync(wrapperPath(home), "utf8");
    expect(src).toContain("| my-prompt");
    if (process.platform !== "win32") {
      expect(statSync(wrapperPath(home)).mode & 0o777).toBe(0o755); // directly executable
    }
  });

  it("writes a capture-only wrapper (no call-through) on a clean install with no original", () => {
    const home = makeHome();
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    mgr.install();

    const src = readFileSync(wrapperPath(home), "utf8");
    expect(src).toContain("/statusline"); // still writes captures into our dir
    expect(src).not.toMatch(/\| \S/); // no call-through pipe to any command
  });

  it("re-install self-heals a deleted wrapper without minting a second backup", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();
    rmSync(wrapperPath(home)); // the wrapper vanishes while still wrapped

    mgr.install(); // already-wrapped path must rewrite it

    expect(existsSync(wrapperPath(home))).toBe(true);
    expect(readdirSync(home).filter((f) => f.endsWith(".bak"))).toHaveLength(1);
  });

  it("uninstall removes the wrapper and the capture dir", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();
    expect(existsSync(wrapperPath(home))).toBe(true);

    mgr.uninstall();

    expect(existsSync(wrapperPath(home))).toBe(false);
    expect(existsSync(join(home, ".flightdeck", "statusline"))).toBe(false);
  });

  it("writes no wrapper when it refuses a malformed settings.json", () => {
    const home = makeHome();
    writeFileSync(settingsPath(home), "{ not valid json");
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    expect(() => mgr.install()).toThrow();
    expect(existsSync(wrapperPath(home))).toBe(false); // bailed before ensureAppDir/writeWrapper
  });
});

describe("install — win32 platform selection", () => {
  it("installs a .ps1 wrapper and a powershell command on win32", () => {
    const dir = makeWinHome();
    const mgr = createSettingsManager({
      claudeDir: dir,
      now: () => NOW,
      platform: "win32",
    });
    mgr.install();
    const settings = JSON.parse(
      readFileSync(join(dir, "settings.json"), "utf8"),
    );
    expect(settings.statusLine.command).toMatch(
      /powershell.*statusline-wrapper\.ps1/i,
    );
    expect(existsSync(join(dir, ".flightdeck", "statusline-wrapper.ps1"))).toBe(
      true,
    );
  });

  it("does NOT write a .sh wrapper on win32", () => {
    const dir = makeWinHome();
    const mgr = createSettingsManager({
      claudeDir: dir,
      now: () => NOW,
      platform: "win32",
    });
    mgr.install();
    expect(existsSync(join(dir, ".flightdeck", "statusline-wrapper.sh"))).toBe(
      false,
    );
  });

  it("win32 install is idempotent and uninstall restores to nothing", () => {
    const dir = makeWinHome();
    const mgr = createSettingsManager({
      claudeDir: dir,
      now: () => NOW,
      platform: "win32",
    });
    mgr.install();
    mgr.install(); // idempotent
    mgr.uninstall();
    expect(existsSync(join(dir, "settings.json"))).toBe(false);
  });

  it("win32 wrapper round-trips the wrapped command via the .ps1 file", () => {
    const dir = makeWinHome();
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify(
        { statusLine: { type: "command", command: "my-prompt" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: dir,
      now: () => NOW,
      platform: "win32",
    });
    mgr.install();

    const ps1 = readFileSync(
      join(dir, ".flightdeck", "statusline-wrapper.ps1"),
      "utf8",
    );
    expect(ps1).toContain("my-prompt"); // call-through baked
    expect(recoverWrappedCommandWin(ps1)).toBe("my-prompt"); // recoverable verbatim

    mgr.uninstall();
    const restored = JSON.parse(
      readFileSync(join(dir, "settings.json"), "utf8"),
    );
    expect(restored.statusLine.command).toBe("my-prompt");
  });

  it("self-heals a win32 wrapper with no state record by recovering from the .ps1", () => {
    const dir = makeWinHome();
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: dir,
      now: () => NOW,
      platform: "win32",
    });
    mgr.install();
    rmSync(join(dir, ".flightdeck", "state.json"));

    const healed = mgr.install();
    expect(healed.healed).toBe(true);
    expect(healed.wrappedExisting).toBe(true);
    expect(
      JSON.parse(readFileSync(join(dir, ".flightdeck", "state.json"), "utf8"))
        .wrappedCommand,
    ).toBe("mine");

    mgr.uninstall();
    expect(
      JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")).statusLine
        .command,
    ).toBe("mine");
  });

  it("uninstall removes a leftover foreign-platform wrapper too", () => {
    const dir = makeWinHome();
    const mgr = createSettingsManager({
      claudeDir: dir,
      now: () => NOW,
      platform: "win32",
    });
    mgr.install();
    const appDir = join(dir, ".flightdeck");
    // A stale .sh from an earlier POSIX install on the same shared ~/.claude. uninstall must remove
    // every flightdeck wrapper, not just the current platform's, or the foreign one is orphaned.
    writeFileSync(join(appDir, "statusline-wrapper.sh"), "#!/bin/sh\n");

    mgr.uninstall();

    expect(existsSync(join(appDir, "statusline-wrapper.ps1"))).toBe(false);
    expect(existsSync(join(appDir, "statusline-wrapper.sh"))).toBe(false);
  });
});

// A statusLine left pointing at a flightdeck wrapper from a different platform/older build (e.g. a POSIX
// .sh wrapper still referenced on a Windows box) must not be treated as the user's own command and wrapped
// again — that buries it behind cmd.exe /c "<...>wrapper.sh" and loses the real original.
describe("install — does not re-wrap a foreign flightdeck wrapper", () => {
  function seedForeignShWrapper(dir: string, wrappedCommand: string | null) {
    const appDir = join(dir, ".flightdeck");
    mkdirSync(appDir, { recursive: true });
    const shPath = join(appDir, "statusline-wrapper.sh");
    writeFileSync(shPath, wrapperScript({ wrappedCommand }));
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify(
        { statusLine: { type: "command", command: `"${shPath}"` } },
        null,
        2,
      ),
    );
    return appDir;
  }

  it("recovers the real original from a foreign .sh wrapper on win32", () => {
    const dir = makeWinHome();
    const appDir = seedForeignShWrapper(dir, "my-real-statusline --json");
    const mgr = createSettingsManager({
      claudeDir: dir,
      now: () => NOW,
      platform: "win32",
    });

    const res = mgr.install();

    expect(res.healed).toBe(true);
    const ps1 = readFileSync(join(appDir, "statusline-wrapper.ps1"), "utf8");
    expect(ps1).not.toContain("statusline-wrapper.sh"); // not re-wrapping our own wrapper
    expect(recoverWrappedCommandWin(ps1)).toBe("my-real-statusline --json");
    expect(
      JSON.parse(readFileSync(join(appDir, "state.json"), "utf8"))
        .wrappedCommand,
    ).toBe("my-real-statusline --json");
    expect(
      JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")).statusLine
        .command,
    ).toMatch(/powershell.*statusline-wrapper\.ps1/i);
  });

  it("treats a foreign capture-only .sh wrapper as no original on win32", () => {
    const dir = makeWinHome();
    const appDir = seedForeignShWrapper(dir, null);
    const mgr = createSettingsManager({
      claudeDir: dir,
      now: () => NOW,
      platform: "win32",
    });

    mgr.install();

    const ps1 = readFileSync(join(appDir, "statusline-wrapper.ps1"), "utf8");
    expect(ps1).not.toContain("statusline-wrapper.sh");
    expect(recoverWrappedCommandWin(ps1)).toBeNull(); // capture-only → no call-through
    expect(
      JSON.parse(readFileSync(join(appDir, "state.json"), "utf8"))
        .wrappedCommand,
    ).toBeNull();
  });
});

// Claude Code's statusLine block carries upstream knobs beyond the command — padding, and
// refreshInterval (without which the statusLine only re-runs on conversation events, so an idle
// session's live capture freezes). Wrapping must not silently degrade them: they ride along in the
// wrapped block and in state.json, so every heal path can rebuild the block as the user tuned it.
describe("install — carries upstream statusLine extras through the wrap", () => {
  const wrapped = {
    statusLine: {
      type: "command",
      command: "mine",
      padding: 2,
      refreshInterval: 10,
    },
  };

  it("carries padding/refreshInterval into the wrapped block and records them in state.json", () => {
    const home = makeHome();
    writeFileSync(settingsPath(home), JSON.stringify(wrapped, null, 2));
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    mgr.install();

    expect(readJson(home).statusLine).toEqual({
      type: "command",
      command: appCommandFor(home),
      padding: 2,
      refreshInterval: 10,
    });
    expect(readState(home).wrappedExtras).toEqual({
      padding: 2,
      refreshInterval: 10,
    });
  });

  it("restores the extras when healing a statusLine entry stripped externally", () => {
    const home = makeHome();
    writeFileSync(settingsPath(home), JSON.stringify(wrapped, null, 2));
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    const stripped = readJson(home);
    delete stripped.statusLine;
    writeFileSync(settingsPath(home), JSON.stringify(stripped, null, 2));

    const healed = mgr.install();
    expect(healed.healed).toBe(true);
    expect(readJson(home).statusLine).toEqual({
      type: "command",
      command: appCommandFor(home),
      padding: 2,
      refreshInterval: 10,
    });
    // ...and the reconstructed backup carries them too, so uninstall restores the tuned original.
    expect(
      JSON.parse(readFileSync(healed.backupPath!, "utf8")).statusLine,
    ).toEqual({
      type: "command",
      command: "mine",
      padding: 2,
      refreshInterval: 10,
    });
  });

  it("keeps the extras when healing a vanished state.json from the wrapper script", () => {
    const home = makeHome();
    writeFileSync(settingsPath(home), JSON.stringify(wrapped, null, 2));
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    rmSync(join(home, ".flightdeck", "state.json")); // record vanishes; the wrapped block survives

    const healed = mgr.install();
    expect(healed.healed).toBe(true);
    expect(readJson(home).statusLine.refreshInterval).toBe(10); // recovered from the live block
    expect(readState(home).wrappedExtras).toEqual({
      padding: 2,
      refreshInterval: 10,
    });
  });

  it("re-syncs the record when the user hand-tunes the wrapped block (idempotent install)", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    // The user adds refreshInterval to the live wrapped block by hand…
    const tuned = readJson(home);
    tuned.statusLine.refreshInterval = 10;
    writeFileSync(settingsPath(home), JSON.stringify(tuned, null, 2));

    mgr.install(); // idempotent branch — must pick the tuning up into the record

    expect(readState(home).wrappedExtras).toEqual({ refreshInterval: 10 });

    // …so a later external strip heals back to the tuned block, not the first-wrapped one.
    const stripped = readJson(home);
    delete stripped.statusLine;
    writeFileSync(settingsPath(home), JSON.stringify(stripped, null, 2));
    mgr.install();
    expect(readJson(home).statusLine.refreshInterval).toBe(10);
  });

  it("accepts a pre-extras state.json (older build) without treating it as corrupt", () => {
    const home = makeHome();
    writeFileSync(settingsPath(home), JSON.stringify(wrapped, null, 2));
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    const statePath = join(home, ".flightdeck", "state.json");
    const old = JSON.parse(readFileSync(statePath, "utf8"));
    delete old.wrappedExtras; // a record written before this field existed
    writeFileSync(statePath, JSON.stringify(old, null, 2));

    expect(() => mgr.install()).not.toThrow(); // idempotent branch reads the old record fine
    expect(() => mgr.uninstall()).not.toThrow();
    expect(readJson(home).statusLine).toEqual(wrapped.statusLine); // restored verbatim
  });
});

describe("status() and setRefreshInterval()", () => {
  it("status reports not-installed before install, installed + interval after", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        {
          statusLine: {
            type: "command",
            command: "mine",
            refreshInterval: 10,
          },
        },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    expect(mgr.status()).toEqual({ installed: false, refreshInterval: null });
    mgr.install();
    expect(mgr.status()).toEqual({ installed: true, refreshInterval: 10 });
  });

  it("status reads null interval when the wrapped block has none", () => {
    const home = makeHome();
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();
    expect(mgr.status()).toEqual({ installed: true, refreshInterval: null });
  });

  it("setRefreshInterval writes the block, preserves other keys, and re-syncs wrappedExtras", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        {
          theme: "dark",
          statusLine: { type: "command", command: "mine", padding: 2 },
        },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    mgr.setRefreshInterval(10);

    const block = readJson(home).statusLine;
    expect(block.refreshInterval).toBe(10);
    expect(block.command).toBe(appCommandFor(home)); // still wrapped
    expect(block.padding).toBe(2); // carried extras untouched
    expect(readJson(home).theme).toBe("dark"); // unrelated keys untouched
    expect(readState(home).wrappedExtras).toEqual({
      padding: 2,
      refreshInterval: 10,
    });
  });

  it("setRefreshInterval(null) deletes the key from block and record", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        {
          statusLine: { type: "command", command: "mine", refreshInterval: 10 },
        },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    mgr.setRefreshInterval(null);

    expect("refreshInterval" in readJson(home).statusLine).toBe(false);
    expect(readState(home).wrappedExtras).toEqual({});
  });

  it("setRefreshInterval is a no-op when not installed or on an invalid value", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });

    const before = readRaw(home);
    mgr.setRefreshInterval(10); // not installed → no write
    expect(readRaw(home)).toBe(before);

    mgr.install();
    const wrapped = readRaw(home);
    mgr.setRefreshInterval(0); // < 1
    mgr.setRefreshInterval(2.5); // non-integer
    mgr.setRefreshInterval(4000); // > 3600
    expect(readRaw(home)).toBe(wrapped);
  });

  it("does not mutate settings.json when state.json is corrupt (read before write)", () => {
    const home = makeHome();
    writeFileSync(
      settingsPath(home),
      JSON.stringify(
        { statusLine: { type: "command", command: "mine" } },
        null,
        2,
      ),
    );
    const mgr = createSettingsManager({
      claudeDir: home,
      now: () => NOW,
      platform: "linux",
    });
    mgr.install();

    writeFileSync(
      join(home, ".flightdeck", "state.json"),
      "{ corrupt not json",
    ); // the record we rely on is broken

    const before = readRaw(home);
    expect(() => mgr.setRefreshInterval(10)).toThrow();
    expect(readRaw(home)).toBe(before); // no half-applied write — settings.json untouched
  });
});
