import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FlatSelect } from "@/components/ui/FlatSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RUNTIME_STATUS_REFRESH_EVENT } from "@/hooks/useAppRuntimeStatus";
import { type DesktopLocale, useI18n } from "@/lib/i18n";
import {
  clearProviderSecret,
  importProviderFromEnv,
  listProviders,
  saveProvider,
  type ProviderRecord,
} from "@/lib/providers";
import { emitToast } from "@/lib/toast";

type SettingsSectionId =
  | "providers"
  | "runtime"
  | "appearance";

type SettingsPayload = {
  defaultProviderId: string;
  fallbackProviderId: string;
  connectionChecks: boolean;
  externalEditorPath: string;
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
};

const SECTION_DEFINITIONS: SettingsSectionDefinition[] = [
  {
    id: "providers",
  },
  {
    id: "runtime",
  },
  {
    id: "appearance",
  },
];

const EMPTY_SETTINGS: SettingsPayload = {
  defaultProviderId: "",
  fallbackProviderId: "",
  connectionChecks: true,
  externalEditorPath: "",
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

const RUNTIME_FIELDS: Array<keyof SettingsPayload> = [
  "externalEditorPath",
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

function toErrorMessage(caughtError: unknown) {
  return caughtError instanceof Error ? caughtError.message : String(caughtError);
}

function requestRuntimeStatusRefresh() {
  window.dispatchEvent(new CustomEvent(RUNTIME_STATUS_REFRESH_EVENT));
}

export function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
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
        setIsLoaded(true);
      })
      .catch((caughtError) => {
        if (!alive) {
          return;
        }

        emitToast({
          message: toErrorMessage(caughtError),
          tone: "error",
        });
        setIsLoaded(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  const activeDefinition = SECTION_DEFINITIONS.find((section) => section.id === activeSection) ??
    SECTION_DEFINITIONS[0];
  const activeSectionLabel = activeDefinition
    ? t(`settings.nav.${activeDefinition.id}` as const)
    : t("settings.nav.providers");

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
  const providerNameById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider.name || provider.id])),
    [providers],
  );
  const defaultProviderLabel = settings.defaultProviderId
    ? providerNameById.get(settings.defaultProviderId) ?? settings.defaultProviderId
    : "No default";
  const fallbackProviderLabel = settings.fallbackProviderId
    ? providerNameById.get(settings.fallbackProviderId) ?? settings.fallbackProviderId
    : "No fallback";

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

    try {
      const saved = await invoke<SettingsPayload>("save_settings", {
        payload: settings,
      });
      setSettings(saved);
      setInitialSettings(saved);
      requestRuntimeStatusRefresh();
      emitToast({
        message: t("settings.toast.runtimeSaved"),
        tone: "success",
      });
    } catch (caughtError) {
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProviders = async () => {
    setIsSavingProviders(true);

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
      requestRuntimeStatusRefresh();
      emitToast({
        message: t("settings.toast.providersSaved"),
        tone: "success",
      });
    } catch (caughtError) {
      setProviders(nextProviders);
      setInitialProviders(nextInitialProviders);
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
    } finally {
      setIsSavingProviders(false);
    }
  };

  const handleImportProviderFromEnv = async () => {
    setIsSavingProviders(true);

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
      emitToast({
        message: t("settings.toast.providerImported", { value: imported.name }),
        tone: "success",
      });
    } catch (caughtError) {
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
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

    try {
      const clearedProvider = await clearProviderSecret(provider.id);
      setProviders((current) =>
        current.map((item, itemIndex) => (itemIndex === index ? clearedProvider : item)),
      );
      setInitialProviders((current) =>
        current.map((item, itemIndex) => (itemIndex === index ? clearedProvider : item)),
      );
      emitToast({
        message: t("settings.toast.secretCleared", { value: clearedProvider.name }),
        tone: "success",
      });
    } catch (caughtError) {
      emitToast({
        message: toErrorMessage(caughtError),
        tone: "error",
      });
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
        <span className="settings-directory__eyebrow">{activeSectionLabel}</span>
        <h1>{title}</h1>
      </div>
      {actions ? <div className="settings-directory__header-actions">{actions}</div> : null}
    </header>
  );

  const renderProvidersSection = () => (
    <>
      {renderSectionHeader(
        t("settings.providers.title"),
        <div className="settings-panel__actions">
          <button
            className="settings-button"
            disabled={isSavingProviders}
            onClick={() => void handleImportProviderFromEnv()}
            type="button"
          >
            {t("settings.providers.import")}
          </button>
          <button
            className="settings-button settings-button--accent"
            onClick={handleAddProvider}
            type="button"
          >
            {t("settings.providers.add")}
          </button>
        </div>,
      )}

      <section className="settings-directory__panel">
        <div
          className="settings-panel__summary"
          data-testid="settings-provider-routing-summary"
        >
          <StatusBadge tone="soft">
            {t("settings.providers.summary.default", { value: defaultProviderLabel })}
          </StatusBadge>
          <StatusBadge tone="soft">
            {t("settings.providers.summary.fallback", { value: fallbackProviderLabel })}
          </StatusBadge>
          <StatusBadge tone={settings.connectionChecks ? "accent" : "warning"}>
            {settings.connectionChecks
              ? t("settings.providers.summary.checks.on")
              : t("settings.providers.summary.checks.off")}
          </StatusBadge>
        </div>

        <div className="settings-form-grid">
          <label className="settings-form-field">
            <span className="settings-form-field__label">{t("settings.providers.default.label")}</span>
            <FlatSelect
              aria-label={t("settings.providers.default.label")}
              className="settings-select"
              onChange={(event) => updateSetting("defaultProviderId", event.target.value)}
              shellClassName="settings-select-shell"
              value={settings.defaultProviderId}
            >
              <option value="">{t("settings.providers.default.none")}</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </FlatSelect>
          </label>

          <label className="settings-form-field">
            <span className="settings-form-field__label">{t("settings.providers.fallback.label")}</span>
            <FlatSelect
              aria-label={t("settings.providers.fallback.label")}
              className="settings-select"
              onChange={(event) => updateSetting("fallbackProviderId", event.target.value)}
              shellClassName="settings-select-shell"
              value={settings.fallbackProviderId}
            >
              <option value="">{t("settings.providers.fallback.none")}</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </FlatSelect>
          </label>
        </div>

        <label className="settings-toggle-row">
          <span className="settings-form-field__copy">
            <strong>{t("settings.providers.connectionChecks")}</strong>
          </span>
          <input
            aria-label={t("settings.providers.connectionChecks")}
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
                  <strong>{provider.name || t("settings.providers.card.untitled")}</strong>
                </div>
                <div className="settings-panel__summary">
                  <StatusBadge tone="soft">
                    {provider.local
                      ? t("settings.providers.card.local")
                      : t("settings.providers.card.remote")}
                  </StatusBadge>
                  <StatusBadge
                    data-testid="provider-status-badge"
                    tone={provider.enabled ? "accent" : "warning"}
                  >
                    {provider.enabled
                      ? t("settings.providers.card.enabled")
                      : t("settings.providers.card.disabled")}
                  </StatusBadge>
                </div>
              </div>

              <div className="settings-form-grid">
                <label className="settings-form-field">
                  <span className="settings-form-field__label">{t("settings.providers.field.name")}</span>
                  <input
                    aria-label={t("settings.providers.field.name")}
                    className="settings-input"
                    onChange={(event) => updateProvider(index, "name", event.target.value)}
                    value={provider.name}
                  />
                </label>

                <label className="settings-form-field">
                  <span className="settings-form-field__label">{t("settings.providers.field.model")}</span>
                  <input
                    aria-label={t("settings.providers.field.model")}
                    className="settings-input"
                    onChange={(event) => updateProvider(index, "model", event.target.value)}
                    value={provider.model}
                  />
                </label>

                <label className="settings-form-field settings-form-field--full">
                  <span className="settings-form-field__label">{t("settings.providers.field.baseUrl")}</span>
                  <input
                    aria-label={t("settings.providers.field.baseUrl")}
                    className="settings-input"
                    onChange={(event) => updateProvider(index, "baseUrl", event.target.value)}
                    value={provider.baseUrl}
                  />
                </label>

                <label className="settings-form-field settings-form-field--full">
                  <span className="settings-form-field__label">{t("settings.providers.field.apiKey")}</span>
                  <input
                    aria-label={t("settings.providers.field.apiKey")}
                    className="settings-input"
                    onChange={(event) => updateProvider(index, "apiKey", event.target.value)}
                    placeholder={provider.hasSecret
                      ? t("settings.providers.field.secret.replace")
                      : t("settings.providers.field.secret.paste")}
                    type="password"
                    value={provider.apiKey}
                  />
                  <div className="settings-form-field__meta">
                    <span>
                      {provider.hasSecret
                        ? t("settings.providers.field.secret.saved")
                        : t("settings.providers.field.secret.empty")}
                    </span>
                    {provider.hasSecret ? (
                      <span>{t("settings.providers.field.secret.replace")}</span>
                    ) : null}
                    {provider.hasSecret ? (
                      <button
                        className="settings-button"
                        disabled={isSavingProviders}
                        onClick={() => void handleClearProviderSecret(index)}
                        type="button"
                      >
                        {t("settings.providers.field.secret.clear")}
                      </button>
                    ) : null}
                  </div>
                </label>
              </div>

              <label className="settings-toggle-row">
                <span className="settings-form-field__copy">
                  <strong>{t("settings.providers.card.enabled")}</strong>
                </span>
                <input
                  aria-label={`${t("settings.providers.card.enabled")} ${provider.name}`}
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
            {isSavingProviders ? "Saving..." : t("settings.providers.save")}
          </button>
        </div>
      </section>
    </>
  );

  const renderRuntimeSection = () => (
    <>
      {renderSectionHeader(t("settings.runtime.title"))}

      <section className="settings-directory__panel">
        <div className="settings-form-grid">
          <label className="settings-form-field settings-form-field--full">
            <span className="settings-form-field__label">{t("settings.runtime.field.externalEditorPath")}</span>
            <input
              aria-label={t("settings.runtime.field.externalEditorPath")}
              className="settings-input"
              onChange={(event) => updateSetting("externalEditorPath", event.target.value)}
              placeholder={t("settings.runtime.field.externalEditorPath.placeholder")}
              value={settings.externalEditorPath}
            />
          </label>

          <label className="settings-form-field">
            <span className="settings-form-field__label">{t("settings.runtime.field.closeBehavior")}</span>
            <FlatSelect
              aria-label={t("settings.runtime.field.closeBehavior")}
              className="settings-select"
              onChange={(event) => updateSetting("closeBehavior", event.target.value)}
              shellClassName="settings-select-shell"
              value={settings.closeBehavior}
            >
              <option value="Minimize to tray">{t("settings.runtime.field.closeBehavior.minimize")}</option>
              <option value="Quit app">{t("settings.runtime.field.closeBehavior.quit")}</option>
            </FlatSelect>
          </label>

          <label className="settings-form-field">
            <span className="settings-form-field__label">{t("settings.runtime.field.logging")}</span>
            <FlatSelect
              aria-label={t("settings.runtime.field.logging")}
              className="settings-select"
              onChange={(event) => updateSetting("logging", event.target.value)}
              shellClassName="settings-select-shell"
              value={settings.logging}
            >
              <option value="Standard">{t("settings.runtime.field.logging.standard")}</option>
              <option value="Verbose">{t("settings.runtime.field.logging.verbose")}</option>
            </FlatSelect>
          </label>
        </div>

        <label className="settings-toggle-row">
          <span className="settings-form-field__copy">
            <strong>{t("settings.runtime.toggle.launchAtLogin")}</strong>
          </span>
          <input
            aria-label={t("settings.runtime.toggle.launchAtLogin")}
            checked={settings.launchAtLogin}
            className="settings-checkbox"
            onChange={(event) => updateSetting("launchAtLogin", event.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="settings-toggle-row">
          <span className="settings-form-field__copy">
            <strong>{t("settings.runtime.toggle.trayResident")}</strong>
          </span>
          <input
            aria-label={t("settings.runtime.toggle.trayResident")}
            checked={settings.trayResident}
            className="settings-checkbox"
            onChange={(event) => updateSetting("trayResident", event.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="settings-toggle-row">
          <span className="settings-form-field__copy">
            <strong>{t("settings.runtime.toggle.backgroundAdapters")}</strong>
          </span>
          <input
            aria-label={t("settings.runtime.toggle.backgroundAdapters")}
            checked={settings.backgroundAdapters}
            className="settings-checkbox"
            onChange={(event) => updateSetting("backgroundAdapters", event.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="settings-toggle-row">
          <span className="settings-form-field__copy">
            <strong>{t("settings.runtime.toggle.notifications")}</strong>
          </span>
          <input
            aria-label={t("settings.runtime.toggle.notifications")}
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
            {isSavingRuntime ? "Saving..." : t("settings.runtime.save")}
          </button>
        </div>
      </section>
    </>
  );

  const renderAppearanceSection = () => (
    <>
      {renderSectionHeader(t("settings.appearance.title"))}

      <section className="settings-directory__panel">
        <div className="settings-form-grid">
          <label className="settings-form-field">
            <span className="settings-form-field__label">
              {t("settings.appearance.field.language")}
            </span>
            <FlatSelect
              aria-label={t("settings.appearance.field.language")}
              className="settings-select"
              onChange={(event) => {
                setLocale(event.target.value as DesktopLocale);
              }}
              shellClassName="settings-select-shell"
              value={locale}
            >
              <option value="zh-CN">{t("settings.appearance.option.zh-CN")}</option>
              <option value="en-US">{t("settings.appearance.option.en-US")}</option>
            </FlatSelect>
          </label>
        </div>
      </section>
    </>
  );

  return (
    <div className="page-layout settings-page">
      <div className="page-layout__body settings-page__body">
        <aside
          aria-label={t("settings.surface.navigation")}
          className="settings-directory"
          data-testid="settings-section-nav"
        >
          <div className="settings-directory__nav">
            {SECTION_DEFINITIONS.map((section) => {
              const isActive = section.id === activeSection;
              const sectionLabel = t(`settings.nav.${section.id}` as const);

              return (
                <button
                  aria-pressed={isActive}
                  className={`settings-directory__nav-item${isActive ? " is-active" : ""}`}
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  type="button"
                >
                  <span className="settings-directory__nav-label">{sectionLabel}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section
          aria-label={t("settings.surface.controls")}
          className="settings-main settings-directory__content"
          data-testid="settings-control-surface"
        >
          {!isLoaded ? <div className="settings-loading-state">{t("settings.loading")}</div> : null}

          {isLoaded && activeSection === "providers" ? renderProvidersSection() : null}
          {isLoaded && activeSection === "runtime" ? renderRuntimeSection() : null}
          {isLoaded && activeSection === "appearance" ? renderAppearanceSection() : null}
        </section>
      </div>
    </div>
  );
}
