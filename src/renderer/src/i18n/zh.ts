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
    continue: "继续",
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
  shell: {
    sidebar: {
      newSession: "新建会话",
      stats: "统计",
      updatePendingTitle: "有更新待处理 — 详见设置 › 关于",
      updatePendingSrOnly: "（更新待处理）",
      searchPlaceholder: "搜索会话…",
      searchLabel: "搜索会话",
      clearSearch: "清除搜索",
      sessionsLabel: "会话",
      expandAll: "展开全部",
      collapseAll: "折叠全部",
      showAllSessions: "显示所有会话",
      showActiveOnly: "仅显示活跃会话",
      noActiveSessions: "没有活跃会话。",
      noSessionsYet: "暂无会话。",
      newSessionIn: (cwd) => `在 ${cwd} 中新建会话`,
    },
    sessionRow: {
      openSession: (title) => `打开 ${title}`,
      sessionActions: "会话操作",
    },
    sessionMenu: {
      renameFieldLabel: "重命名会话",
      menuTitle: "会话菜单",
      copySessionId: "复制会话 ID",
      rename: "重命名",
      adopt: "领养",
      adopting: "领养中…",
      fork: "复刻",
      forking: "复刻中…",
      endSession: "结束会话",
      openIn: "打开方式",
      resumeConfirmTitle: "恢复未记录模型的会话？",
      resumeConfirmBody:
        "该会话从未记录过模型 — 很可能在第一轮对话前就已出错 — 因此恢复时可能会因模型错误而失败。仍要继续吗？",
      resumeConfirmLabel: "仍然恢复",
      forkConfirmTitle: "复刻未记录模型的会话？",
      forkConfirmBody:
        "该会话从未记录过模型 — 很可能在第一轮对话前就已出错 — 因此复刻时可能会因模型错误而失败。仍要继续吗？",
      forkConfirmLabel: "仍然复刻",
      endConfirmTitle: "结束此会话？",
      endConfirmBody:
        "当前有一轮对话正在进行，将被中断。对话内容已保存，之后可通过领养恢复。",
      adoptTitleNoConversation: "无内容可领养 — 该会话没有已保存的对话记录。",
      adoptTitlePending: "该会话刚刚退出，稍后即可领养。",
      forkTitleNoConversation: "无内容可复刻 — 该会话没有已保存的对话记录。",
      forkTitleEnded: "该会话已结束 — 已没有可复刻的活跃内容。",
      forkTitleObserved: "观察中的会话不支持复刻 — 该会话并非由本应用管理。",
      endTitleLive: "结束此会话",
      endTitleUnavailable: "仅当会话处于本应用管理的活跃状态时才能结束。",
    },
    newSession: {
      ledeBefore: "在所选目录中启动",
      ledeAfter: "，并通过实时终端进行操作。",
      sessionSetup: "会话设置",
      directory: "目录",
      choose: "选择…",
      noDirectoryChosen: "未选择目录",
      model: "模型",
      modelDefault: "默认",
      failedToStart: "会话启动失败",
      create: "创建",
      starting: "启动中…",
    },
    middleHeader: {
      viewGroupLabel: "视图",
      claudeCode: "Claude Code",
      transcript: "记录",
    },
    footer: {
      keepAwake: "防止电脑休眠",
      letSleep: "允许电脑休眠",
      caffeinate: "保持唤醒",
      showTerminal: "显示终端",
      hideTerminal: "隐藏终端",
      terminal: "终端",
    },
    titlebar: {
      showSidebar: "显示侧边栏",
      hideSidebar: "隐藏侧边栏",
      showRightPanel: "显示右侧面板",
      hideRightPanel: "隐藏右侧面板",
    },
    gitReadout: {
      uncommittedChanges: "有未提交的更改",
    },
    sessionPanel: {
      heading: "会话",
      model: "模型",
      effort: "推理强度",
      git: "Git",
      pr: "PR",
      lines: "行数",
      clock: "时长",
      compactions: "压缩次数",
      active: "活跃",
      tokensReclaimed: (tokens) => `已回收 ${tokens} 个 token`,
    },
    sessionList: {
      ungrouped: "（无项目）",
    },
  },
  terminal: {
    tabListAria: "终端",
    newTerminal: "新建终端",
    closeOthers: "关闭其他",
    closeAll: "关闭全部",
    defaultTitle: "终端",
    processExited: "进程已退出",
    spawnFailed: (message) => `终端启动失败：${message}`,
  },
  workspace: {
    emptyStates: {
      noSessions: "未找到 Claude Code 会话。",
      selectSession: "选择一个会话以打开。",
    },
    mode: {
      managed: {
        label: "托管",
        blurb:
          "由 Code-by-wire 启动并驱动。你可以在这里发送输入、中断或结束它。",
      },
      observed: {
        label: "观察中",
        blurb:
          "正在另一个终端或设备中运行。Code-by-wire 仅只读镜像其记录，你无法在此输入。领养它即可接管。",
      },
    },
    observedTerminal: {
      endedBadge: "已结束",
      observedBadge: "观察中",
      endedBody: "该会话已结束，可将其重新唤醒。",
      observedBody: "该会话正在另一个终端中运行 — 此处为只读。",
      endedFooter: "领养 = 接管操作 · 复刻 = 探索新分支",
      observedFooter: "复刻它以分出你自己的会话。",
    },
    resume: {
      failed: "恢复失败",
    },
    openIn: {
      target: (name) => `在${name}中打开`,
      finder: "访达",
      fileExplorer: "文件资源管理器",
      fileManager: "文件管理器",
    },
  },
  stats: {
    clearDayFilter: "清除日期筛选",
    buildingHistory: "正在构建历史记录…",
    noUsage: "暂无使用记录。",
    shared: {
      unknownModel: "未知",
      tokensHeader: "Token",
      showMore: (n, total) => `再显示 ${n} 个（共 ${total} 个）`,
      rangeToday: "今天",
      range7d: "7天",
      range30d: "30天",
      range90d: "90天",
      rangeAll: "全部",
    },
    overview: {
      sessions: "会话",
      tokens: "Token",
      favoriteModel: "最常用模型",
      activeDays: "活跃天数",
      mostActiveDay: "最活跃日",
      longestSession: "最长会话",
      longestStreak: "最长连续",
      currentStreak: "当前连续",
      streakUnit: () => "天",
      contributions: "贡献",
      less: "少",
      more: "多",
      trailingYear: "最近 12 个月",
      tokensLabel: (value) => `${value} 个 token`,
      dayTokensAria: (day, tokens) => `${day}：${tokens}`,
    },
    models: {
      title: "每日 Token 用量",
      tooltipNoUsage: "暂无用量",
      total: "总计",
      inOut: (input, output) => `输入：${input} · 输出：${output}`,
    },
    projects: {
      title: "按项目",
      nameLabel: "项目",
    },
    sessions: {
      title: "按会话",
      colSession: "会话",
      colModel: "模型",
      colLastActivity: "最近活动",
      colDuration: "时长",
      colTurns: "轮次",
      copySessionId: "复制会话 ID",
    },
  },
  dock: {
    label: "活动",
    resizeAria: "调整活动面板高度",
    collapseAria: "收起活动面板",
    collapseTitle: "收起",
    expandAria: "展开活动面板",
    expandTitle: "展开",
    tabs: {
      tasks: "任务",
      subagents: "子代理",
      shells: "Shell",
      monitors: "监控",
    },
    tally: (tasks, subagents, shells, monitors) =>
      `${tasks} 个任务 · ${subagents} 个子代理 · ${shells} 个 Shell · ${monitors} 个监控`,
    status: {
      running: "运行中",
      completed: "已完成",
      failed: "失败",
      killed: "已终止",
      stopped: "已停止",
      blocked: "阻塞",
    },
    aboutMetric: (title) => (title ? `关于${title}` : "关于此指标"),
    tokensUnit: "token",
    tasks: {
      empty: "暂无任务。",
    },
    subagents: {
      empty: "暂无子代理。",
      drillAria: (type) => `查看 ${type} 子代理详情`,
      toolUse: "次工具调用",
      toolUses: "次工具调用",
      toolUsesAria: (n) => `${n} 次工具调用`,
    },
    shells: {
      empty: "暂无后台 Shell。",
      openLogAria: (command) => `打开 ${command} 的日志`,
      exitSuffix: (code) => `（退出码 ${code}）`,
      truncated: (kb) => `已隐藏 ${kb} KB 的早期输出`,
    },
    monitors: {
      empty: "暂无监控。",
      openDetailsAria: (command) => `打开 ${command} 的详情`,
    },
    pressure: {
      heading: "压力",
      info: "剩余多少余量：当前提示词的上下文占用超过窗口的比例，随后是本会话的速率限制窗口（已用百分比、重置倒计时——优先取会话自身的数据，会话未上报时用账户 API 数据补全）。Extra 为账户的付费额外用量额度。柱状条超过 70% 转琥珀色，超过 85% 转红色警戒。",
      noContext: "尚未采集到上下文数据。",
      contextWindowUnit: "% 上下文窗口",
      extra: "Extra",
      windowFiveHour: "5h",
      windowSevenDay: "7d",
      windowSevenDaySonnet: "7d S",
      windowSevenDayOpus: "7d O",
    },
    spend: {
      heading: "花费",
      info: "本会话已消耗的用量：按种类划分的 token 总量——新输入、生成输出、缓存读取，以及 5 分钟和 1 小时的缓存写入。$ 是 Claude Code 自身的会话记账；在订阅方案下它是等价 API 价值，并非实际账单。",
      kinds: {
        input: {
          label: "输入",
          description: "本会话处理的新提示词 token，按全价计费。",
        },
        output: {
          label: "输出",
          description: "模型生成的 token。",
        },
        cacheRead: {
          label: "缓存读取",
          description:
            "从缓存中回放、无需重新处理的上下文，价格约为输入的 10%。",
        },
        cacheWrite5m: {
          label: "缓存写入 5 分钟",
          description:
            "写入 5 分钟缓存的上下文，供下一轮低成本回放，价格为输入的 1.25 倍。",
        },
        cacheWrite1h: {
          label: "缓存写入 1 小时",
          description: "写入更长效的 1 小时缓存的上下文，价格为输入的 2 倍。",
        },
      },
    },
    duty: {
      heading: "占空比",
      info: "会话的占空比：会话生命周期中，API 请求实际在途的时间占比——模型工作的时间相对于会话保持打开的时间。自会话开始起累计，因此长时间空闲的会话即便当前正忙，读数也会偏低。",
      apiUnit: "% api",
    },
    throughput: {
      heading: "吞吐量",
      info: "最近 60 秒内活跃生成的 token 吞吐量。走势图描绘近期样本的总 tokens/秒；轮次之间的空闲间隙不计入统计。",
      idle: "空闲",
      input: "输入",
      output: "输出",
    },
  },
  transcript: {
    noneObserved: "该会话在磁盘上还没有记录。",
    noneManaged: "暂无记录 — 请在终端标签页中操作该会话。",
    noneSubagent: "该子代理在磁盘上还没有记录。",
    waitingHeading: "等待你的操作",
    waitingFallback: "等待你的输入",
    you: "你",
    claude: "Claude",
    thinking: "思考中",
    toolRunning: "运行中…",
    toolNoOutput: "无输出",
    toolOutputLines: (n) => `${n} 行`,
    viewToolOutput: (name) => `查看 ${name} 的输出`,
    viewDiff: (tool, file) => `查看 ${tool} 对 ${file} 的改动`,
    subagentLabel: "子代理",
    session: "会话",
    subagentCrumb: (type, description) =>
      description ? `子代理（${type}）：${description}` : `子代理（${type}）`,
  },
  modals: {
    escToClose: "按 Esc 关闭",
    shellTitle: "Shell 详情",
    monitorTitle: "监控详情",
    detail: {
      status: "状态",
      runtime: "运行时长",
      command: "命令",
      script: "脚本",
      output: "输出",
    },
    turnStatus: {
      ok: "通过",
      error: "失败",
      pending: "运行中",
    },
    toolResult: {
      loading: "正在加载输出…",
      loadError: "输出加载失败。",
      runningNoOutput: "运行中 — 暂无输出。",
      copyOutput: "复制输出",
    },
    diff: {
      noChanges: "无更改",
      copyPath: "复制路径",
      copyDiff: "复制改动",
    },
    outputBox: {
      reading: "正在读取输出…",
      unavailable: "无可用输出",
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
