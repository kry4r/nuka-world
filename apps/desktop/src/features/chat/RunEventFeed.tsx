import { useState, type ReactNode } from "react";
import type { TeamRunAgentRecord, TeamRunEventRecord } from "@/lib/team";

type RunEventFeedProps = {
  agents: TeamRunAgentRecord[];
  events: TeamRunEventRecord[];
  onBranch?: (eventId: string) => void;
};

const PRIMARY_EVENT_KINDS = new Set([
  "user_instruction",
  "round_agenda",
  "position_card",
  "checkpoint_summary",
  "compaction_summary",
  "run_started",
  "run_queued",
  "run_blocked",
  "run_resumed",
  "run_stuck",
  "run_retry",
]);

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function agentName(agents: TeamRunAgentRecord[], agentId: string | null) {
  if (!agentId) {
    return "System";
  }

  return agents.find((agent) => agent.id === agentId)?.name ?? "Agent";
}

function formatEventKindLabel(kind: string) {
  switch (kind) {
    case "user_instruction":
      return "Follow-up";
    case "round_agenda":
      return "Round agenda";
    case "position_card":
      return "Position card";
    case "checkpoint_summary":
      return "Checkpoint summary";
    case "compaction_summary":
      return "Compacted context";
    case "run_started":
      return "Run started";
    case "run_queued":
      return "Queued";
    case "run_blocked":
      return "Blocked";
    case "run_resumed":
      return "Resumed";
    case "run_stuck":
      return "Stuck";
    case "run_retry":
      return "Retry";
    default:
      return titleCase(kind);
  }
}

function formatEventStatus(status: string | null) {
  if (!status) {
    return null;
  }

  if (status === "waiting_for_user") {
    return "Waiting for input";
  }

  return titleCase(status);
}

function eventStatusTone(status: string | null) {
  switch (status) {
    case "completed":
    case "done":
      return "complete";
    case "blocked":
    case "stuck":
      return "blocked";
    case "thinking":
    case "queued":
    case "running":
    case "waiting_for_user":
      return "pending";
    default:
      return "neutral";
  }
}

function humanizeToolLabel(value: string) {
  if (value === "session_artifacts") {
    return "Session Artifacts";
  }

  return value.includes("_") ? titleCase(value) : value;
}

function eventTone(event: TeamRunEventRecord) {
  if (event.kind === "user_instruction") {
    return "user";
  }

  if (event.agentId) {
    return "agent";
  }

  return "system";
}

