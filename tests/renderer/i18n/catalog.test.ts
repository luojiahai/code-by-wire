import { describe, it, expect } from "vitest";
import { TRANSLATIONS } from "../../../src/renderer/src/i18n/catalog";

const { en, zh } = TRANSLATIONS;
const now = 1_784_200_000_000;

describe("catalog time formatters", () => {
  it("en delegates to the shared format helpers", () => {
    expect(en.time.ago(now - 45_000, now)).toBe("45s ago");
    expect(en.time.duration(200_000)).toBe("3m 20s");
    expect(en.time.dayShort("2026-06-14")).toBe("Jun 14");
    expect(en.time.dayLong("2026-06-14")).toBe("Jun 14, 2026");
    expect(en.time.monthShort("2026-06-14")).toBe("Jun");
    expect(en.time.countdown(now + 8_040_000, now)).toBe("2h 14m");
    expect(en.time.tps(86.4)).toBe("86.4 tokens/s");
    // tpsValue + " " + tpsUnit must reproduce tps()'s own combined output — the hero
    // throughput readout styles them as separate elements instead of splitting the string.
    expect(en.time.tpsValue(86.4)).toBe("86.4");
    expect(en.time.tpsValue(1234)).toBe("1.2k");
    expect(en.time.tpsValue(0)).toBe("0");
    expect(en.time.tpsUnit).toBe("tokens/s");
  });

  it("zh renders Chinese units on the same thresholds", () => {
    expect(zh.time.ago(now - 3_000, now)).toBe("刚刚");
    expect(zh.time.ago(now - 45_000, now)).toBe("45秒前");
    expect(zh.time.ago(now - 600_000, now)).toBe("10分钟前");
    expect(zh.time.ago(now - 3 * 3_600_000, now)).toBe("3小时前");
    expect(zh.time.ago(now - 2 * 86_400_000, now)).toBe("2天前");
    expect(zh.time.duration(400)).toBe("0.4秒");
    expect(zh.time.duration(12_000)).toBe("12秒");
    expect(zh.time.duration(200_000)).toBe("3分20秒");
    expect(zh.time.duration(3_840_000)).toBe("1小时4分");
    expect(zh.time.countdown(now + 8_040_000, now)).toBe("2小时14分");
    expect(zh.time.countdown(now - 1, now)).toBe("现在");
    expect(zh.time.countdown(now + 30_000, now)).toBe("不足1分");
    expect(zh.time.dayShort("2026-06-14")).toBe("6月14日");
    expect(zh.time.dayLong("2026-06-14")).toBe("2026年6月14日");
    expect(zh.time.monthShort("2026-06-14")).toBe("6月");
    // Unlike en (which delegates to formatTps), zh formats its own throughput unit —
    // reviewer decision: "tokens/s" is loanword-standard in en dev tooling, but the
    // Chinese locale should say 词元 (token) consistently, including here.
    expect(zh.time.tps(86.4)).toBe("86.4 词元/秒");
    expect(zh.time.tps(1234)).toBe("1.2k 词元/秒");
    expect(zh.time.tps(0)).toBe("0 词元/秒");
    expect(zh.time.tpsValue(86.4)).toBe("86.4");
    expect(zh.time.tpsValue(1234)).toBe("1.2k");
    expect(zh.time.tpsValue(0)).toBe("0");
    expect(zh.time.tpsUnit).toBe("词元/秒");
  });
});

describe("catalog number formatters", () => {
  it("en groups by powers of 10^3 (k/M), delegating to the shared helpers", () => {
    expect(en.numbers.tokensShort(999)).toBe("999");
    expect(en.numbers.tokensShort(128_430)).toBe("128.4k");
    expect(en.numbers.tokensShort(2_480_000)).toBe("2.48M");
    expect(en.numbers.tokensAxis(2_480_000)).toBe("2.48M");
    expect(en.numbers.tokensAxis(125_000_000)).toBe("125M");
  });

  it("zh groups by powers of 10^4 (万/亿) instead — a different division, not just a unit swap", () => {
    expect(zh.numbers.tokensShort(9_999)).toBe("9999");
    expect(zh.numbers.tokensShort(100_000)).toBe("10.0万");
    expect(zh.numbers.tokensShort(128_430)).toBe("12.8万");
    // Promotion boundary: the highest value that still reads as N.N万 vs. rounding
    // up to a misleading "10000.0万" — mirrors en's own 999_950 (=10^6-50) boundary,
    // scaled to the 万->亿 order of magnitude (10^8-500).
    expect(zh.numbers.tokensShort(99_999_499)).toBe("9999.9万");
    expect(zh.numbers.tokensShort(99_999_500)).toBe("1.00亿");
    expect(zh.numbers.tokensShort(250_000_000)).toBe("2.50亿");
    // Axis form trims trailing zero decimals, same as en's formatTokensAxis.
    expect(zh.numbers.tokensAxis(100_000)).toBe("10万");
    expect(zh.numbers.tokensAxis(128_430)).toBe("12.8万");
    expect(zh.numbers.tokensAxis(99_999_500)).toBe("1亿");
    expect(zh.numbers.tokensAxis(250_000_000)).toBe("2.5亿");
  });
});

describe("catalog PR status", () => {
  it("en normalizes case and underscores, no translation", () => {
    expect(en.shell.sessionPanel.prStatus("OPEN")).toBe("open");
    expect(en.shell.sessionPanel.prStatus("CHANGES_REQUESTED")).toBe(
      "changes requested",
    );
  });

  it("zh translates every known gh/capture value", () => {
    expect(zh.shell.sessionPanel.prStatus("pending")).toBe("待处理");
    expect(zh.shell.sessionPanel.prStatus("APPROVED")).toBe("已批准");
    expect(zh.shell.sessionPanel.prStatus("CHANGES_REQUESTED")).toBe("需修改");
    expect(zh.shell.sessionPanel.prStatus("REVIEW_REQUIRED")).toBe("待审查");
    expect(zh.shell.sessionPanel.prStatus("OPEN")).toBe("开放");
    expect(zh.shell.sessionPanel.prStatus("CLOSED")).toBe("已关闭");
    expect(zh.shell.sessionPanel.prStatus("MERGED")).toBe("已合并");
  });

  it("zh falls back to the normalized raw string for an unrecognized value", () => {
    // Guards against a future gh/capture value the lookup table doesn't know yet —
    // must degrade to readable English, never throw or show "undefined".
    expect(zh.shell.sessionPanel.prStatus("SOMETHING_NEW")).toBe(
      "something new",
    );
  });
});

describe("catalog session-row subagent counts", () => {
  it("describes the recursive family count in both locales", () => {
    expect(en.shell.sessionRow.subagentCount(2, 1)).toBe(
      "2 subagents in this group · 1 active",
    );
    expect(en.shell.sessionRow.subagentCount(1, 0)).toBe(
      "1 subagent in this group",
    );
    expect(zh.shell.sessionRow.subagentCount(2, 1)).toBe(
      "组内 2 个子代理 · 1 个活跃",
    );
    expect(zh.shell.sessionRow.subagentCount(1, 0)).toBe("组内 1 个子代理");
  });
});
