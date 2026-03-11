import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  importProviderFromEnv,
  listProviders,
  saveProvider,
  type ProviderRecord,
} from "@/lib/providers";

type SettingsSectionId =
  | "general"
  | "providers"
  | "appearance"
  | "shortcuts"
  | "runtime";

type SettingsPayload = {
  defaultProviderId: string;
  fallbackProviderId: string;
  connectionChecks: boolean;
  interfaceFont: string;
  messageFont: string;
  textSize: string;
  language: string;
  responseLocale: string;
  timeFormat: string;
  density: string;
  motion: string;
  windowChrome: string;
  sidebarDefault: string;
  closeBehavior: string;
  launchAtLogin: boolean;
  trayResident: boolean;
  backgroundAdapters: boolean;
  logging: string;
  notifications: boolean;
};

type SettingsSectionDefinition = {
  id: SettingsSectionId;
  label: string;
  summary: string;
};

const SECTION_DEFINITIONS: SettingsSectionDefinition[] = [
  {
    id: "general",
    label: "General",
    summary: "Language, locale, and reading density.",
  },
  {
    id: "providers",
    label: "Providers",
    summary: "Default routing and saved model endpoints.",
  },
  {
    id: "appearance",
    label: "Appearance",
    summary: "Fonts, shell chrome, and motion.",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    summary: "Common bindings only.",
  },
  {
    id: "runtime",
    label: "Runtime",
    summary: "Window lifecycle and background behavior.",
  },
];

const EMPTY_SETTINGS: SettingsPayload = {
  defaultProviderId: "",
  fallbackProviderId: "",
  connectionChecks: true,
  interfaceFont: "Inter",
  messageFont: "Inter Text",
  textSize: "14 px",
  language: "English (US)",
  responseLocale: "Follow session",
  timeFormat: "24-hour",
  density: "Comfortable",
  motion: "Standard",
  windowChrome: "Minimal glass",
  sidebarDefault: "Expanded",
  closeBehavior: "Minimize to tray",
  launchAtLogin: false,
  trayResident: true,
  backgroundAdapters: true,
  logging: "Standard",
  notifications: true,
};

type ShortcutPreferenceState = {
  globalShortcuts: boolean;
};

const DEFAULT_SHORTCUT_PREFERENCES: ShortcutPreferenceState = {
  globalShortcuts: true,
};

const SHORTCUT_ROWS = [
  { action: "Open chat", shortcut: "Ctrl+L" },
  { action: "Toggle team", shortcut: "Ctrl+Shift+W" },
  { action: "Open settings", shortcut: "Ctrl+," },
  { action: "Send message", shortcut: "Enter" },
];

const GENERAL_FIELDS: Array<keyof SettingsPayload> = [
  "language",
  "responseLocale",
  "timeFormat",
  "density",
];

const APPEARANCE_FIELDS: Array<keyof SettingsPayload> = [
  "interfaceFont",
  "messageFont",
  "textSize",
  "motion",
  "windowChrome",
  "sidebarDefault",
];

const RUNTIME_FIELDS: Array<keyof SettingsPayload> = [
  "closeBehavior",
  "launchAtLogin",
  "trayResident",
  "backgroundAdapters",
  "logging",
  "notifications",
];

const PROVIDER_SCOPE_FIELDS: Array<keyof SettingsPayload> = [
  "defaultProviderId",
  "fallbackProviderId",
  "connectionChecks",
];

function pickSettingsFields(
  settings: SettingsPayload,
  keys: Array<keyof SettingsPayload>,
): Partial<SettingsPayload> {
  return Object.fromEntries(keys.map((key) => [key, settings[key]])) as Partial<SettingsPayload>;
}

function createProviderDraft(index: number): ProviderRecord {
  return {
    id: `provider-draft-${index + 1}`,
    name: "New Provider",
    baseUrl: "",
    model: "",
    apiKey: "",
    local: false,
    enabled: false,
  };
}

function providerRuntimeLabel(provider: ProviderRecord) {
  return provider.local ? "Local runtime" : "Remote provider";
}

function sameProviderRecord(
  left: ProviderRecord | undefined,
  right: ProviderRecord | undefined,
) {
  if (!left || !right) {
    return false;
  }

  return (
    left.id === right.id &&
    left.name === right.name &&
    left.baseUrl === right.baseUrl &&
    left.model === right.model &&
    left.apiKey === right.apiKey &&
    left.local === right.local &&
    left.enabled === right.enabled
  );
}

