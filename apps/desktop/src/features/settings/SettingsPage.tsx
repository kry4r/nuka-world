import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, type ReactNode } from "react";
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

type SettingsSection = {
  key: SettingsSectionKey;
  title: string;
  description: string;
  summary: string[];
  guide: SectionGuide;
};

type SettingField = {
  label: string;
  value: string;
  hint: string;
};

type SettingsOptionCardProps = {
  title: string;
  description: string;
  fields: SettingField[];
};

function SettingsOptionCard({ description, fields, title }: SettingsOptionCardProps) {
  return (
    <section className="settings-option-card">
      <div className="settings-option-card__header">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <div className="settings-option-card__rows">
        {fields.map((field) => (
          <div className="settings-field-row" key={field.label}>
            <div className="settings-field-row__copy">
              <span className="settings-field-row__label">{field.label}</span>
              <span className="settings-field-row__hint">{field.hint}</span>
            </div>
            <span className="settings-chip settings-chip--soft">{field.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsActionButton({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "accent";
}) {
  return <button className={`settings-button settings-button--${tone}`} type="button">{children}</button>;
}

function SettingsChip({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "active" | "soft";
}) {
  return <span className={`settings-chip settings-chip--${tone}`}>{children}</span>;
}

export function SettingsPage() {
  const [registry, setRegistry] = useState<ProviderRegistryResponse>({ count: 0, names: [] });
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("appearance");

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

  const primaryProvider = registry.names[0] ?? "Not configured";
  const fallbackProvider = registry.names[1] ?? "Add a fallback";
  const localProvider = registry.names.find((name) => /ollama|local/i.test(name)) ?? "Local runtime off";

  const sections: SettingsSection[] = [
    {
      key: "providers",
      title: "Providers",
      description: "Model access, routing, and fallback behavior live here now.",
      summary: [`${registry.count} configured`, `${primaryProvider} default`, `${fallbackProvider} fallback`],
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
      summary: ["Inter UI", "14 px text", "English (US)", "Comfortable"],
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
      summary: ["Tray enabled", "Launch off", "Background adapters"],
      guide: {
        focused: "Runtime keeps the desktop shell responsive while longer-lived tasks continue safely.",
        appliesTo: "Tray behavior, startup lifecycle, background connectors, and local diagnostics.",
        whatYouEdit: "Close policy, launch at login, adapter background mode, and logging detail.",
        recommendedDefault: "Enable tray residency, keep launch at login off, and keep logging concise.",
      },
    },
  ];

  const activeSectionConfig = sections.find((section) => section.key === activeSection) ?? sections[1];

  return (
    <div className="page-layout settings-page">
      <SectionHeader
        meta="Providers, appearance, and runtime"
        status="Settings"
        tag="Settings"
        title="Application Settings"
      />

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
                    {section.key === "providers" ? <SettingsActionButton>+ Add Provider</SettingsActionButton> : null}
                    <SettingsChip tone={isActive ? "active" : "default"}>{isActive ? "Active" : "Collapsed"}</SettingsChip>
                  </div>
                </div>

                <div className="settings-panel__summary">
                  {section.summary.map((item) => (
                    <SettingsChip key={item}>{item}</SettingsChip>
                  ))}
                </div>

                {isActive ? renderSectionBody(section.key, { fallbackProvider, localProvider, primaryProvider, registry }) : null}
              </section>
            );
          })}
        </div>

        <Inspector description="Explains what the selected settings area controls." title="Section Guide">
          <Card description={activeSectionConfig.guide.focused} title="Focused Section" />
          <Card description={activeSectionConfig.guide.appliesTo} title="Applies To" tone="soft" />
          <Card description={activeSectionConfig.guide.whatYouEdit} title="What You Edit" tone="soft" />
          <Card description={activeSectionConfig.guide.recommendedDefault} title="Recommended Default" tone="soft" />
        </Inspector>
      </div>
    </div>
  );
}

function renderSectionBody(
  section: SettingsSectionKey,
  state: {
    primaryProvider: string;
    fallbackProvider: string;
    localProvider: string;
    registry: ProviderRegistryResponse;
  },
) {
  if (section === "providers") {
    return (
      <div className="settings-panel__body">
        <SettingsOptionCard
          description="Control which provider the app prefers before any page-specific override is applied."
          fields={[
            {
              label: "Default provider",
              value: state.primaryProvider,
              hint: "Used by chat, agents, and workflows unless a workflow overrides it.",
            },
            {
              label: "Fallback provider",
              value: state.fallbackProvider,
              hint: "Takes over when the primary route is unavailable or rate-limited.",
            },
          ]}
          title="Routing Defaults"
        />
        <SettingsOptionCard
          description="Keep local adapters and provider checks predictable before saving changes."
          fields={[
            {
              label: "Local model",
              value: state.localProvider,
              hint: "Surface a local runtime for offline or low-latency runs.",
            },
            {
              label: "Connection checks",
              value: state.registry.count > 0 ? "Enabled" : "Waiting for provider",
              hint: "Validate credentials and model availability before applying defaults.",
            },
          ]}
          title="Health & Availability"
        />
        <div className="settings-panel__footer">
          <SettingsActionButton>Test Connection</SettingsActionButton>
          <SettingsActionButton tone="accent">Save Provider Changes</SettingsActionButton>
        </div>
      </div>
    );
  }

  if (section === "appearance") {
    return (
      <div className="settings-panel__body">
        <div className="settings-option-grid">
          <SettingsOptionCard
            description="Shape how long conversations read in the main canvas and inspector panels."
            fields={[
              {
                label: "Interface font",
                value: "Inter",
                hint: "Used for navigation, section headers, panels, and controls.",
              },
              {
                label: "Message font",
                value: "Inter Text",
                hint: "Applied to chat replies, notes, and generated summaries.",
              },
              {
                label: "Text size",
                value: "14 px",
                hint: "Base reading size for the default desktop density.",
              },
            ]}
            title="Reading & Type"
          />

          <SettingsOptionCard
            description="Control locale defaults so dates, prompts, and generated answers stay consistent."
            fields={[
              {
                label: "Language",
                value: "English (US)",
                hint: "Primary language for the app shell and default labels.",
              },
              {
                label: "Response locale",
                value: "Follow session",
                hint: "Lets each chat or workflow prefer its own language when needed.",
              },
              {
                label: "Time format",
                value: "24-hour",
                hint: "Used in timestamps, task history, and activity cards.",
              },
            ]}
            title="Localization"
          />

          <SettingsOptionCard
            description="Tune the desktop shell so the app feels calm, legible, and native to the platform."
            fields={[
              {
                label: "Density",
                value: "Comfortable",
                hint: "Adds breathing room to sidebars, cards, and message blocks.",
              },
              {
                label: "Motion",
                value: "Standard",
                hint: "Keeps transitions soft without making the interface feel sluggish.",
              },
              {
                label: "Window chrome",
                value: "Minimal glass",
                hint: "Uses subtle custom controls while keeping the content area calm.",
              },
              {
                label: "Sidebar default",
                value: "Expanded",
                hint: "Open by default so page navigation and memory layers stay visible.",
              },
            ]}
            title="Window & Motion"
          />
        </div>

        <div className="settings-panel__footer">
          <SettingsActionButton>Preview Typography</SettingsActionButton>
          <SettingsActionButton tone="accent">Save Appearance</SettingsActionButton>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-panel__body">
      <SettingsOptionCard
        description="Decide what the shell keeps alive after the window closes and how it restarts."
        fields={[
          {
            label: "Close behavior",
            value: "Minimize to tray",
            hint: "Keeps world chat and background integrations ready without closing the app.",
          },
          {
            label: "Launch at login",
            value: "Off",
            hint: "Only turn this on after providers and storage paths are configured.",
          },
        ]}
        title="Shell Lifecycle"
      />
      <SettingsOptionCard
        description="Keep tool adapters available without overwhelming the local runtime."
        fields={[
          {
            label: "Background adapters",
            value: "Enabled",
            hint: "Lets knowledge sync and tool bridges continue while the window is hidden.",
          },
          {
            label: "Logging",
            value: "Standard",
            hint: "Stores concise runtime logs unless a support session needs more detail.",
          },
        ]}
        title="Background Work"
      />
      <div className="settings-panel__footer">
        <SettingsActionButton>Open Runtime Logs</SettingsActionButton>
        <SettingsActionButton tone="accent">Save Runtime</SettingsActionButton>
      </div>
    </div>
  );
}