function isThinkingEvent(event: TeamRunEventRecord) {
  return event.status === "thinking";
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
        <a href={linkMatch[2]} key={`link-${index}`} rel="noreferrer" target="_blank">
          {linkMatch[1]}
        </a>
      );
    }

    return token;
  });
}

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "code"; text: string }
  | { type: "table"; lines: string[] }
  | { type: "blockquote"; lines: string[] };

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

    if (trimmed.startsWith(">")) {
      flushParagraph();
      const quoteLines: string[] = [];

      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push({ type: "blockquote", lines: quoteLines });
      continue;
    }

    if (trimmed.startsWith("|")) {
      flushParagraph();
      const tableLines: string[] = [];

      while (index < lines.length && lines[index].trim().startsWith("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }

      blocks.push({ type: "table", lines: tableLines });
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

function MarkdownMessage({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className="run-markdown">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            if (block.level === 1) {
              return (
                <h4 className="run-markdown__heading" key={`heading-${index}`}>
                  {block.text}
                </h4>
              );
            }

            if (block.level === 2) {
              return (
                <h5
                  className="run-markdown__heading run-markdown__heading--sub"
                  key={`heading-${index}`}
                >
                  {block.text}
                </h5>
              );
            }

            return (
              <h6
                className="run-markdown__heading run-markdown__heading--minor"
                key={`heading-${index}`}
              >
                {block.text}
              </h6>
            );
          case "unordered-list":
            return (
              <ul className="run-markdown__list" key={`list-${index}`}>
                {block.items.map((item, itemIndex) => (
                  <li key={`list-item-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
                ))}
              </ul>
            );
          case "ordered-list":
            return (
              <ol className="run-markdown__list run-markdown__list--ordered" key={`olist-${index}`}>
                {block.items.map((item, itemIndex) => (
                  <li key={`olist-item-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre className="run-markdown__code" key={`code-${index}`}>
                <code>{block.text}</code>
              </pre>
            );
          case "table": {
            const [headerLine, dividerLine, ...bodyLines] = block.lines;
            const hasDivider = Boolean(dividerLine) && /^[\s|:-]+$/.test(dividerLine.trim());
            const headers = headerLine
              .split("|")
              .map((cell) => cell.trim())
              .filter(Boolean);
            const rows = (hasDivider ? bodyLines : [dividerLine, ...bodyLines].filter(Boolean))
              .map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean))
              .filter((cells) => cells.length > 0);

            return (
              <div className="run-markdown__table-wrap" key={`table-${index}`}>
                <table className="run-markdown__table">
                  <thead>
                    <tr>
                      {headers.map((header, headerIndex) => (
                        <th key={`header-${headerIndex}`}>{renderInlineMarkdown(header)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={`row-${rowIndex}`}>
                        {row.map((cell, cellIndex) => (
                          <td key={`cell-${rowIndex}-${cellIndex}`}>
                            {renderInlineMarkdown(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case "blockquote":
            return (
              <blockquote className="run-markdown__quote" key={`quote-${index}`}>
                {block.lines.map((line, lineIndex) => (
                  <p key={`quote-line-${lineIndex}`}>{renderInlineMarkdown(line)}</p>
                ))}
              </blockquote>
            );
          case "paragraph":
          default:
            return (
              <p className="run-markdown__paragraph" key={`paragraph-${index}`}>
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

function RunEventBranchAnchor({
  isVisible,
  onBranch,
}: {
  isVisible: boolean;
  onBranch: () => void;
}) {
  return (
    <button
      aria-label="Branch from this event"
      className={`run-event-feed__branch run-event-feed__branch--anchor${isVisible ? " is-visible" : ""}`}
      onClick={onBranch}
      title="Branch from this event"
      type="button"
    >
      <svg aria-hidden="true" className="run-event-feed__branch-icon" viewBox="0 0 16 16">
        <path d="M5 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
        <path d="M5 7.5v5" />
        <path d="M5 12.5h6.5" />
        <path d="M8.5 5.5h3v3" />
        <path d="M11.5 5.5 8 9" />
      </svg>
    </button>
  );
}

function RunEventCard({
  agents,
  event,
  onBranch,
}: {
  agents: TeamRunAgentRecord[];
  event: TeamRunEventRecord;
  onBranch?: (eventId: string) => void;
}) {
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const [isBranchVisible, setIsBranchVisible] = useState(false);
  const speaker = event.kind === "user_instruction" ? "You" : agentName(agents, event.agentId);
  const kindLabel = formatEventKindLabel(event.kind);
  const statusLabel = formatEventStatus(event.status);
  const statusTone = eventStatusTone(event.status);
  const thinking = isThinkingEvent(event);

  return (
    <article
      className={`run-event-feed__item run-event-feed__item--${eventTone(event)}${thinking ? " is-thinking" : ""}`}
      onBlur={(inputEvent) => {
        const nextTarget = inputEvent.relatedTarget;
        if (nextTarget instanceof Node && inputEvent.currentTarget.contains(nextTarget)) {
          return;
        }

        setIsBranchVisible(false);
      }}
      onFocus={() => setIsBranchVisible(true)}
      onMouseEnter={() => setIsBranchVisible(true)}
      onMouseLeave={() => setIsBranchVisible(false)}
    >
      <div className="run-event-feed__meta-row">
        <div className="run-event-feed__meta">
          <span className="run-event-feed__agent">{speaker}</span>
          <span className="run-event-feed__kind">{kindLabel}</span>
        </div>
        {statusLabel || onBranch ? (
          <div className="run-event-feed__meta-actions">
            {statusLabel ? (
              <span
                aria-label={statusLabel}
                className={`run-event-feed__status-light run-event-feed__status-light--${statusTone}`}
                title={statusLabel}
              >
                <span className="composer__visually-hidden">{statusLabel}</span>
              </span>
            ) : null}
            {onBranch ? (
              <RunEventBranchAnchor
                isVisible={isBranchVisible}
                onBranch={() => onBranch(event.id)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <h3>{event.title}</h3>
      {thinking ? (
        <div className="run-event-feed__thinking">
          <div className="run-event-feed__thinking-summary">
            <strong>Thinking</strong>
            <span>{speaker} is working through the next step.</span>
          </div>
          <button
            aria-label={isThinkingExpanded ? "Hide thinking trace" : "Show thinking trace"}
            className="run-event-feed__thinking-toggle"
            onClick={() => setIsThinkingExpanded((current) => !current)}
            type="button"
          >
            {isThinkingExpanded ? "Hide thinking trace" : "Show thinking trace"}
          </button>
          {isThinkingExpanded ? <MarkdownMessage content={event.content} /> : null}
        </div>
      ) : (
        <MarkdownMessage content={event.content} />
      )}
      {event.toolName ? (
        <div className="run-event-feed__tool">
          <span>{humanizeToolLabel(event.toolName)}</span>
          {event.toolTarget ? <span>{event.toolTarget}</span> : null}
        </div>
      ) : null}
    </article>
  );
}

export function RunEventFeed({ agents, events, onBranch }: RunEventFeedProps) {
  const visibleEvents = events.filter(
    (event) => event.kind !== "file_change" && PRIMARY_EVENT_KINDS.has(event.kind),
  );

  return (
    <section aria-label="Team run conversation" className="run-event-feed">
      {visibleEvents.map((event) => (
        <RunEventCard agents={agents} event={event} key={event.id} onBranch={onBranch} />
      ))}
    </section>
  );
}
