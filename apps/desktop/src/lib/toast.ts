export type ToastTone = "info" | "success" | "error";

export type ToastInput = {
  id?: string;
  message: string;
  tone?: ToastTone;
  durationMs?: number;
};

export type ToastRecord = {
  id: string;
  message: string;
  tone: ToastTone;
  durationMs: number;
};

export const TOAST_EVENT_NAME = "nuka:toast";

let toastSequence = 0;

function nextToastId() {
  toastSequence += 1;
  return `toast-${toastSequence}`;
}

export function normalizeToast(input: ToastInput): ToastRecord {
  const tone = input.tone ?? "info";

  return {
    id: input.id ?? nextToastId(),
    message: input.message,
    tone,
    durationMs: input.durationMs ?? (tone === "error" ? 0 : 4000),
  };
}

export function emitToast(input: ToastInput) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ToastInput>(TOAST_EVENT_NAME, {
      detail: input,
    }),
  );
}

export function subscribeToToasts(listener: (input: ToastInput) => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<ToastInput>).detail);
  };

  window.addEventListener(TOAST_EVENT_NAME, handleEvent as EventListener);

  return () => {
    window.removeEventListener(TOAST_EVENT_NAME, handleEvent as EventListener);
  };
}