export function SettingsPage() {
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("general");
  const [settings, setSettings] = useState<SettingsPayload>(EMPTY_SETTINGS);
  const [initialSettings, setInitialSettings] =
    useState<SettingsPayload>(EMPTY_SETTINGS);
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [initialProviders, setInitialProviders] = useState<ProviderRecord[]>([]);
  const [shortcutPreferences, setShortcutPreferences] = useState<ShortcutPreferenceState>(
    DEFAULT_SHORTCUT_PREFERENCES,
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [isSavingAppearance, setIsSavingAppearance] = useState(false);
  const [isSavingProviders, setIsSavingProviders] = useState(false);
  const [isSavingRuntime, setIsSavingRuntime] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void Promise.all([
      listProviders(),
      invoke<SettingsPayload>("load_settings"),
    ])
      .then(([loadedProviders, loadedSettings]) => {
        if (!alive) {
          return;
        }

        setProviders(loadedProviders);
        setInitialProviders(loadedProviders);
        setSettings(loadedSettings);
        setInitialSettings(loadedSettings);
        setError(null);
        setIsLoaded(true);
      })
      .catch((caughtError) => {
        if (!alive) {
          return;
        }

        const message =
          caughtError instanceof Error ? caughtError.message : String(caughtError);
        setError(message);
        setIsLoaded(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  const activeDefinition =
    SECTION_DEFINITIONS.find((section) => section.id === activeSection) ??
    SECTION_DEFINITIONS[0];

  const generalDirty = useMemo(
    () =>
      JSON.stringify(pickSettingsFields(settings, GENERAL_FIELDS)) !==
      JSON.stringify(pickSettingsFields(initialSettings, GENERAL_FIELDS)),
    [initialSettings, settings],
  );

  const appearanceDirty = useMemo(
    () =>
      JSON.stringify(pickSettingsFields(settings, APPEARANCE_FIELDS)) !==
      JSON.stringify(pickSettingsFields(initialSettings, APPEARANCE_FIELDS)),
    [initialSettings, settings],
  );

  const runtimeDirty = useMemo(
    () =>
      JSON.stringify(pickSettingsFields(settings, RUNTIME_FIELDS)) !==
      JSON.stringify(pickSettingsFields(initialSettings, RUNTIME_FIELDS)),
    [initialSettings, settings],
  );

  const providersDirty = useMemo(
    () => JSON.stringify(providers) !== JSON.stringify(initialProviders),
    [initialProviders, providers],
  );

  const providerScopeDirty = useMemo(
    () =>
      JSON.stringify(pickSettingsFields(settings, PROVIDER_SCOPE_FIELDS)) !==
      JSON.stringify(pickSettingsFields(initialSettings, PROVIDER_SCOPE_FIELDS)),
    [initialSettings, settings],
  );

  const updateSetting = <K extends keyof SettingsPayload>(
    key: K,
    value: SettingsPayload[K],
  ) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const updateProvider = <K extends keyof ProviderRecord>(
    index: number,
    key: K,
    value: ProviderRecord[K],
  ) => {
    setProviders((current) =>
      current.map((provider, providerIndex) =>
        providerIndex === index
          ? {
              ...provider,
              [key]: value,
              ...(key === "baseUrl"
                ? {
                    local:
                      String(value).toLowerCase().includes("localhost") ||
                      String(value).includes("127.0.0.1"),
                  }
                : {}),
            }
          : provider,
      ),
    );
  };

  const handleAddProvider = () => {
    setProviders((current) => [...current, createProviderDraft(current.length)]);
    setActiveSection("providers");
  };

  const handleSaveSettings = async (
    setSaving: (value: boolean) => void,
  ) => {
    setSaving(true);
    setError(null);

    try {
      const saved = await invoke<SettingsPayload>("save_settings", {
        payload: settings,
      });
      setSettings(saved);
      setInitialSettings(saved);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProviders = async () => {
    setIsSavingProviders(true);
    setError(null);

    const nextProviders = [...providers];
    const nextInitialProviders = [...initialProviders];

    try {
      for (const [index, provider] of providers.entries()) {
        if (sameProviderRecord(provider, initialProviders[index])) {
          continue;
        }

        const savedProvider = await saveProvider(provider);
        nextProviders[index] = savedProvider;
        nextInitialProviders[index] = savedProvider;
      }

      const savedSettings = await invoke<SettingsPayload>("save_settings", {
        payload: settings,
      });

      setProviders(nextProviders);
      setInitialProviders(nextInitialProviders);
      setSettings(savedSettings);
      setInitialSettings(savedSettings);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      setProviders(nextProviders);
      setInitialProviders(nextInitialProviders);
      setError(message);
    } finally {
      setIsSavingProviders(false);
    }
  };

  const handleImportProviderFromEnv = async () => {
    setIsSavingProviders(true);
    setError(null);

    try {
      const imported = await importProviderFromEnv();
      setProviders((current) => {
        const existingIndex = current.findIndex((provider) => provider.id === imported.id);
        if (existingIndex === -1) {
          return [...current, imported];
        }

        return current.map((provider, index) =>
          index === existingIndex ? imported : provider,
        );
      });
      setInitialProviders((current) => {
        const existingIndex = current.findIndex((provider) => provider.id === imported.id);
        if (existingIndex === -1) {
          return [...current, imported];
        }

        return current.map((provider, index) =>
          index === existingIndex ? imported : provider,
        );
      });
      setActiveSection("providers");
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
    } finally {
      setIsSavingProviders(false);
    }
  };

  const renderSectionHeader = (
    title: string,
    summary: string,
    actions?: ReactNode,
  ) => (
    <header className="settings-directory__header">
      <div className="settings-directory__header-copy">
        <span className="settings-directory__eyebrow">{activeDefinition.label}</span>
        <h1>{title}</h1>
        <p>{summary}</p>
      </div>
      {actions ? <div className="settings-directory__header-actions">{actions}</div> : null}
    </header>
  );

  const renderGeneralSection = () => (
    <>
      {renderSectionHeader(
        "General",
        "Keep language, locale, and density in one compact place.",
      )}

      <section className="settings-directory__panel">
        <div className="settings-form-grid">
          <label className="settings-form-field">
            <span className="settings-form-field__label">Language</span>
            <select
              aria-label="Language"
              className="settings-select"
              onChange={(event) => updateSetting("language", event.target.value)}
              value={settings.language}
            >
              <option value="English (US)">English (US)</option>
              <option value="Chinese (Simplified)">Chinese (Simplified)</option>
              <option value="Japanese">Japanese</option>
            </select>
          </label>

          <label className="settings-form-field">
            <span className="settings-form-field__label">Response Locale</span>
            <select
              aria-label="Response Locale"
              className="settings-select"
              onChange={(event) => updateSetting("responseLocale", event.target.value)}
              value={settings.responseLocale}
            >
              <option value="Follow session">Follow session</option>
              <option value="Follow app language">Follow app language</option>
              <option value="English (US)">English (US)</option>
            </select>
          </label>

          <label className="settings-form-field">
            <span className="settings-form-field__label">Time Format</span>
            <select
              aria-label="Time Format"
              className="settings-select"
              onChange={(event) => updateSetting("timeFormat", event.target.value)}
              value={settings.timeFormat}
            >
              <option value="24-hour">24-hour</option>
              <option value="12-hour">12-hour</option>
            </select>
          </label>

          <label className="settings-form-field">
            <span className="settings-form-field__label">Density</span>
            <select
              aria-label="Density"
              className="settings-select"
              onChange={(event) => updateSetting("density", event.target.value)}
              value={settings.density}
            >
              <option value="Comfortable">Comfortable</option>
              <option value="Compact">Compact</option>
            </select>
          </label>
        </div>

        <div className="settings-panel__footer">
          <button
            className="settings-button settings-button--accent"
            disabled={!generalDirty || isSavingGeneral}
            onClick={() => void handleSaveSettings(setIsSavingGeneral)}
            type="button"
          >
            {isSavingGeneral ? "Saving..." : "Save General"}
          </button>
        </div>
      </section>
    </>
  );

  const renderAppearanceSection = () => (
    <>
      {renderSectionHeader(
        "Appearance Defaults",
        "Adjust fonts, shell chrome, and motion without stretching the page.",
      )}

      <section className="settings-directory__panel">
        <div className="settings-form-grid">
          <label className="settings-form-field">
            <span className="settings-form-field__label">Interface Font</span>
            <select
              aria-label="Interface Font"
              className="settings-select"
              onChange={(event) => updateSetting("interfaceFont", event.target.value)}
              value={settings.interfaceFont}
            >
              <option value="Inter">Inter</option>
              <option value="IBM Plex Sans">IBM Plex Sans</option>
              <option value="Suisse Intl">Suisse Intl</option>
            </select>
          </label>

          <label className="settings-form-field">
            <span className="settings-form-field__label">Message Font</span>
            <select
              aria-label="Message Font"
              className="settings-select"
              onChange={(event) => updateSetting("messageFont", event.target.value)}
              value={settings.messageFont}
            >
              <option value="Inter Text">Inter Text</option>
              <option value="IBM Plex Sans">IBM Plex Sans</option>
              <option value="Geist">Geist</option>
            </select>
          </label>

          <label className="settings-form-field">
            <span className="settings-form-field__label">Text Size</span>
            <select
              aria-label="Text Size"
              className="settings-select"
              onChange={(event) => updateSetting("textSize", event.target.value)}
              value={settings.textSize}
            >
              <option value="14 px">14 px</option>
              <option value="15 px">15 px</option>
              <option value="16 px">16 px</option>
            </select>
          </label>

          <label className="settings-form-field">
            <span className="settings-form-field__label">Motion</span>
            <select
              aria-label="Motion"
              className="settings-select"
              onChange={(event) => updateSetting("motion", event.target.value)}
              value={settings.motion}
            >
              <option value="Standard">Standard</option>
              <option value="Reduced">Reduced</option>
            </select>
          </label>

          <label className="settings-form-field">
            <span className="settings-form-field__label">Window Chrome</span>
            <select
              aria-label="Window Chrome"
              className="settings-select"
              onChange={(event) => updateSetting("windowChrome", event.target.value)}
              value={settings.windowChrome}
            >
              <option value="Minimal glass">Minimal glass</option>
              <option value="System native">System native</option>
            </select>
          </label>

          <label className="settings-form-field">
            <span className="settings-form-field__label">Sidebar Default</span>
            <select
              aria-label="Sidebar Default"
              className="settings-select"
              onChange={(event) => updateSetting("sidebarDefault", event.target.value)}
              value={settings.sidebarDefault}
            >
              <option value="Expanded">Expanded</option>
              <option value="Collapsed">Collapsed</option>
            </select>
          </label>
        </div>

        <div className="settings-panel__footer">
          <button
            className="settings-button settings-button--accent"
            disabled={!appearanceDirty || isSavingAppearance}
            onClick={() => void handleSaveSettings(setIsSavingAppearance)}
            type="button"
          >
            {isSavingAppearance ? "Saving..." : "Save Appearance"}
          </button>
        </div>
      </section>
    </>
  );

  const renderProvidersSection = () => (
    <>
      {renderSectionHeader(
        "Providers",
        "Set default routing and keep saved runtimes compact.",
        <div className="settings-panel__actions">
          <button
            className="settings-button"
            disabled={isSavingProviders}
            onClick={() => void handleImportProviderFromEnv()}
            type="button"
          >
            Import From Env
          </button>
          <button
            className="settings-button settings-button--accent"
            onClick={handleAddProvider}
            type="button"
          >
            + Add Provider
          </button>
        </div>,
      )}

      <section className="settings-directory__panel">
        <div className="settings-form-grid">
          <label className="settings-form-field">
            <span className="settings-form-field__label">Default Provider</span>
            <select
              aria-label="Default Provider"
              className="settings-select"
              onChange={(event) => updateSetting("defaultProviderId", event.target.value)}
              value={settings.defaultProviderId}
            >
              <option value="">No default provider</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-form-field">
            <span className="settings-form-field__label">Fallback Provider</span>
            <select
              aria-label="Fallback Provider"
              className="settings-select"
              onChange={(event) => updateSetting("fallbackProviderId", event.target.value)}
              value={settings.fallbackProviderId}
            >
              <option value="">No fallback provider</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="settings-toggle-row">
          <span className="settings-form-field__copy">
            <strong>Connection checks</strong>
            <span className="settings-form-field__hint">
              Run lightweight provider checks before new work starts.
            </span>
          </span>
          <input
            aria-label="Connection checks"
            checked={settings.connectionChecks}
            className="settings-checkbox"
            onChange={(event) => updateSetting("connectionChecks", event.target.checked)}
            type="checkbox"
          />
        </label>
      </section>

      <section className="settings-directory__panel">
        <div className="settings-provider-list">
          {providers.map((provider, index) => (
            <section className="settings-provider-card" key={provider.id}>
              <div className="settings-provider-card__header">
                <div className="settings-provider-card__title">
                  <strong>{provider.name || "Untitled Provider"}</strong>
                  <span>{providerRuntimeLabel(provider)}</span>
                </div>
                <div className="settings-panel__summary">
                  <StatusBadge tone="soft">
                    {provider.local ? "Local runtime" : "Remote provider"}
                  </StatusBadge>
                  <StatusBadge
                    data-testid="provider-status-badge"
                    tone={provider.enabled ? "accent" : "warning"}
                  >
                    {provider.enabled ? "Enabled" : "Disabled"}
                  </StatusBadge>
                </div>
              </div>

              <div className="settings-form-grid">
                <label className="settings-form-field">
                  <span className="settings-form-field__label">Provider name</span>
                  <input
                    aria-label="Provider name"
                    className="settings-input"
                    onChange={(event) => updateProvider(index, "name", event.target.value)}
                    value={provider.name}
                  />
                </label>

                <label className="settings-form-field">
                  <span className="settings-form-field__label">Provider model</span>
                  <input
                    aria-label="Provider model"
                    className="settings-input"
                    onChange={(event) => updateProvider(index, "model", event.target.value)}
                    value={provider.model}
                  />
                </label>

                <label className="settings-form-field settings-form-field--full">
                  <span className="settings-form-field__label">Provider base URL</span>
                  <input
                    aria-label="Provider base URL"
                    className="settings-input"
                    onChange={(event) => updateProvider(index, "baseUrl", event.target.value)}
                    value={provider.baseUrl}
                  />
                </label>

                <label className="settings-form-field settings-form-field--full">
                  <span className="settings-form-field__label">Provider API Key</span>
                  <input
                    aria-label="Provider API Key"
                    className="settings-input"
                    onChange={(event) => updateProvider(index, "apiKey", event.target.value)}
                    type="password"
                    value={provider.apiKey}
                  />
                </label>
              </div>

              <label className="settings-toggle-row">
                <span className="settings-form-field__copy">
                  <strong>Enabled</strong>
                  <span className="settings-form-field__hint">
                    Disabled providers stay saved but are skipped for new work.
                  </span>
                </span>
                <input
                  aria-label={`Enable ${provider.name}`}
                  checked={provider.enabled}
                  className="settings-checkbox"
                  onChange={(event) => updateProvider(index, "enabled", event.target.checked)}
                  type="checkbox"
                />
              </label>
            </section>
          ))}
        </div>

        <div className="settings-panel__footer">
          <button
            className="settings-button settings-button--accent"
            disabled={(!providersDirty && !providerScopeDirty) || isSavingProviders}
            onClick={() => void handleSaveProviders()}
            type="button"
          >
            {isSavingProviders ? "Saving..." : "Save Provider Changes"}
          </button>
        </div>
      </section>
    </>
  );

  const renderShortcutsSection = () => (
    <>
      {renderSectionHeader(
        "Shortcuts",
        "Keep the common bindings visible without turning settings into a keymap editor.",
      )}

      <section className="settings-directory__panel">
        <div className="settings-shortcuts__header">
          <h2>Common shortcuts</h2>
          <button
            className="settings-button"
            onClick={() => setShortcutPreferences(DEFAULT_SHORTCUT_PREFERENCES)}
            type="button"
          >
            Restore defaults
          </button>
        </div>

        <div className="settings-shortcuts__list">
          {SHORTCUT_ROWS.map((shortcut) => (
            <div className="settings-shortcut-row" key={shortcut.action}>
              <span>{shortcut.action}</span>
              <strong>{shortcut.shortcut}</strong>
            </div>
          ))}
        </div>

        <label className="settings-toggle-row">
          <span className="settings-form-field__copy">
            <strong>Enable global shortcuts</strong>
            <span className="settings-form-field__hint">
              Keep the common app bindings available when the window is focused.
            </span>
          </span>
          <input
            aria-label="Enable global shortcuts"
            checked={shortcutPreferences.globalShortcuts}
            className="settings-checkbox"
            onChange={(event) =>
              setShortcutPreferences({
                globalShortcuts: event.target.checked,
              })
            }
            type="checkbox"
          />
        </label>
      </section>
    </>
  );

  const renderRuntimeSection = () => (
    <>
      {renderSectionHeader(
        "Runtime Controls",
        "Shape how the desktop app closes, stays resident, and surfaces notifications.",
      )}

      <section className="settings-directory__panel">
        <div className="settings-form-grid">
          <label className="settings-form-field">
            <span className="settings-form-field__label">Close behavior</span>
            <select
              aria-label="Close behavior"
              className="settings-select"
              onChange={(event) => updateSetting("closeBehavior", event.target.value)}
              value={settings.closeBehavior}
            >
              <option value="Minimize to tray">Minimize to tray</option>
              <option value="Quit app">Quit app</option>
            </select>
          </label>

          <label className="settings-form-field">
            <span className="settings-form-field__label">Logging</span>
            <select
              aria-label="Logging"
              className="settings-select"
              onChange={(event) => updateSetting("logging", event.target.value)}
              value={settings.logging}
            >
              <option value="Standard">Standard</option>
              <option value="Verbose">Verbose</option>
            </select>
          </label>
        </div>

        <label className="settings-toggle-row">
          <span className="settings-form-field__copy">
            <strong>Launch at login</strong>
            <span className="settings-form-field__hint">
              Restore the desktop shell when the operating system starts.
            </span>
          </span>
          <input
            aria-label="Launch at login"
            checked={settings.launchAtLogin}
            className="settings-checkbox"
            onChange={(event) => updateSetting("launchAtLogin", event.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="settings-toggle-row">
          <span className="settings-form-field__copy">
            <strong>Tray resident</strong>
            <span className="settings-form-field__hint">
              Keep the app available from the system tray after the main window closes.
            </span>
          </span>
          <input
            aria-label="Tray resident"
            checked={settings.trayResident}
            className="settings-checkbox"
            onChange={(event) => updateSetting("trayResident", event.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="settings-toggle-row">
          <span className="settings-form-field__copy">
            <strong>Background adapters</strong>
            <span className="settings-form-field__hint">
              Let longer-running adapters keep processing after the initiating page changes.
            </span>
          </span>
          <input
            aria-label="Background adapters"
            checked={settings.backgroundAdapters}
            className="settings-checkbox"
            onChange={(event) => updateSetting("backgroundAdapters", event.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="settings-toggle-row">
          <span className="settings-form-field__copy">
            <strong>Notifications</strong>
            <span className="settings-form-field__hint">
              Surface completion and warning events outside the focused page.
            </span>
          </span>
          <input
            aria-label="Notifications"
            checked={settings.notifications}
            className="settings-checkbox"
            onChange={(event) => updateSetting("notifications", event.target.checked)}
            type="checkbox"
          />
        </label>

        <div className="settings-panel__footer">
          <button
            className="settings-button settings-button--accent"
            disabled={!runtimeDirty || isSavingRuntime}
            onClick={() => void handleSaveSettings(setIsSavingRuntime)}
            type="button"
          >
            {isSavingRuntime ? "Saving..." : "Save Runtime"}
          </button>
        </div>
      </section>
    </>
  );

  return (
    <div className="page-layout settings-page">
      <div className="page-layout__body settings-page__body">
        <aside
          aria-label="Settings section navigation"
          className="settings-directory"
          data-testid="settings-section-nav"
        >
          <div className="settings-directory__nav">
            {SECTION_DEFINITIONS.map((section) => {
              const isActive = section.id === activeSection;

              return (
                <button
                  aria-pressed={isActive}
                  className={`settings-directory__nav-item${isActive ? " is-active" : ""}`}
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  type="button"
                >
                  <span className="settings-directory__nav-label">{section.label}</span>
                  <span className="settings-directory__nav-summary">{section.summary}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section
          aria-label="Settings control surface"
          className="settings-main settings-directory__content"
          data-testid="settings-control-surface"
        >
          {error ? <div className="settings-inline-error">{error}</div> : null}
          {!isLoaded ? <div className="settings-loading-state">Loading local settings...</div> : null}

          {isLoaded && activeSection === "general" ? renderGeneralSection() : null}
          {isLoaded && activeSection === "appearance" ? renderAppearanceSection() : null}
          {isLoaded && activeSection === "providers" ? renderProvidersSection() : null}
          {isLoaded && activeSection === "shortcuts" ? renderShortcutsSection() : null}
          {isLoaded && activeSection === "runtime" ? renderRuntimeSection() : null}
        </section>
      </div>
    </div>
  );
}
