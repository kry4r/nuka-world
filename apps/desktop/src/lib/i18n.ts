import { useSyncExternalStore } from "react";

export type DesktopLocale = "zh-CN" | "en-US";

export const DESKTOP_LOCALE_STORAGE_KEY = "nuka.desktop.locale";
export const DEFAULT_DESKTOP_LOCALE: DesktopLocale = "zh-CN";

const messages = {
  "en-US": {
    "nav.chat": "Chat",
    "nav.team": "Team",
    "nav.agents": "Agents",
    "nav.memory": "Memory",
    "nav.knowledge": "Knowledge",
    "nav.settings": "Settings",
    "sidebar.provider.configured": "Configured provider",
    "sidebar.provider.missing": "No provider configured",
    "sidebar.provider.checking": "Checking provider status",
    "sidebar.provider.unavailable": "Provider unavailable",
    "sidebar.provider.openSettings": "Open Settings",
    "settings.nav.providers": "Providers",
    "settings.nav.runtime": "Runtime",
    "settings.nav.appearance": "Appearance",
    "settings.surface.navigation": "Settings section navigation",
    "settings.surface.controls": "Settings control surface",
    "settings.loading": "Loading local settings...",
    "settings.providers.title": "Providers",
    "settings.providers.import": "Import From Env",
    "settings.providers.add": "+ Add Provider",
    "settings.providers.summary.default": "Default {value}",
    "settings.providers.summary.fallback": "Fallback {value}",
    "settings.providers.summary.checks.on": "Checks on",
    "settings.providers.summary.checks.off": "Checks off",
    "settings.providers.default.label": "Default Provider",
    "settings.providers.default.none": "No default provider",
    "settings.providers.fallback.label": "Fallback Provider",
    "settings.providers.fallback.none": "No fallback provider",
    "settings.providers.connectionChecks": "Connection checks",
    "settings.providers.card.untitled": "Untitled Provider",
    "settings.providers.card.local": "Local runtime",
    "settings.providers.card.remote": "Remote provider",
    "settings.providers.card.enabled": "Enabled",
    "settings.providers.card.disabled": "Disabled",
    "settings.providers.field.name": "Provider name",
    "settings.providers.field.model": "Provider model",
    "settings.providers.field.baseUrl": "Provider base URL",
    "settings.providers.field.apiKey": "Provider API Key",
    "settings.providers.field.secret.replace": "Replace secret",
    "settings.providers.field.secret.paste": "Paste API key",
    "settings.providers.field.secret.saved": "Secret saved",
    "settings.providers.field.secret.empty": "No secret saved",
    "settings.providers.field.secret.clear": "Clear secret",
    "settings.providers.save": "Save Provider Changes",
    "settings.runtime.title": "Runtime Controls",
    "settings.runtime.field.externalEditorPath": "External editor path",
    "settings.runtime.field.externalEditorPath.placeholder": "Path to editor executable",
    "settings.runtime.field.closeBehavior": "Close behavior",
    "settings.runtime.field.closeBehavior.minimize": "Minimize to tray",
    "settings.runtime.field.closeBehavior.quit": "Quit app",
    "settings.runtime.field.logging": "Logging",
    "settings.runtime.field.logging.standard": "Standard",
    "settings.runtime.field.logging.verbose": "Verbose",
    "settings.runtime.toggle.launchAtLogin": "Launch at login",
    "settings.runtime.toggle.trayResident": "Tray resident",
    "settings.runtime.toggle.backgroundAdapters": "Background adapters",
    "settings.runtime.toggle.notifications": "Notifications",
    "settings.runtime.save": "Save Runtime",
    "settings.appearance.title": "Appearance",
    "settings.appearance.field.language": "Interface language",
    "settings.appearance.option.zh-CN": "中文",
    "settings.appearance.option.en-US": "English (US)",
    "settings.toast.runtimeSaved": "Runtime settings saved.",
    "settings.toast.providersSaved": "Provider changes saved.",
    "settings.toast.providerImported": "Imported provider: {value}",
    "settings.toast.secretCleared": "Secret cleared: {value}",
  },
  "zh-CN": {
    "nav.chat": "对话",
    "nav.team": "团队",
    "nav.agents": "智能体",
    "nav.memory": "记忆",
    "nav.knowledge": "知识库",
    "nav.settings": "设置",
    "sidebar.provider.configured": "已配置提供方",
    "sidebar.provider.missing": "未配置提供方",
    "sidebar.provider.checking": "正在检查提供方状态",
    "sidebar.provider.unavailable": "提供方不可用",
    "sidebar.provider.openSettings": "打开设置",
    "settings.nav.providers": "提供方",
    "settings.nav.runtime": "运行时",
    "settings.nav.appearance": "外观",
    "settings.surface.navigation": "设置分区导航",
    "settings.surface.controls": "设置控制面板",
    "settings.loading": "正在加载本地设置...",
    "settings.providers.title": "提供方",
    "settings.providers.import": "从环境导入",
    "settings.providers.add": "+ 添加提供方",
    "settings.providers.summary.default": "默认 {value}",
    "settings.providers.summary.fallback": "回退 {value}",
    "settings.providers.summary.checks.on": "预检开启",
    "settings.providers.summary.checks.off": "预检关闭",
    "settings.providers.default.label": "默认提供方",
    "settings.providers.default.none": "未设置默认提供方",
    "settings.providers.fallback.label": "回退提供方",
    "settings.providers.fallback.none": "未设置回退提供方",
    "settings.providers.connectionChecks": "连接预检",
    "settings.providers.card.untitled": "未命名提供方",
    "settings.providers.card.local": "本地运行时",
    "settings.providers.card.remote": "远程提供方",
    "settings.providers.card.enabled": "已启用",
    "settings.providers.card.disabled": "已停用",
    "settings.providers.field.name": "提供方名称",
    "settings.providers.field.model": "模型",
    "settings.providers.field.baseUrl": "基础 URL",
    "settings.providers.field.apiKey": "API Key",
    "settings.providers.field.secret.replace": "替换密钥",
    "settings.providers.field.secret.paste": "粘贴 API Key",
    "settings.providers.field.secret.saved": "已保存密钥",
    "settings.providers.field.secret.empty": "未保存密钥",
    "settings.providers.field.secret.clear": "清除密钥",
    "settings.providers.save": "保存提供方变更",
    "settings.runtime.title": "运行时控制",
    "settings.runtime.field.externalEditorPath": "外部编辑器路径",
    "settings.runtime.field.externalEditorPath.placeholder": "编辑器可执行文件路径",
    "settings.runtime.field.closeBehavior": "关闭行为",
    "settings.runtime.field.closeBehavior.minimize": "最小化到托盘",
    "settings.runtime.field.closeBehavior.quit": "退出应用",
    "settings.runtime.field.logging": "日志级别",
    "settings.runtime.field.logging.standard": "标准",
    "settings.runtime.field.logging.verbose": "详细",
    "settings.runtime.toggle.launchAtLogin": "开机启动",
    "settings.runtime.toggle.trayResident": "驻留托盘",
    "settings.runtime.toggle.backgroundAdapters": "后台适配器",
    "settings.runtime.toggle.notifications": "通知",
    "settings.runtime.save": "保存运行时设置",
    "settings.appearance.title": "外观",
    "settings.appearance.field.language": "界面语言",
    "settings.appearance.option.zh-CN": "中文",
    "settings.appearance.option.en-US": "English (US)",
    "settings.toast.runtimeSaved": "运行时设置已保存。",
    "settings.toast.providersSaved": "提供方变更已保存。",
    "settings.toast.providerImported": "已导入提供方：{value}",
    "settings.toast.secretCleared": "已清除密钥：{value}",
  },
} as const;

