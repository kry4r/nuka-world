import { useAppRuntimeStatus } from "./useAppRuntimeStatus";

export function openSettingsFromGate() {
  window.dispatchEvent(
    new CustomEvent("nuka:navigate", {
      detail: { page: "settings" },
    }),
  );
}

export function useProviderGate() {
  const { error, status } = useAppRuntimeStatus();
  const checking = !status && !error;
  const ready = status?.provider.kind === "ready";

  return {
    ready,
    blocked: !ready && !checking,
    checking,
    message: status?.provider.message ?? (error ? "Provider unavailable" : "Checking provider status"),
    openSettings: openSettingsFromGate,
  };
}
