import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";

type SettingsSectionId = "appearance" | "providers" | "runtime";

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

type ProviderRecord = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  local: boolean;
  enabled: boolean;
};

type SettingsSectionDefinition = {
  id: SettingsSectionId;
  label: string;
  summary: string;
  guide: string;
};

const SECTION_DEFINITIONS: SettingsSectionDefinition[] = [
  {
    id: "appearance",
    label: "Appearance",
    summary: "Fonts, density, and language defaults for the shell.",
    guide:
      "Appearance controls the baseline reading rhythm, voice, and window chrome used across every page.",
  },
  {
    id: "providers",
    label: "Providers",
    summary: "Manage fallback policy and saved model endpoints.",
    guide:
      "Providers define which runtimes Nuka can reach, which model acts as fallback, and whether connection checks stay active.",
  },
  {
    id: "runtime",
    label: "Runtime",
    summary: "Desktop lifecycle, tray behavior, and background services.",
    guide:
      "Runtime keeps the desktop shell responsive while longer-lived tasks continue safely.",
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

const APPEARANCE_FIELDS: Array<keyof SettingsPayload> = [
  "interfaceFont",
  "messageFont",
  "textSize",
  "language",
  "responseLocale",
  "timeFormat",
  "density",
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
    useState<SettingsSectionId>("appearance");
  const [settings, setSettings] = useState<SettingsPayload>(EMPTY_SETTINGS);
  const [initialSettings, setInitialSettings] =
    useState<SettingsPayload>(EMPTY_SETTINGS);
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [initialProviders, setInitialProviders] = useState<ProviderRecord[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSavingAppearance, setIsSavingAppearance] = useState(false);
  const [isSavingProviders, setIsSavingProviders] = useState(false);
  const [isSavingRuntime, setIsSavingRuntime] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void Promise.all([
      invoke<ProviderRecord[]>("list_providers"),
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

        const savedProvider = await invoke<ProviderRecord>("save_provider", {
          provider,
        });
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

  return (
    <div className="page-layout settings-page">
      <SectionHeader
        meta="Providers, shell defaults, and runtime policy"
        status="Local Settings"
        tag="Settings"
        title="Application Settings"
      />

      <div className="page-layout__body">
        <div
          className="page-layout__main settings-main"
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "minmax(14rem, 16rem) minmax(0, 1fr)",
          }}
        >
          <aside
            aria-label="Settings section navigation"
            data-testid="settings-section-nav"
            style={{ display: "grid", gap: "0.85rem", alignContent: "start" }}
          >
            {SECTION_DEFINITIONS.map((section) => {
              const isActive = section.id === activeSection;

              return (
                <section
                  className={`settings-panel${isActive ? " is-active" : ""}`}
                  key={section.id}
                >
                  <div className="settings-panel__top">
                    <button
                      className="settings-panel__trigger"
                      onClick={() => setActiveSection(section.id)}
                      type="button"
                    >
                      <div className="settings-panel__copy">
                        <h2>{section.label}</h2>
                        <p>{section.summary}</p>
                      </div>
                    </button>
                    <StatusBadge tone={isActive ? "accent" : "soft"}>
                      {isActive ? "Open" : "View"}
                    </StatusBadge>
                  </div>
                </section>
              );
            })}
          </aside>

          <section
            aria-label="Settings control surface"
            data-testid="settings-control-surface"
            style={{ display: "grid", gap: "1rem", alignContent: "start" }}
          >
            <Card
              description={activeDefinition.summary}
              title={activeDefinition.label}
              tone="accent"
            >
              <div
                className="settings-panel__actions"
                style={{ marginTop: "1rem", justifyContent: "space-between" }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  <StatusBadge tone="soft">{providers.length} configured</StatusBadge>
                  <StatusBadge tone="soft">
                    {settings.defaultProviderId || "No default provider"}
                  </StatusBadge>
                </div>
                <button
                  className="settings-button settings-button--accent"
                  onClick={handleAddProvider}
                  type="button"
                >
                  + Add Provider
                </button>
              </div>
            </Card>

            {error ? <Card description={error} title="Settings Error" tone="soft" /> : null}
            {!isLoaded ? <Card description="Loading local settings..." title="Working" /> : null}

            {isLoaded && activeSection === "appearance" ? (
              <Card
                description="Set the reading tone, language, and shell density for the desktop client."
                title="Appearance Defaults"
                tone="soft"
              >
                <div className="settings-option-grid">
                  <div className="settings-form-grid">
                    <label className="settings-form-field">
                      <span className="settings-form-field__label">Interface Font</span>
                      <select
                        aria-label="Interface Font"
                        className="settings-select"
                        onChange={(event) =>
                          updateSetting("interfaceFont", event.target.value)
                        }
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
                        onChange={(event) =>
                          updateSetting("messageFont", event.target.value)
                        }
                        value={settings.messageFont}
                      >
                        <option value="Inter Text">Inter Text</option>
                        <option value="IBM Plex Sans">IBM Plex Sans</option>
                        <option value="Geist">Geist</option>
                      </select>
                    </label>

                    <label className="settings-form-field">
                      <span className="settings-form-field__label">Language</span>
                      <select
                        aria-label="Language"
                        className="settings-select"
                        onChange={(event) => updateSetting("language", event.target.value)}
                        value={settings.language}
                      >
                        <option value="English (US)">English (US)</option>
                        <option value="Chinese (Simplified)">
                          Chinese (Simplified)
                        </option>
                        <option value="Japanese">Japanese</option>
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

                    <label className="settings-form-field">
                      <span className="settings-form-field__label">Window Chrome</span>
                      <select
                        aria-label="Window Chrome"
                        className="settings-select"
                        onChange={(event) =>
                          updateSetting("windowChrome", event.target.value)
                        }
                        value={settings.windowChrome}
                      >
                        <option value="Minimal glass">Minimal glass</option>
                        <option value="System native">System native</option>
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
                </div>
              </Card>
            ) : null}

            {isLoaded && activeSection === "providers" ? (
              <Card
                description="Choose default routing and maintain every model endpoint from one surface. Chat, Workflow, and agent drafts stay blocked until a default provider is configured here."
                title="Provider Registry"
                tone="soft"
              >
                <div className="settings-option-grid">
                  <div className="settings-form-grid">
                    <label className="settings-form-field">
                      <span className="settings-form-field__label">Default Provider</span>
                      <select
                        aria-label="Default Provider"
                        className="settings-select"
                        onChange={(event) =>
                          updateSetting("defaultProviderId", event.target.value)
                        }
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
                        onChange={(event) =>
                          updateSetting("fallbackProviderId", event.target.value)
                        }
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
                              onChange={(event) =>
                                updateProvider(index, "name", event.target.value)
                              }
                              value={provider.name}
                            />
                          </label>

                          <label className="settings-form-field">
                            <span className="settings-form-field__label">Model</span>
                            <input
                              aria-label="Provider model"
                              className="settings-input"
                              onChange={(event) =>
                                updateProvider(index, "model", event.target.value)
                              }
                              value={provider.model}
                            />
                          </label>

                          <label className="settings-form-field settings-form-field--full">
                            <span className="settings-form-field__label">Base URL</span>
                            <input
                              aria-label="Provider base URL"
                              className="settings-input"
                              onChange={(event) =>
                                updateProvider(index, "baseUrl", event.target.value)
                              }
                              value={provider.baseUrl}
                            />
                          </label>

                          <label className="settings-form-field settings-form-field--full">
                            <span className="settings-form-field__label">API Key</span>
                            <input
                              aria-label="Provider API Key"
                              className="settings-input"
                              onChange={(event) =>
                                updateProvider(index, "apiKey", event.target.value)
                              }
                              type="password"
                              value={provider.apiKey}
                            />
                          </label>
                        </div>

                        <label className="settings-toggle-row">
                          <span className="settings-form-field__copy">
                            <strong>Enabled</strong>
                            <span className="settings-form-field__hint">
                              Disabled providers stay in the registry but are not selected for new work.
                            </span>
                          </span>
                          <input
                            aria-label={`Enable ${provider.name}`}
                            checked={provider.enabled}
                            className="settings-checkbox"
                            onChange={(event) =>
                              updateProvider(index, "enabled", event.target.checked)
                            }
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
                </div>
              </Card>
            ) : null}

            {isLoaded && activeSection === "runtime" ? (
              <Card
                description="Shape how the desktop app stays alive, surfaces notifications, and closes."
                title="Runtime Controls"
                tone="soft"
              >
                <div className="settings-option-grid">
                  <div className="settings-form-grid">
                    <label className="settings-form-field">
                      <span className="settings-form-field__label">Close behavior</span>
                      <select
                        aria-label="Close behavior"
                        className="settings-select"
                        onChange={(event) =>
                          updateSetting("closeBehavior", event.target.value)
                        }
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
                      onChange={(event) =>
                        updateSetting("launchAtLogin", event.target.checked)
                      }
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
                      onChange={(event) =>
                        updateSetting("trayResident", event.target.checked)
                      }
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
                      onChange={(event) =>
                        updateSetting("backgroundAdapters", event.target.checked)
                      }
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
                      onChange={(event) =>
                        updateSetting("notifications", event.target.checked)
                      }
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
                </div>
              </Card>
            ) : null}
          </section>
        </div>

        <div data-testid="settings-context-guide">
          <Inspector
            description="Context for the active settings section and its effect on the desktop shell."
            title="Section Guide"
          >
            <Card
              description={activeDefinition.summary}
              title={activeDefinition.label}
              tone="accent"
            />
            <Card description={activeDefinition.guide} title="Why It Matters" tone="soft" />
            <Card
              description="Settings remain local-first and should not alter page-level workflow unless explicitly saved."
              title="Guardrail"
              tone="soft"
            />
          </Inspector>
        </div>
      </div>
    </div>
  );
}
