import { formatTps } from "@shared/format";
import type { Translations } from "./en";

/** 简体中文 catalog. Full (not partial) — typed `: Translations` so tsc fails on any
 *  missing key, hermes's zh.ts enforcement model. Time functions re-implement the
 *  exact thresholds of @shared/format's helpers with Chinese units. */
export const zh: Translations = {
  common: {
    cancel: "取消",
    close: "关闭",
    copy: "复制",
    copied: "已复制",
  },
  settings: {
    nav: {
      settings: "设置",
      system: "系统",
      appearance: "外观",
      about: "关于",
    },
    appearance: {
      title: "外观",
      lede: "应用与终端默认使用深色主题，浅色需手动开启。",
      language: "语言",
      languageDesc: "应用的显示语言",
      appTheme: "应用主题",
      appThemeDesc: "面板、侧边栏与设置",
      terminalTheme: "终端主题",
      terminalThemeDesc: "交互式终端与会话观察终端",
      dark: "深色",
      light: "浅色",
    },
    system: {
      title: "系统",
      lede: "驱动本应用的底层机件，保持绿灯。",
    },
    about: {
      title: "关于",
      tagline: "在同一座驾驶舱里，掌控每个 Claude Code 会话并监控其遥测。",
    },
  },
  time: {
    ago: (ms, now) => {
      const s = Math.max(0, Math.round((now - ms) / 1000));
      if (s < 8) return "刚刚";
      if (s < 60) return `${s}秒前`;
      const m = Math.round(s / 60);
      if (m < 60) return `${m}分钟前`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}小时前`;
      return `${Math.floor(h / 24)}天前`;
    },
    countdown: (resetsAt, now) => {
      const ms = resetsAt - now;
      if (ms <= 0) return "现在";
      const totalMin = Math.floor(ms / 60_000);
      const d = Math.floor(totalMin / 1440);
      const h = Math.floor((totalMin % 1440) / 60);
      const m = totalMin % 60;
      if (d > 0) return h > 0 ? `${d}天${h}小时` : `${d}天`;
      if (h > 0) return m > 0 ? `${h}小时${m}分` : `${h}小时`;
      if (m > 0) return `${m}分`;
      return "不足1分";
    },
    duration: (ms) => {
      if (!Number.isFinite(ms) || ms <= 0) return "0秒";
      if (ms < 1000) return (ms / 1000).toFixed(1) + "秒";
      const totalSec = Math.round(ms / 1000);
      if (totalSec < 60) return `${totalSec}秒`;
      const totalMin = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      if (totalMin < 60) return s > 0 ? `${totalMin}分${s}秒` : `${totalMin}分`;
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return m > 0 ? `${h}小时${m}分` : `${h}小时`;
    },
    // "tokens/s" is a technical unit, kept untranslated (loanword-standard in zh dev tools).
    tps: (tps) => formatTps(tps),
    dayShort: (day) => {
      const [, m, d] = day.split("-").map(Number);
      return `${m}月${d}日`;
    },
    dayLong: (day) => {
      const [y, m, d] = day.split("-").map(Number);
      return `${y}年${m}月${d}日`;
    },
    monthShort: (day) => {
      const [, m] = day.split("-").map(Number);
      return `${m}月`;
    },
  },
};
