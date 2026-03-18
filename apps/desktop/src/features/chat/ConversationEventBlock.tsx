import { useState, type ReactNode } from "react";
import type { ChatMessage } from "@/lib/chat";
import { useI18n } from "@/lib/i18n";

type ConversationRole = ChatMessage["role"] | "thinking";

type ConversationEventBlockProps = {
  message: ChatMessage;
  onBranch?: (messageId: string) => void;
  streamingChunks?: string[];
};

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "code"; text: string };

function normalizeRole(role: ConversationRole) {
  if (role === "system" || role === "tool") {
    return "system-tool";
  }

  return role;
}

function bubbleLabel(
  role: ConversationRole,
  t: ReturnType<typeof useI18n>["t"],
) {
  switch (normalizeRole(role)) {
    case "assistant":
      return t("chat.message.assistant");
    case "thinking":
      return t("chat.message.thinking");
    case "system-tool":
      return role === "tool"
        ? t("chat.message.systemTool")
        : t("chat.message.system");
    case "user":
    default:
      return t("chat.message.user");
  }
}

function parseCompactionSummary(content: string) {
  const match = content.match(
    /^Compacted earlier chat context \((\d+) messages\):\s*([\s\S]*)$/i,
  );

  if (!match) {
    return null;
  }

  return {
    compactedMessageCount: Number(match[1]),
    summary: match[2].trim(),
  };
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);

  return tokens.filter(Boolean).map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={`bold-${index}`}>{token.slice(2, -2)}</strong>;
    }

    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={`code-${index}`}>{token.slice(1, -1)}</code>;
    }

    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          href={linkMatch[2]}
          key={`link-${index}`}
          rel="noreferrer"
          target="_blank"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return token;
  });
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }

    blocks.push({
      type: "paragraph",
      text: paragraph.join("\n"),
    });
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushParagraph();
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      blocks.push({ type: "code", text: codeLines.join("\n") });
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];

      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }

      blocks.push({ type: "unordered-list", items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];

      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }

      blocks.push({ type: "ordered-list", items });
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

function MarkdownBody({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className="chat-markdown">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            if (block.level === 1) {
              return (
                <h3 className="chat-markdown__heading" key={`heading-${index}`}>
                  {block.text}
                </h3>
              );
            }

            if (block.level === 2) {
              return (
                <h4
                  className="chat-markdown__heading chat-markdown__heading--sub"
                  key={`heading-${index}`}
                >
                  {block.text}
                </h4>
              );
            }

            return (
              <h5
                className="chat-markdown__heading chat-markdown__heading--minor"
                key={`heading-${index}`}
              >
                {block.text}
              </h5>
            );
          case "unordered-list":
            return (
              <ul className="chat-markdown__list" key={`list-${index}`}>
                {block.items.map((item, itemIndex) => (
                  <li key={`list-item-${itemIndex}`}>
                    {renderInlineMarkdown(item)}
                  </li>
                ))}
              </ul>
            );
          case "ordered-list":
            return (
              <ol
                className="chat-markdown__list chat-markdown__list--ordered"
                key={`ordered-${index}`}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={`ordered-item-${itemIndex}`}>
                    {renderInlineMarkdown(item)}
                  </li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre className="chat-markdown__code" key={`code-${index}`}>
                <code>{block.text}</code>
              </pre>
            );
          case "paragraph":
          default:
            return (
              <p
                className="chat-markdown__paragraph"
                key={`paragraph-${index}`}
              >
                {block.text.split("\n").map((line, lineIndex) => (
                  <span key={`line-${lineIndex}`}>
                    {lineIndex > 0 ? <br /> : null}
                    {renderInlineMarkdown(line)}
                  </span>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}

function StreamingMarkdownBody({ chunks }: { chunks: string[] }) {
  return (
    <div className="chat-markdown">
      <p className="chat-markdown__paragraph">
        {chunks.map((chunk, index) => (
          <span key={`chunk-${index}`}>{chunk}</span>
        ))}
      </p>
    </div>
  );
}

function BranchAnchor({ onBranch }: { onBranch: () => void }) {
  const { t } = useI18n();

  return (
    <button
      aria-label={t("chat.branch.turn")}
      className="chat-bubble__branch chat-bubble__branch--anchor"
      onClick={onBranch}
      title={t("chat.branch.turn")}
      type="button"
    >
      <svg
        aria-hidden="true"
        className="chat-bubble__branch-icon"
        viewBox="0 0 16 16"
      >
        <path d="M5 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
        <path d="M5 7.5v5" />
        <path d="M5 12.5h6.5" />
        <path d="M8.5 5.5h3v3" />
        <path d="M11.5 5.5 8 9" />
      </svg>
    </button>
  );
}

export function ConversationEventBlock({
  message,
  onBranch,
  streamingChunks,
}: ConversationEventBlockProps) {
  const { t } = useI18n();
  const role = message.role as ConversationRole;
  const [isCompactionExpanded, setIsCompactionExpanded] = useState(false);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const normalizedRole = normalizeRole(role);
  const compaction =
    role === "system" ? parseCompactionSummary(message.content) : null;
  const canBranch = Boolean(onBranch && !compaction && role !== "thinking");
  const toneClass = compaction ? "compaction" : normalizedRole;

  return (
    <article className={`chat-bubble chat-bubble--${toneClass}`}>
      <div className="chat-bubble__header">
        <span className="chat-bubble__label">
          {compaction ? t("chat.compaction.label") : bubbleLabel(role, t)}
        </span>
        {compaction ? (
          <button
            aria-label={
              isCompactionExpanded
                ? t("chat.compaction.hide")
                : t("chat.compaction.show")
            }
            className="chat-bubble__toggle"
            onClick={() => setIsCompactionExpanded((current) => !current)}
            type="button"
          >
            {isCompactionExpanded
              ? t("chat.compaction.hide")
              : t("chat.compaction.show")}
          </button>
        ) : role === "thinking" ? (
          <button
            aria-label={
              isThinkingExpanded
                ? t("chat.thinking.hide")
                : t("chat.thinking.show")
            }
            className="chat-bubble__toggle"
            onClick={() => setIsThinkingExpanded((current) => !current)}
            type="button"
          >
            {isThinkingExpanded
              ? t("chat.thinking.hide")
              : t("chat.thinking.show")}
          </button>
        ) : canBranch && onBranch ? (
          <BranchAnchor onBranch={() => onBranch(message.id)} />
        ) : null}
      </div>

      {compaction ? (
        <div className="chat-bubble__notice">
          <div className="chat-bubble__notice-copy">
            <strong>{t("chat.compaction.noticeTitle")}</strong>
            <span>
              {t("chat.compaction.noticeSummary", {
                count: compaction.compactedMessageCount,
              })}
            </span>
          </div>
          {isCompactionExpanded && compaction.summary ? (
            <MarkdownBody content={compaction.summary} />
          ) : null}
        </div>
      ) : role === "thinking" ? (
        <div className="chat-bubble__notice">
          <div className="chat-bubble__notice-copy">
            <strong>{t("chat.thinking.noticeTitle")}</strong>
            <span>{t("chat.thinking.noticeSummary")}</span>
          </div>
          {isThinkingExpanded ? (
            <MarkdownBody content={message.content} />
          ) : null}
        </div>
      ) : role === "assistant" ? (
        streamingChunks && streamingChunks.length > 0 ? (
          <StreamingMarkdownBody chunks={streamingChunks} />
        ) : (
          <MarkdownBody content={message.content} />
        )
      ) : (
        <p className="chat-bubble__content">{message.content}</p>
      )}
    </article>
  );
}
