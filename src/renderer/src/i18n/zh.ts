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
    cli: {
      title: "Claude Code CLI",
      recheck: "重新检测",
      stateChecking: "检测中",
      stateReady: "就绪",
      stateFault: "故障",
      version: "版本",
      config: "配置",
      notDetected: "未检测到",
      headlineReady: "已就绪",
      headlineOutdated: "有可用更新",
      headlineLoggedOut: "已登出",
      headlineUnknown: "状态未知",
      headlineNotFound: "未找到",
      detailReady: "已是最新版本，可以使用。",
      detailFallback: "需要处理。",
      installNativeLabel: "原生安装器",
      installNativeNote:
        "将安装至 ~/.local/bin/claude — 请确保 ~/.local/bin 已加入 PATH。",
      loginBefore: "启动一个会话（终端会提示你登录），或在终端中运行",
      loginAfter: "命令。",
      verifyBefore: "在终端中运行",
      verifyAfter: "以确认其可正常工作。",
      installDocs: "安装文档",
      copyAction: "复制",
      unavailableReason:
        "Claude Code CLI 当前不可用 — 请查看标题栏中的系统状态。",
    },
    statusline: {
      title: "Statusline",
      stateCapturing: "捕获中",
      stateStale: "已过期",
      stateFault: "故障",
      stateOff: "已关闭",
      stateChecking: "检测中",
      enable: "启用",
      disable: "禁用",
      staleHeadline: "无新捕获",
      faultHeadline: "捕获故障",
      repair: "修复",
      watchKindLive: "活跃",
      watchKindWorking: "运行中",
      staleBody: (count, kind) =>
        `${count} 个${kind}会话均未上报 — 捕获已停止。修复将重写该封装脚本。`,
      noteOn:
        "实时占空比、时钟与速率限制均通过 Claude Code 的状态栏传递给面板。你自己的状态栏照常显示。",
      noteOff:
        "捕获已关闭：面板退回使用会话记录数据 — 没有实时占空比、时钟或速率限制。你的状态栏不受影响，照常运行。",
      lastCapture: "上次捕获",
      never: "从未",
      sessions: "会话",
      noSessions: (kind) => `没有${kind}会话`,
      sessionsReporting: (reporting, watched, kind) =>
        `${watched} 个${kind}会话中有 ${reporting} 个已上报`,
      refresh: "刷新",
      eventsOnly: "仅事件触发",
      every: (seconds) => `每 ${seconds} 秒`,
      edit: "编辑",
      refreshPlaceholder: "秒数（1–60），留空则仅事件触发",
      save: "保存",
    },
    statsDb: {
      title: "统计数据库",
      stateChecking: "检测中",
      backfilling: (done, total) => `回填中 · ${done}/${total}`,
      mirrored: "镜像完成",
      location: "位置",
      size: "大小",
      ingested: "已收录",
      ingestedValue: (turns, sessions) =>
        `${turns} 轮对话 · ${sessions} 个会话`,
      history: "历史记录",
      since: (day) => `自 ${day} 起`,
      dangerHeadline: "超出保留期限将不可恢复",
      dangerBody:
        "将根据磁盘上的会话记录重建。早于 Claude Code 清理窗口的历史记录将永久丢失。",
      resetError: "重置失败，请重试。",
      reset: "重置",
      confirmTitle: "重置统计数据库？",
      confirmBody:
        "将清除已计算的统计数据，并根据磁盘上的会话记录重新构建。早于 Claude Code 记录保留期限的历史记录将永久丢失。",
    },
    update: {
      title: "软件更新",
      autoCheckLabel: "启动时检查更新",
      autoCheckDesc: "每次启动应用时检查新版本",
      upToDate: "已是最新",
      check: "检查更新",
      checking: "正在检查更新…",
      available: "有可用更新",
      onVersion: (version) => `当前 v${version}`,
      onVersionReleased: (version, date) => `当前 v${version} · 发布于 ${date}`,
      releaseNotes: "更新说明",
      download: "下载",
      downloading: "正在下载更新…",
      downloadProgress: (transferred, total, percent) =>
        `${transferred} / ${total} · ${percent}%`,
      ready: "更新已就绪",
      downloaded: "已下载 · 将在下次退出时安装",
      restartHint: "或立即重启以马上应用",
      restartNow: "立即重启",
      checkError: "检查更新失败",
      retryDetail: (message) => `${message} · 将在下次启动时重试`,
      retry: "重试",
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
