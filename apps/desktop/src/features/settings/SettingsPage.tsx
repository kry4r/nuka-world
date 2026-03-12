import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  clearProviderSecret,
  importProviderFromEnv,
  listProviders,
  saveProvider,
  type ProviderRecord,
} from "@/lib/providers";

type SettingsSectionId =
  | "providers"
  | "runtime";

type SettingsPayload = {
  defaultProviderId: string;
  fallbackProviderId: string;
  connectionChecks: boolean;
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
};

const SECTION_DEFINITIONS: SettingsSectionDefinition[] = [
  {
    id: "providers",
    label: "Providers",
  },
  {
    id: "runtime",
    label: "Runtime",
  },
];

const EMPTY_SETTINGS: SettingsPayload = {
  defaultProviderId: "",
  fallbackProviderId: "",
  connectionChecks: true,
  closeBehavior: "Minimize to tray",
  launchAtLogin: false,
  trayResident: true,
  backgroundAdapters: true,
  logging: "Standard",
  notifications: true,
};

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
    hasSecret: false,
    secretUpdatedAt: null,
    local: false,
    enabled: false,
  };
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
    left.hasSecret === right.hasSecret &&
    left.secretUpdatedAt === right.secretUpdatedAt &&
    left.local === right.local &&
    left.enabled === right.enabled
  );
}

export function SettingsPage() {
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("providers");
  const [settings, setSettings] = useState<SettingsPayload>(EMPTY_SETTINGS);
  const [initialSettings, setInitialSettings] =
    useState<SettingsPayload>(EMPTY_SETTINGS);
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [initialProviders, setInitialProviders] = useState<ProviderRecord[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
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

  const handleClearProviderSecret = async (index: number) => {
    const provider = providers[index];
    if (!provider) {
      return;
    }

    setIsSavingProviders(true);
    setError(null);

    try {
      const clearedProvider = await clearProviderSecret(provider.id);
      setProviders((current) =>
        current.map((item, itemIndex) => (itemIndex === index ? clearedProvider : item)),
      );
      setInitialProviders((current) =>
        current.map((item, itemIndex) => (itemIndex === index ? clearedProvider : item)),
      );
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
    actions?: ReactNode,
  ) => (
    <header className="settings-directory__header">
      <div className="settings-directory__header-copy">
        <span className="settings-directory__eyebrow">{activeDefinition.label}</span>
        <h1>{title}</h1>
      </div>
      {actions ? <div className="settings-directory__header-actions">{actions}</div> : null}
    </header>
  );

  const renderProvidersSection = () => (
    <>
      {renderSectionHeader(
        "Providers",
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
                    placeholder={provider.hasSecret ? "Replace secret" : "Paste API key"}
                    type="password"
                    value={provider.apiKey}
                  />
                  <div className="settings-form-field__meta">
                    <span>{provider.hasSecret ? "Secret saved" : "No secret saved"}</span>
                    {provider.hasSecret ? <span>Replace secret</span> : null}
                    {provider.hasSecret ? (
                      <button
                        className="settings-button"
                        disabled={isSavingProviders}
                        onClick={() => void handleClearProviderSecret(index)}
                        type="button"
                      >
                        Clear secret
                      </button>
                    ) : null}
                  </div>
                </label>
              </div>

              <label className="settings-toggle-row">
                <span className="settings-form-field__copy">
                  <strong>Enabled</strong>
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

  const renderRuntimeSection = () => (
    <>
      {renderSectionHeader("Runtime")}

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

          {isLoaded && activeSection === "providers" ? renderProvidersSection() : null}
          {isLoaded && activeSection === "runtime" ? renderRuntimeSection() : null}
        </section>
      </div>
    </div>
  );
}
