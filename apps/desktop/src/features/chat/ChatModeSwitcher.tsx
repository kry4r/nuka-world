import type { ChatMode } from "@/lib/chat";

type ChatModeKind = ChatMode["kind"];

const MODE_OPTIONS: Array<{ description: string; kind: ChatModeKind; label: string }> = [
  {
    kind: "chat_only",
    label: "Chat only",
    description: "Keep the conversation in the World chat lane.",
  },
  {
    kind: "create_workflow",
    label: "Create workflow",
    description: "Shape the prompt into a reusable workflow outline.",
  },
  {
    kind: "specific_workflow",
    label: "Specific workflow",
    description: "Anchor the prompt to a saved workflow you choose.",
  },
];

type ChatModeSwitcherProps = {
  disabled?: boolean;
  onChange: (kind: ChatModeKind) => void;
  value: ChatModeKind;
};

export function ChatModeSwitcher({
  disabled = false,
  onChange,
  value,
}: ChatModeSwitcherProps) {
  return (
    <div aria-label="Chat mode" className="chat-mode-switcher" role="radiogroup">
      {MODE_OPTIONS.map((option) => {
        const selected = option.kind === value;

        return (
          <button
            aria-checked={selected}
            className={`chat-mode-switcher__option ${selected ? "is-selected" : ""}`}
            disabled={disabled}
            key={option.kind}
            onClick={() => onChange(option.kind)}
            role="radio"
            tabIndex={selected ? 0 : -1}
            title={option.description}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
