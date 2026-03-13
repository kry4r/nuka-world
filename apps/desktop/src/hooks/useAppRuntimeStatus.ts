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

type RuntimeStatusSnapshot = {
  status: RuntimeStatus | null;
  error: string | null;
};

const EMPTY_SNAPSHOT: RuntimeStatusSnapshot = {
  status: null,
  error: null,
};

const listeners = new Set<(snapshot: RuntimeStatusSnapshot) => void>();
let currentSnapshot: RuntimeStatusSnapshot = EMPTY_SNAPSHOT;
let inFlightRequest: Promise<void> | null = null;
let requestVersion = 0;

function emitSnapshot(snapshot: RuntimeStatusSnapshot) {
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function updateSnapshot(snapshot: RuntimeStatusSnapshot) {
  currentSnapshot = snapshot;
  emitSnapshot(snapshot);
}

function loadRuntimeStatus(force = false) {
  if (inFlightRequest && !force) {
    return inFlightRequest;
  }

  const nextVersion = requestVersion + 1;
  requestVersion = nextVersion;
  const request = invoke<RuntimeStatus>("app_runtime_status")
    .then((status) => {
      if (requestVersion !== nextVersion) {
        return;
      }

      updateSnapshot({
        status,
        error: null,
      });
    })
    .catch((caughtError) => {
      if (requestVersion !== nextVersion) {
        return;
      }

      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      updateSnapshot({
        status: null,
        error: message,
      });
    })
    .finally(() => {
      if (requestVersion === nextVersion) {
        inFlightRequest = null;
      }
    });

  inFlightRequest = request;
  return request;
}

export function useAppRuntimeStatus() {
  const [snapshot, setSnapshot] = useState<RuntimeStatusSnapshot>(currentSnapshot);

  useEffect(() => {
    const handleSnapshot = (nextSnapshot: RuntimeStatusSnapshot) => {
      setSnapshot(nextSnapshot);
    };

    const handleRefresh = () => {
      void loadRuntimeStatus(true);
    };

    listeners.add(handleSnapshot);
    handleSnapshot(currentSnapshot);

    if (!currentSnapshot.status && !currentSnapshot.error) {
      void loadRuntimeStatus();
    }

    window.addEventListener(RUNTIME_STATUS_REFRESH_EVENT, handleRefresh);

    return () => {
      window.removeEventListener(RUNTIME_STATUS_REFRESH_EVENT, handleRefresh);
      listeners.delete(handleSnapshot);

      if (listeners.size === 0) {
        currentSnapshot = EMPTY_SNAPSHOT;
        inFlightRequest = null;
      }
    };
  }, []);

  return {
    error: snapshot.error,
    status: snapshot.status,
  };
}
