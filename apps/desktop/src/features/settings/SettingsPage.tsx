import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

type ProviderRegistryResponse = {
  count: number;
  names: string[];
};

type SettingsSectionKey = "providers" | "appearance" | "runtime";

type SectionGuide = {
  focused: string;
  appliesTo: string;
  whatYouEdit: string;
  recommendedDefault: string;
};

type ProviderEntry = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  local: boolean;
  enabled: boolean;
};

type ProviderSettings = {
  providers: ProviderEntry[];
  defaultProviderId: string;
  fallbackProviderId: string;
  connectionChecks: boolean;
};

type AppearanceSettings = {
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
};

type RuntimeSettings = {
  closeBehavior: string;
  launchAtLogin: boolean;
  trayResident: boolean;
  backgroundAdapters: boolean;
  logging: string;
  notifications: boolean;
};

type SettingsSection = {
  key: SettingsSectionKey;
  title: string;
  description: string;
  summary: string[];
  guide: SectionGuide;
  dirty: boolean;
};

type SettingsActionButtonProps = {
  children: ReactNode;
  tone?: "default" | "accent" | "danger";
  disabled?: boolean;
  onClick?: () => void;
};

type SettingsFieldShellProps = {
  label: string;
  hint: string;
  children: ReactNode;
  full?: boolean;
};

type SettingsTextFieldProps = {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  full?: boolean;
};

type SettingsSelectFieldProps = {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  full?: boolean;
};

type SettingsToggleFieldProps = {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

type ProviderEditorProps = {
  settings: ProviderSettings;
  dirty: boolean;
  onAddProvider: () => void;
  onReset: () => void;
  onSave: () => void;
  onUpdate: (updater: (current: ProviderSettings) => ProviderSettings) => void;
};

type AppearanceEditorProps = {
  settings: AppearanceSettings;
  dirty: boolean;
  onReset: () => void;
  onSave: () => void;
  onUpdate: <Key extends keyof AppearanceSettings>(key: Key, value: AppearanceSettings[Key]) => void;
};

type RuntimeEditorProps = {
  settings: RuntimeSettings;
  dirty: boolean;
  onReset: () => void;
  onSave: () => void;
  onUpdate: <Key extends keyof RuntimeSettings>(key: Key, value: RuntimeSettings[Key]) => void;
};

const PROVIDER_STORAGE_KEY = "nuka.settings.providers";
const APPEARANCE_STORAGE_KEY = "nuka.settings.appearance";
const RUNTIME_STORAGE_KEY = "nuka.settings.runtime";
const DEFAULT_PROVIDER_NAMES = ["OpenAI", "Anthropic", "Ollama"];

const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
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
};

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  closeBehavior: "Minimize to tray",
  launchAtLogin: false,
  trayResident: true,
  backgroundAdapters: true,
  logging: "Standard",
  notifications: true,
};

const APPEARANCE_OPTIONS = {
  interfaceFont: ["Inter", "SF Pro Display", "IBM Plex Sans"],
  messageFont: ["Inter Text", "System UI", "IBM Plex Sans"],
  textSize: ["13 px", "14 px", "16 px"],
  language: ["English (US)", "简体中文", "日本語"],
  responseLocale: ["Follow session", "English (US)", "简体中文"],
  timeFormat: ["24-hour", "12-hour"],
  density: ["Compact", "Comfortable", "Relaxed"],
  motion: ["Reduced", "Standard", "Lively"],
  windowChrome: ["Minimal glass", "Native frame", "Hidden titlebar"],
  sidebarDefault: ["Expanded", "Collapsed"],
} as const;

const RUNTIME_OPTIONS = {
  closeBehavior: ["Minimize to tray", "Hide window", "Quit app"],
  logging: ["Quiet", "Standard", "Verbose"],
} as const;

