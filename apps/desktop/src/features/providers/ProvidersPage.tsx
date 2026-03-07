import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

type ProviderRegistryResponse = {
  count: number;
  names: string[];
};

export function ProvidersPage() {
  const [registry, setRegistry] = useState<ProviderRegistryResponse | null>(null);

  useEffect(() => {
    void invoke<ProviderRegistryResponse>("provider_registry").then(setRegistry);
  }, []);

  return (
    <section>
      <h2>Providers & Remote Adapters</h2>
      <p>Provider registry starts empty until external providers are configured.</p>
      {registry ? <p>Configured providers: {registry.count}</p> : null}
    </section>
  );
}
