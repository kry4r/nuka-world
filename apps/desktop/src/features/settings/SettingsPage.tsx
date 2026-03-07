import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

type ProviderRegistryResponse = {
  count: number;
  names: string[];
};

export function SettingsPage() {
  const [registry, setRegistry] = useState<ProviderRegistryResponse>({ count: 0, names: [] });

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

  return (
    <div className="page-layout">
      <SectionHeader
        meta="Providers, app behavior, and runtime"
        status="Priority"
        tag="Settings"
        title="Application Settings"
      />

      <div className="page-layout__body">
        <div className="page-layout__main">
          <Card description="Default provider behavior, local runtime preferences, and desktop UX defaults." title="Application Settings" tone="accent" />
          <Card description={`Configured providers: ${registry.count}`} title="Providers" />
          <Card description="Warm cream palette, custom window chrome, and panel behavior." title="Appearance" />
          <Card description="Tray residency and long-running remote adapters." title="Runtime" />
        </div>

        <Inspector description="Providers now live here instead of a separate page." title="Current Section">
          <Card description={registry.count === 0 ? "Currently empty" : registry.names.join(", ")} title="Providers" />
          <Card description="Window chrome, spacing, and surface balance." title="Appearance" />
          <Card description="Tray-resident app with background integrations." title="Runtime" />
        </Inspector>
      </div>
    </div>
  );
}