export type TranslationKey = keyof (typeof messages)["en-US"];

const listeners = new Set<() => void>();

function isDesktopLocale(value: string | null): value is DesktopLocale {
  return value === "zh-CN" || value === "en-US";
}

function readStoredLocale(): DesktopLocale {
  if (typeof window === "undefined") {
    return DEFAULT_DESKTOP_LOCALE;
  }

  const stored = window.localStorage.getItem(DESKTOP_LOCALE_STORAGE_KEY);
  return isDesktopLocale(stored) ? stored : DEFAULT_DESKTOP_LOCALE;
}

function notifyLocaleListeners() {
  listeners.forEach((listener) => listener());
}

export function getDesktopLocale(): DesktopLocale {
  return readStoredLocale();
}

export function setDesktopLocale(locale: DesktopLocale) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DESKTOP_LOCALE_STORAGE_KEY, locale);
  }

  notifyLocaleListeners();
}

function subscribeToLocale(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function translate(
  locale: DesktopLocale,
  key: TranslationKey,
  params?: Record<string, string | number>,
) {
  const template = messages[locale][key] ?? messages["en-US"][key];

  if (!params) {
    return template;
  }

  return Object.entries(params).reduce(
    (content, [paramKey, value]) => content.replaceAll(`{${paramKey}}`, String(value)),
    template,
  );
}

export function useDesktopLocale() {
  return useSyncExternalStore(
    subscribeToLocale,
    getDesktopLocale,
    () => DEFAULT_DESKTOP_LOCALE,
  );
}

export function useI18n() {
  const locale = useDesktopLocale();

  return {
    locale,
    setLocale: setDesktopLocale,
    t: (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(locale, key, params),
  };
}
