import type { ChatMessage } from "@/lib/chat";

function bubbleLabel(role: ChatMessage["role"]) {
  switch (role) {
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
    case "tool":
      return "Tool";
    case "user":
    default:
      return "You";
  }
}

type ConversationEventBlockProps = {
  message: ChatMessage;
  onBranch?: (messageId: string) => void;
};

export function ConversationEventBlock({
  message,
  onBranch,
}: ConversationEventBlockProps) {
  return (
    <article className={`chat-bubble chat-bubble--${message.role}`}>
      <div className="chat-bubble__header">
        <span className="chat-bubble__label">{bubbleLabel(message.role)}</span>
        {onBranch ? (
          <button
            aria-label="Branch from this turn"
            className="chat-bubble__branch"
            onClick={() => onBranch(message.id)}
            type="button"
          >
            Branch
          </button>
        ) : null}
      </div>
      <p className="chat-bubble__content">{message.content}</p>
    </article>
  );
}
