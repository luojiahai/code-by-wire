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
    // "tokens/s" is a technical unit — kept as-is in zh.
    expect(zh.time.tps(86.4)).toBe("86.4 tokens/s");
  });
});
