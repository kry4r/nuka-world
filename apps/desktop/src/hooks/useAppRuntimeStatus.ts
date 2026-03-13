import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export const RUNTIME_STATUS_REFRESH_EVENT = "nuka:runtime-status-refresh";

export type RuntimeCapabilityStatus = {
  kind: string;
  message: string;
  label?: string | null;
};

export type RuntimeStatus = {
  provider: RuntimeCapabilityStatus;
  knowledge: RuntimeCapabilityStatus;
  app: RuntimeCapabilityStatus;
};

export function useAppRuntimeStatus() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const loadStatus = () => {
      void invoke<RuntimeStatus>("app_runtime_status")
        .then((nextStatus) => {
          if (!alive) {
            return;
          }

          setStatus(nextStatus);
          setError(null);
        })
        .catch((caughtError) => {
          if (!alive) {
            return;
          }

          const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
          setError(message);
        });
    };

    const handleRefresh = () => {
      loadStatus();
    };

    loadStatus();
    window.addEventListener(RUNTIME_STATUS_REFRESH_EVENT, handleRefresh);

    return () => {
      alive = false;
      window.removeEventListener(RUNTIME_STATUS_REFRESH_EVENT, handleRefresh);
    };
  }, []);

  return {
    error,
    status,
  };
}