function SettingsActionButton({ children, tone = "default", disabled, onClick }: SettingsActionButtonProps) {
  return (
    <button className={`settings-button settings-button--${tone}`} disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function SettingsChip({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "active" | "soft" | "warning";
}) {
  return <span className={`settings-chip settings-chip--${tone}`}>{children}</span>;
}

function SettingsFieldShell({ children, full, hint, label }: SettingsFieldShellProps) {
  return (
    <label className={`settings-form-field${full ? " settings-form-field--full" : ""}`}>
      <div className="settings-form-field__copy">
        <span className="settings-form-field__label">{label}</span>
        <span className="settings-form-field__hint">{hint}</span>
      </div>
      {children}
    </label>
  );
}

function SettingsTextField({ full, hint, label, onChange, placeholder, type = "text", value }: SettingsTextFieldProps) {
  return (
    <SettingsFieldShell full={full} hint={hint} label={label}>
      <input
        aria-label={label}
        className="settings-input"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </SettingsFieldShell>
  );
}

function SettingsSelectField({ full, hint, label, onChange, options, value }: SettingsSelectFieldProps) {
  return (
    <SettingsFieldShell full={full} hint={hint} label={label}>
      <select aria-label={label} className="settings-select" onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </SettingsFieldShell>
  );
}

function SettingsToggleField({ checked, hint, label, onChange }: SettingsToggleFieldProps) {
  return (
    <label className="settings-toggle-row">
      <div className="settings-form-field__copy">
        <span className="settings-form-field__label">{label}</span>
        <span className="settings-form-field__hint">{hint}</span>
      </div>
      <input aria-label={label} checked={checked} className="settings-checkbox" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function SettingsOptionCard({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return (
    <section className="settings-option-card">
      <div className="settings-option-card__header">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

function ProviderEditor({ dirty, onAddProvider, onReset, onSave, onUpdate, settings }: ProviderEditorProps) {
  const activeProviders = settings.providers.filter((provider) => provider.enabled);
  const providerOptions = activeProviders.map((provider) => provider.name || "Untitled provider");
  const defaultProviderName = settings.providers.find((provider) => provider.id === settings.defaultProviderId)?.name ?? providerOptions[0] ?? "Not configured";
  const fallbackProviderName = settings.providers.find((provider) => provider.id === settings.fallbackProviderId)?.name ?? providerOptions[1] ?? providerOptions[0] ?? "Add a fallback";

  return (
    <div className="settings-panel__body">
      <SettingsOptionCard description="Default routing, fallback behavior, and connection checks are editable here." title="Routing Defaults">
        <div className="settings-form-grid">
          <SettingsSelectField
            hint="Which provider chat, agents, and workflows prefer by default."
            label="Default provider"
            onChange={(value) =>
              onUpdate((current) => ({
                ...current,
                defaultProviderId:
                  current.providers.find((provider) => provider.name === value)?.id ?? current.defaultProviderId,
              }))
            }
            options={providerOptions}
            value={defaultProviderName}
          />
          <SettingsSelectField
            hint="Fallback kicks in when the primary provider is unavailable."
            label="Fallback provider"
            onChange={(value) =>
              onUpdate((current) => ({
                ...current,
                fallbackProviderId:
                  current.providers.find((provider) => provider.name === value)?.id ?? current.fallbackProviderId,
              }))
            }
            options={providerOptions}
            value={fallbackProviderName}
          />
        </div>
        <SettingsToggleField
          checked={settings.connectionChecks}
          hint="Validate keys, host reachability, and model availability before saving defaults."
          label="Connection checks"
          onChange={(checked) => onUpdate((current) => ({ ...current, connectionChecks: checked }))}
        />
      </SettingsOptionCard>

      <SettingsOptionCard description="Add, rename, and tune each provider entry without leaving Settings." title="Provider Entries">
        <div className="settings-provider-list">
          {settings.providers.map((provider, index) => (
            <section className="settings-provider-card" key={provider.id}>
              <div className="settings-provider-card__header">
                <div className="settings-provider-card__title">
                  <strong>{provider.name || `Provider ${index + 1}`}</strong>
                  <span>{provider.local ? "Local runtime" : "Remote provider"}</span>
                </div>
                <SettingsActionButton
                  onClick={() =>
                    onUpdate((current) => {
                      const providers = current.providers.filter((entry) => entry.id !== provider.id);
                      const nextDefault = providers.some((entry) => entry.id === current.defaultProviderId)
                        ? current.defaultProviderId
                        : providers[0]?.id ?? "";
                      const nextFallback = providers.some((entry) => entry.id === current.fallbackProviderId)
                        ? current.fallbackProviderId
                        : providers[1]?.id ?? providers[0]?.id ?? "";

                      return {
                        ...current,
                        providers,
                        defaultProviderId: nextDefault,
                        fallbackProviderId: nextFallback,
                      };
                    })
                  }
                  tone="danger"
                >
                  Remove
                </SettingsActionButton>
              </div>

              <div className="settings-form-grid">
                <SettingsTextField
                  hint="Friendly label shown in routing and summaries."
                  label="Provider name"
                  onChange={(value) =>
                    onUpdate((current) => ({
                      ...current,
                      providers: current.providers.map((entry) =>
                        entry.id === provider.id ? { ...entry, name: value } : entry,
                      ),
                    }))
                  }
                  value={provider.name}
                />
                <SettingsTextField
                  hint="Base endpoint used for requests and health checks."
                  label="Base URL"
                  onChange={(value) =>
                    onUpdate((current) => ({
                      ...current,
                      providers: current.providers.map((entry) =>
                        entry.id === provider.id ? { ...entry, baseUrl: value } : entry,
                      ),
                    }))
                  }
                  value={provider.baseUrl}
                />
                <SettingsTextField
                  hint="Preferred model or deployment name for this provider."
                  label="Default model"
                  onChange={(value) =>
                    onUpdate((current) => ({
                      ...current,
                      providers: current.providers.map((entry) =>
                        entry.id === provider.id ? { ...entry, model: value } : entry,
                      ),
                    }))
                  }
                  value={provider.model}
                />
                <SettingsTextField
                  hint="Stored locally in the browser layer for now; replace with secure storage later."
                  label="API key"
                  onChange={(value) =>
                    onUpdate((current) => ({
                      ...current,
                      providers: current.providers.map((entry) =>
                        entry.id === provider.id ? { ...entry, apiKey: value } : entry,
                      ),
                    }))
                  }
                  placeholder="sk-..."
                  type="password"
                  value={provider.apiKey}
                />
              </div>

              <div className="settings-provider-card__toggles">
                <SettingsToggleField
                  checked={provider.local}
                  hint="Marks this provider as a local runtime option."
                  label="Local runtime"
                  onChange={(checked) =>
                    onUpdate((current) => ({
                      ...current,
                      providers: current.providers.map((entry) =>
                        entry.id === provider.id ? { ...entry, local: checked } : entry,
                      ),
                    }))
                  }
                />
                <SettingsToggleField
                  checked={provider.enabled}
                  hint="Disabled providers stay visible but do not appear in routing defaults."
                  label="Enabled"
                  onChange={(checked) =>
                    onUpdate((current) => ({
                      ...current,
                      providers: current.providers.map((entry) =>
                        entry.id === provider.id ? { ...entry, enabled: checked } : entry,
                      ),
                    }))
                  }
                />
              </div>
            </section>
          ))}
        </div>
      </SettingsOptionCard>

      <div className="settings-panel__footer">
        <SettingsActionButton onClick={onAddProvider}>+ Add Provider</SettingsActionButton>
        <SettingsActionButton disabled={!dirty} onClick={onReset}>
          Reset Providers
        </SettingsActionButton>
        <SettingsActionButton disabled={!dirty} onClick={onSave} tone="accent">
          Save Provider Changes
        </SettingsActionButton>
      </div>
    </div>
  );
}

function AppearanceEditor({ dirty, onReset, onSave, onUpdate, settings }: AppearanceEditorProps) {
  return (
    <div className="settings-panel__body">
      <div className="settings-option-grid">
        <SettingsOptionCard description="Common typography settings for the shell, transcript, and inspector panels." title="Reading & Type">
          <div className="settings-form-grid">
            <SettingsSelectField
              hint="Used in navigation, cards, section headers, and buttons."
              label="Interface font"
              onChange={(value) => onUpdate("interfaceFont", value)}
              options={[...APPEARANCE_OPTIONS.interfaceFont]}
              value={settings.interfaceFont}
            />
            <SettingsSelectField
              hint="Used in message bubbles, notes, and generated content blocks."
              label="Message font"
              onChange={(value) => onUpdate("messageFont", value)}
              options={[...APPEARANCE_OPTIONS.messageFont]}
              value={settings.messageFont}
            />
            <SettingsSelectField
              hint="Base font size across the app shell and conversation view."
              label="Text size"
              onChange={(value) => onUpdate("textSize", value)}
              options={[...APPEARANCE_OPTIONS.textSize]}
              value={settings.textSize}
            />
          </div>
        </SettingsOptionCard>

        <SettingsOptionCard description="Language and locale defaults for the app chrome and generated output." title="Localization">
          <div className="settings-form-grid">
            <SettingsSelectField
              hint="Primary language for labels, actions, and system copy."
              label="Language"
              onChange={(value) => onUpdate("language", value)}
              options={[...APPEARANCE_OPTIONS.language]}
              value={settings.language}
            />
            <SettingsSelectField
              hint="Whether the model should follow the current session or a fixed locale."
              label="Response locale"
              onChange={(value) => onUpdate("responseLocale", value)}
              options={[...APPEARANCE_OPTIONS.responseLocale]}
              value={settings.responseLocale}
            />
            <SettingsSelectField
              hint="Controls timestamp formatting in chat, tasks, and logs."
              label="Time format"
              onChange={(value) => onUpdate("timeFormat", value)}
              options={[...APPEARANCE_OPTIONS.timeFormat]}
              value={settings.timeFormat}
            />
          </div>
        </SettingsOptionCard>

        <SettingsOptionCard description="Calibrate comfort, motion, and sidebar behavior for daily use." title="Window & Motion">
          <div className="settings-form-grid">
            <SettingsSelectField
              hint="Changes spacing and surface density across the app."
              label="Density"
              onChange={(value) => onUpdate("density", value)}
              options={[...APPEARANCE_OPTIONS.density]}
              value={settings.density}
            />
            <SettingsSelectField
              hint="Controls the intensity of transitions and panel motion."
              label="Motion"
              onChange={(value) => onUpdate("motion", value)}
              options={[...APPEARANCE_OPTIONS.motion]}
              value={settings.motion}
            />
            <SettingsSelectField
              hint="Desktop titlebar presentation for the Tauri shell."
              label="Window chrome"
              onChange={(value) => onUpdate("windowChrome", value)}
              options={[...APPEARANCE_OPTIONS.windowChrome]}
              value={settings.windowChrome}
            />
            <SettingsSelectField
              hint="Whether navigation should start expanded or collapsed."
              label="Sidebar default"
              onChange={(value) => onUpdate("sidebarDefault", value)}
              options={[...APPEARANCE_OPTIONS.sidebarDefault]}
              value={settings.sidebarDefault}
            />
          </div>
        </SettingsOptionCard>
      </div>

      <div className="settings-panel__footer">
        <SettingsActionButton disabled={!dirty} onClick={onReset}>
          Reset Appearance
        </SettingsActionButton>
        <SettingsActionButton disabled={!dirty} onClick={onSave} tone="accent">
          Save Appearance
        </SettingsActionButton>
      </div>
    </div>
  );
}

function RuntimeEditor({ dirty, onReset, onSave, onUpdate, settings }: RuntimeEditorProps) {
  return (
    <div className="settings-panel__body">
      <SettingsOptionCard description="Decide what the desktop shell does when the window closes or the user signs in." title="Shell Lifecycle">
        <div className="settings-form-grid">
          <SettingsSelectField
            hint="Controls whether close hides the app, minimizes to tray, or fully exits."
            label="Close behavior"
            onChange={(value) => onUpdate("closeBehavior", value)}
            options={[...RUNTIME_OPTIONS.closeBehavior]}
            value={settings.closeBehavior}
          />
        </div>
        <div className="settings-provider-card__toggles">
          <SettingsToggleField
            checked={settings.launchAtLogin}
            hint="Launch the Tauri shell automatically after login."
            label="Launch at login"
            onChange={(checked) => onUpdate("launchAtLogin", checked)}
          />
          <SettingsToggleField
            checked={settings.trayResident}
            hint="Keep the app alive in the tray when the main window hides."
            label="Tray resident"
            onChange={(checked) => onUpdate("trayResident", checked)}
          />
        </div>
      </SettingsOptionCard>

      <SettingsOptionCard description="Background services, diagnostics, and desktop prompts stay configurable here." title="Background Work">
        <div className="settings-provider-card__toggles">
          <SettingsToggleField
            checked={settings.backgroundAdapters}
            hint="Lets connectors and integrations keep running in the background."
            label="Background adapters"
            onChange={(checked) => onUpdate("backgroundAdapters", checked)}
          />
          <SettingsToggleField
            checked={settings.notifications}
            hint="Show lightweight desktop notifications for important events."
            label="Notifications"
            onChange={(checked) => onUpdate("notifications", checked)}
          />
        </div>
        <div className="settings-form-grid">
          <SettingsSelectField
            hint="Controls how much diagnostic data the UI stores locally."
            label="Logging"
            onChange={(value) => onUpdate("logging", value)}
            options={[...RUNTIME_OPTIONS.logging]}
            value={settings.logging}
          />
        </div>
      </SettingsOptionCard>

      <div className="settings-panel__footer">
        <SettingsActionButton disabled={!dirty} onClick={onReset}>
          Reset Runtime
        </SettingsActionButton>
        <SettingsActionButton disabled={!dirty} onClick={onSave} tone="accent">
          Save Runtime
        </SettingsActionButton>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [registry, setRegistry] = useState<ProviderRegistryResponse>({ count: DEFAULT_PROVIDER_NAMES.length, names: DEFAULT_PROVIDER_NAMES });
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("appearance");
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>(() => buildProviderSettings(DEFAULT_PROVIDER_NAMES));
  const [savedProviderSettings, setSavedProviderSettings] = useState<ProviderSettings>(() => buildProviderSettings(DEFAULT_PROVIDER_NAMES));
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettings>(() => readStoredState(APPEARANCE_STORAGE_KEY, DEFAULT_APPEARANCE_SETTINGS));
  const [savedAppearanceSettings, setSavedAppearanceSettings] = useState<AppearanceSettings>(() => readStoredState(APPEARANCE_STORAGE_KEY, DEFAULT_APPEARANCE_SETTINGS));
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(() => readStoredState(RUNTIME_STORAGE_KEY, DEFAULT_RUNTIME_SETTINGS));
  const [savedRuntimeSettings, setSavedRuntimeSettings] = useState<RuntimeSettings>(() => readStoredState(RUNTIME_STORAGE_KEY, DEFAULT_RUNTIME_SETTINGS));
  const [registryHydrated, setRegistryHydrated] = useState(false);

  useEffect(() => {
    let alive = true;

    void invoke<ProviderRegistryResponse>("provider_registry")
      .then((response) => {
        if (alive) {
          setRegistry(response);
        }
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (registryHydrated) {
      return;
    }

    const merged = mergeProviderSettings(
      readStoredState(PROVIDER_STORAGE_KEY, buildProviderSettings(registry.names.length > 0 ? registry.names : DEFAULT_PROVIDER_NAMES)),
      registry.names.length > 0 ? registry.names : DEFAULT_PROVIDER_NAMES,
    );

    setProviderSettings(merged);
    setSavedProviderSettings(merged);
    setRegistryHydrated(true);
  }, [registry.names, registryHydrated]);

  const providerDirty = useMemo(
    () => serializeState(providerSettings) !== serializeState(savedProviderSettings),
    [providerSettings, savedProviderSettings],
  );
  const appearanceDirty = useMemo(
    () => serializeState(appearanceSettings) !== serializeState(savedAppearanceSettings),
    [appearanceSettings, savedAppearanceSettings],
  );
  const runtimeDirty = useMemo(
    () => serializeState(runtimeSettings) !== serializeState(savedRuntimeSettings),
    [runtimeSettings, savedRuntimeSettings],
  );

  const providerSummary = useMemo(() => {
    const defaultProvider =
      providerSettings.providers.find((provider) => provider.id === providerSettings.defaultProviderId)?.name ??
      "Not configured";
    const fallbackProvider =
      providerSettings.providers.find((provider) => provider.id === providerSettings.fallbackProviderId)?.name ??
      "Add a fallback";

    return [
      `${providerSettings.providers.length} configured`,
      `${defaultProvider} default`,
      `${fallbackProvider} fallback`,
    ];
  }, [providerSettings]);

  const appearanceSummary = [
    appearanceSettings.interfaceFont,
    appearanceSettings.textSize,
    appearanceSettings.language,
    appearanceSettings.density,
  ];
  const runtimeSummary = [
    runtimeSettings.trayResident ? "Tray enabled" : "Tray off",
    runtimeSettings.launchAtLogin ? "Launch on" : "Launch off",
    runtimeSettings.backgroundAdapters ? "Adapters background" : "Adapters manual",
  ];

  const sections: SettingsSection[] = [
    {
      key: "providers",
      title: "Providers",
      description: "Model access, routing, and fallback behavior live here now.",
      summary: providerSummary,
      dirty: providerDirty,
      guide: {
        focused: "Providers connects chat, agents, workflows, and ingestion to the right model stack.",
        appliesTo: "Chat, Agents, Workflows, Knowledge ingestion.",
        whatYouEdit: "Keys, base URLs, defaults, routing, model checks, and fallbacks.",
        recommendedDefault: "Keep one primary provider and one fallback provider enabled.",
      },
    },
    {
      key: "appearance",
      title: "Appearance",
      description: "Typography, language, density, motion, and chrome defaults.",
      summary: appearanceSummary,
      dirty: appearanceDirty,
      guide: {
        focused: "Appearance shapes reading comfort, localization, and the overall desktop tone.",
        appliesTo: "Chat, workflow panes, sidebars, shared controls, and app chrome.",
        whatYouEdit: "Fonts, text size, language, density, window chrome, motion, and sidebar defaults.",
        recommendedDefault: "Use Inter, 14 px text, English (US), and comfortable density.",
      },
    },
    {
      key: "runtime",
      title: "Runtime",
      description: "Tray behavior, startup policy, adapters, and diagnostics.",
      summary: runtimeSummary,
      dirty: runtimeDirty,
      guide: {
        focused: "Runtime keeps the desktop shell responsive while longer-lived tasks continue safely.",
        appliesTo: "Tray behavior, startup lifecycle, background connectors, and local diagnostics.",
        whatYouEdit: "Close policy, startup behavior, tray residency, background adapters, and logging.",
        recommendedDefault: "Enable tray residency, keep launch at login off, and keep logging concise.",
      },
    },
  ];

  const activeSectionConfig = sections.find((section) => section.key === activeSection) ?? sections[1];

  const handleAddProvider = () => {
    setActiveSection("providers");
    setProviderSettings((current) => {
      const nextIndex = current.providers.length + 1;
      const nextProvider = {
        id: `provider-draft-${nextIndex}`,
        name: `New Provider ${nextIndex}`,
        baseUrl: "",
        model: "",
        apiKey: "",
        local: false,
        enabled: true,
      } satisfies ProviderEntry;

      return {
        ...current,
        providers: [...current.providers, nextProvider],
      };
    });
  };

  const saveProviders = () => {
    writeStoredState(PROVIDER_STORAGE_KEY, providerSettings);
    setSavedProviderSettings(providerSettings);
  };

  const saveAppearance = () => {
    writeStoredState(APPEARANCE_STORAGE_KEY, appearanceSettings);
    setSavedAppearanceSettings(appearanceSettings);
  };

  const saveRuntime = () => {
    writeStoredState(RUNTIME_STORAGE_KEY, runtimeSettings);
    setSavedRuntimeSettings(runtimeSettings);
  };

  return (
    <div className="page-layout settings-page">
      <SectionHeader meta="Providers, appearance, and runtime" status="Settings" tag="Settings" title="Application Settings" />

      <div className="page-layout__body">
        <div className="page-layout__main settings-main">
          <Card
            description="One settings hub for providers, typography, localization, and desktop runtime defaults."
            title="Application Settings"
            tone="accent"
          />

          {sections.map((section) => {
            const isActive = section.key === activeSection;

            return (
              <section className={`settings-panel${isActive ? " is-active" : ""}`} key={section.key}>
                <div className="settings-panel__top">
                  <button
                    aria-expanded={isActive}
                    className="settings-panel__trigger"
                    onClick={() => setActiveSection(section.key)}
                    type="button"
                  >
                    <div className="settings-panel__copy">
                      <h2>{section.title}</h2>
                      <p>{section.description}</p>
                    </div>
                  </button>

                  <div className="settings-panel__actions">
                    {section.key === "providers" ? <SettingsActionButton onClick={handleAddProvider}>+ Add Provider</SettingsActionButton> : null}
                    {section.dirty ? <SettingsChip tone="warning">Unsaved</SettingsChip> : <SettingsChip tone="soft">Saved</SettingsChip>}
                    <SettingsChip tone={isActive ? "active" : "default"}>{isActive ? "Active" : "Collapsed"}</SettingsChip>
                  </div>
                </div>

                <div className="settings-panel__summary">
                  {section.summary.map((item) => (
                    <SettingsChip key={`${section.key}-${item}`}>{item}</SettingsChip>
                  ))}
                </div>

                {isActive ? (
                  section.key === "providers" ? (
                    <ProviderEditor
                      dirty={providerDirty}
                      onAddProvider={handleAddProvider}
                      onReset={() => setProviderSettings(savedProviderSettings)}
                      onSave={saveProviders}
                      onUpdate={(updater) => setProviderSettings((current) => updater(current))}
                      settings={providerSettings}
                    />
                  ) : section.key === "appearance" ? (
                    <AppearanceEditor
                      dirty={appearanceDirty}
                      onReset={() => setAppearanceSettings(savedAppearanceSettings)}
                      onSave={saveAppearance}
                      onUpdate={(key, value) => setAppearanceSettings((current) => ({ ...current, [key]: value }))}
                      settings={appearanceSettings}
                    />
                  ) : (
                    <RuntimeEditor
                      dirty={runtimeDirty}
                      onReset={() => setRuntimeSettings(savedRuntimeSettings)}
                      onSave={saveRuntime}
                      onUpdate={(key, value) => setRuntimeSettings((current) => ({ ...current, [key]: value }))}
                      settings={runtimeSettings}
                    />
                  )
                ) : null}
              </section>
            );
          })}
        </div>

        <Inspector description="Explains what the selected settings area controls." title="Section Guide">
          <Card description={activeSectionConfig.guide.focused} title="Focused Section" />
          <Card description={activeSectionConfig.guide.appliesTo} title="Applies To" tone="soft" />
          <Card description={activeSectionConfig.guide.whatYouEdit} title="What You Edit" tone="soft" />
          <Card description={activeSectionConfig.guide.recommendedDefault} title="Recommended Default" tone="soft" />
          <Card description={`Registry discovered ${registry.count} provider${registry.count === 1 ? "" : "s"}.`} title="Registry Snapshot" tone="soft" />
        </Inspector>
      </div>
    </div>
  );
}

function buildProviderSettings(names: string[]): ProviderSettings {
  const sourceNames = names.length > 0 ? names : DEFAULT_PROVIDER_NAMES;
  const providers = sourceNames.map((name, index) => createProviderEntry(name, index));

  return {
    providers,
    defaultProviderId: providers[0]?.id ?? "",
    fallbackProviderId: providers[1]?.id ?? providers[0]?.id ?? "",
    connectionChecks: true,
  };
}

function createProviderEntry(name: string, index: number): ProviderEntry {
  const normalized = name.toLowerCase();

  if (normalized.includes("openai")) {
    return {
      id: `provider-openai-${index}`,
      name,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      apiKey: "",
      local: false,
      enabled: true,
    };
  }

  if (normalized.includes("anthropic")) {
    return {
      id: `provider-anthropic-${index}`,
      name,
      baseUrl: "https://api.anthropic.com",
      model: "claude-3-7-sonnet",
      apiKey: "",
      local: false,
      enabled: true,
    };
  }

  if (normalized.includes("ollama")) {
    return {
      id: `provider-ollama-${index}`,
      name,
      baseUrl: "http://localhost:11434",
      model: "llama3.2",
      apiKey: "",
      local: true,
      enabled: true,
    };
  }

  return {
    id: `provider-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || index}-${index}`,
    name,
    baseUrl: "",
    model: "",
    apiKey: "",
    local: false,
    enabled: true,
  };
}

function mergeProviderSettings(current: ProviderSettings, registryNames: string[]): ProviderSettings {
  const providers = [...current.providers];

  registryNames.forEach((name, index) => {
    if (!providers.some((provider) => provider.name.toLowerCase() === name.toLowerCase())) {
      providers.push(createProviderEntry(name, index + providers.length));
    }
  });

  const enabledProviders = providers.filter((provider) => provider.enabled);
  const defaultProviderId = providers.some((provider) => provider.id === current.defaultProviderId)
    ? current.defaultProviderId
    : enabledProviders[0]?.id ?? providers[0]?.id ?? "";
  const fallbackProviderId = providers.some((provider) => provider.id === current.fallbackProviderId)
    ? current.fallbackProviderId
    : enabledProviders[1]?.id ?? enabledProviders[0]?.id ?? providers[1]?.id ?? providers[0]?.id ?? "";

  return {
    ...current,
    providers,
    defaultProviderId,
    fallbackProviderId,
  };
}

function readStoredState<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function writeStoredState<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function serializeState(value: unknown) {
  return JSON.stringify(value);
}
