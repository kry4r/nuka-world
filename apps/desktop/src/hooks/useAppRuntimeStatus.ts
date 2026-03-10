import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export type RuntimeCapabilityStatus = {
  kind: string;
  message: string;
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

    return () => {
      alive = false;
    };
  }, []);

  return {
    error,
    status,
  };
}
