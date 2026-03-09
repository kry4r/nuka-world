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
};

export function ConversationEventBlock({
  message,
}: ConversationEventBlockProps) {
  return (
    <article className={`chat-bubble chat-bubble--${message.role}`}>
      <span className="chat-bubble__label">{bubbleLabel(message.role)}</span>
      <p className="chat-bubble__content">{message.content}</p>
    </article>
  );
}
