import { useState, type ReactNode } from "react";
import type { TeamRunAgentRecord, TeamRunEventRecord } from "@/lib/team";
import { useI18n } from "@/lib/i18n";
import {
  compactionEntryMatchesAgent,
  firstMarkdownHeading,
  headingsOverlap,
  humanizeTeamRunAgentRole,
  humanizeTeamRunProtocolCopy,
  parseTeamRunCompactionEntries,
  titleCase,
} from "./teamRunPresentation";

type RunEventFeedProps = {
  agents: TeamRunAgentRecord[];
  events: TeamRunEventRecord[];
  mode?: "conversation" | "agent";
  onBranch?: (eventId: string) => void;
  selectedAgentId?: string | null;
};

type FeedEvent = TeamRunEventRecord & {
  branchable?: boolean;
  branchEventId?: string;
};

const PRIMARY_EVENT_KINDS = new Set([
  "user_instruction",
  "round_agenda",
  "position_card",
  "checkpoint_summary",
  "compaction_summary",
  "run_started",
  "run_heartbeat",
  "run_queued",
  "run_blocked",
  "run_resumed",
  "run_stuck",
  "run_retry",
  "provider_check_passed",
]);

function agentRecord(agents: TeamRunAgentRecord[], agentId: string | null) {
  if (!agentId) {
    return null;
  }

  return agents.find((agent) => agent.id === agentId) ?? null;
}

function normalizeAgentName(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function resolveAgentIdByName(
  agents: TeamRunAgentRecord[],
  agentName: string | null,
) {
  const normalized = normalizeAgentName(agentName);
  if (!normalized) {
    return null;
  }

  return (
    agents.find((agent) => normalizeAgentName(agent.name) === normalized)?.id ??
    null
  );
}

function formatEventKindLabel(
  kind: string,
  t: ReturnType<typeof useI18n>["t"],
) {
  switch (kind) {
    case "user_instruction":
      return t("teamRun.event.followUp");
    case "round_agenda":
      return t("teamRun.event.roundAgenda");
    case "position_card":
      return t("teamRun.event.positionCard");
    case "checkpoint_summary":
      return t("teamRun.event.checkpointSummary");
    case "compaction_summary":
      return t("teamRun.event.compactedContext");
    case "run_started":
      return t("teamRun.event.runStarted");
    case "run_heartbeat":
      return t("teamRun.event.runHeartbeat");
    case "run_queued":
      return t("teamRun.event.queued");
    case "run_blocked":
      return t("teamRun.event.blocked");
    case "run_resumed":
      return t("teamRun.event.resumed");
    case "run_stuck":
      return t("teamRun.event.stuck");
    case "run_retry":
      return t("teamRun.event.retry");
    case "provider_check_passed":
      return t("teamRun.event.providerCheckPassed");
    default:
      return titleCase(kind);
  }
}

function eventCardKind(event: TeamRunEventRecord) {
  if (event.kind === "user_instruction" || event.kind === "round_agenda") {
    return "instruction";
  }

  if (event.status === "thinking") {
    return "thinking";
  }

  if (event.kind.startsWith("run_") || event.kind === "provider_check_passed") {
    return "status";
  }

  if (event.toolName) {
    return "tool";
  }

  return "reply";
}

function formatEventCardLabel(
  cardKind: ReturnType<typeof eventCardKind>,
  t: ReturnType<typeof useI18n>["t"],
) {
  switch (cardKind) {
    case "instruction":
      return t("teamRun.eventCard.instruction");
    case "thinking":
      return t("teamRun.eventCard.thinking");
    case "tool":
      return t("teamRun.eventCard.tool");
    case "status":
      return t("teamRun.eventCard.status");
    case "reply":
    default:
      return t("teamRun.eventCard.reply");
  }
}

function formatEventStatus(
  status: string | null,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (!status) {
    return null;
  }

  if (status === "waiting_for_user") {
    return t("teamRun.state.waitingForInput");
  }

  if (status === "thinking") {
    return t("teamRun.state.thinking");
  }

  if (status === "completed" || status === "done") {
    return t("teamRun.state.completed");
  }

  if (status === "blocked") {
    return t("teamRun.state.blocked");
  }

  if (status === "stuck") {
    return t("teamRun.state.stuck");
  }

  if (status === "queued") {
    return t("teamRun.state.queued");
  }

  if (status === "running" || status === "active") {
    return t("teamRun.state.running");
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

function humanizeToolLabel(value: string, t: ReturnType<typeof useI18n>["t"]) {
  if (value === "session_artifacts") {
    return t("teamRun.agent.sessionArtifacts");
  }

  return value.includes("_") ? titleCase(value) : value;
}

function formatEventRelationship(
  event: TeamRunEventRecord,
  speaker: string,
  agents: TeamRunAgentRecord[],
  t: ReturnType<typeof useI18n>["t"],
) {
  if (event.kind === "user_instruction") {
    const recipient =
      agentRecord(agents, event.agentId)?.name ??
      t("teamRun.relationship.team");
    return `${speaker} → ${recipient}`;
  }

  if (event.toolName) {
    return `${speaker} → ${humanizeToolLabel(event.toolName, t)}`;
  }

  if (event.kind.startsWith("run_")) {
    return `${t("teamRun.speaker.system")} → ${t("teamRun.relationship.team")}`;
  }

  return `${speaker} → ${t("teamRun.relationship.team")}`;
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

function buildAgentTimelineEvents(
  agents: TeamRunAgentRecord[],
  events: TeamRunEventRecord[],
  selectedAgentId: string,
) {
  const selectedAgent = agentRecord(agents, selectedAgentId);
  if (!selectedAgent) {
    return [] as FeedEvent[];
  }

  const timeline: FeedEvent[] = [];

  for (const event of events) {
    if (event.kind === "file_change") {
      if (event.agentId === selectedAgentId) {
        timeline.push({ ...event, branchable: true });
      }
      continue;
    }

    if (event.kind === "compaction_summary") {
      const entries = parseTeamRunCompactionEntries(event.content).filter(
        (entry) =>
          compactionEntryMatchesAgent(entry, selectedAgent.name) ||
          entry.kind === "run_started" ||
          entry.kind === "user_instruction" ||
          entry.kind === "run_heartbeat" ||
          entry.kind === "provider_check_passed" ||
          entry.kind === "round_agenda" ||
          entry.kind === "checkpoint_summary",
      );

      entries.forEach((entry, index) => {
        timeline.push({
          id: `${event.id}:compaction:${index}`,
          runId: event.runId,
          kind: entry.kind,
          agentId:
            entry.kind === "user_instruction" ||
            compactionEntryMatchesAgent(entry, selectedAgent.name)
              ? selectedAgentId
              : null,
          title: entry.title,
          content: entry.content,
          status: event.status,
          toolName: null,
          toolCallId: null,
          toolTarget: null,
          sequence: event.sequence * 100 + index,
          createdAt: event.createdAt,
          branchable: true,
          branchEventId: event.id,
        });
      });
      continue;
    }

    const includePrimary =
      PRIMARY_EVENT_KINDS.has(event.kind) ||
      event.kind === "run_heartbeat" ||
      event.kind === "provider_check_passed";
    if (!includePrimary) {
      continue;
    }

    if (
      event.agentId === selectedAgentId ||
      event.kind === "user_instruction" ||
      event.kind === "round_agenda" ||
      event.kind === "run_heartbeat" ||
      event.kind === "provider_check_passed" ||
      event.kind.startsWith("run_")
    ) {
      timeline.push({ ...event, branchable: true });
    }
  }

  return timeline.sort((left, right) =>
    left.sequence === right.sequence
      ? left.createdAt.localeCompare(right.createdAt)
      : left.sequence - right.sequence,
  );
}

function expandCompactionSummary(
  agents: TeamRunAgentRecord[],
  event: TeamRunEventRecord,
) {
  const entries = parseTeamRunCompactionEntries(event.content);
  if (entries.length === 0) {
    return [{ ...event }] as FeedEvent[];
  }

  return entries.map((entry, index) => ({
    id: `${event.id}:compaction:${index}`,
    runId: event.runId,
    kind: entry.kind,
    agentId: resolveAgentIdByName(agents, entry.agentName),
    title: entry.title,
    content: entry.content,
    status: event.status,
    toolName: null,
    toolCallId: null,
    toolTarget: null,
    sequence: event.sequence * 100 + index,
    createdAt: event.createdAt,
    branchable: true,
    branchEventId: event.id,
  }));
}

function buildConversationTimelineEvents(
  agents: TeamRunAgentRecord[],
  events: TeamRunEventRecord[],
) {
  const timeline: FeedEvent[] = [];

  for (const event of events) {
    if (event.kind === "file_change" || !PRIMARY_EVENT_KINDS.has(event.kind)) {
      continue;
    }

    if (event.kind === "compaction_summary") {
      timeline.push(...expandCompactionSummary(agents, event));
      continue;
    }

    timeline.push({ ...event });
  }

  return timeline.sort((left, right) =>
    left.sequence === right.sequence
      ? left.createdAt.localeCompare(right.createdAt)
      : left.sequence - right.sequence,
  );
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

export function MarkdownMessage({ content }: { content: string }) {
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
                  <li key={`list-item-${itemIndex}`}>
                    {renderInlineMarkdown(item)}
                  </li>
                ))}
              </ul>
            );
          case "ordered-list":
            return (
              <ol
                className="run-markdown__list run-markdown__list--ordered"
                key={`olist-${index}`}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={`olist-item-${itemIndex}`}>
                    {renderInlineMarkdown(item)}
                  </li>
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
            const hasDivider =
              Boolean(dividerLine) && /^[\s|:-]+$/.test(dividerLine.trim());
            const headers = headerLine
              .split("|")
              .map((cell) => cell.trim())
              .filter(Boolean);
            const rows = (
              hasDivider
                ? bodyLines
                : [dividerLine, ...bodyLines].filter(Boolean)
            )
              .map((line) =>
                line
                  .split("|")
                  .map((cell) => cell.trim())
                  .filter(Boolean),
              )
              .filter((cells) => cells.length > 0);

            return (
              <div className="run-markdown__table-wrap" key={`table-${index}`}>
                <table className="run-markdown__table">
                  <thead>
                    <tr>
                      {headers.map((header, headerIndex) => (
                        <th key={`header-${headerIndex}`}>
                          {renderInlineMarkdown(header)}
                        </th>
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
              <blockquote
                className="run-markdown__quote"
                key={`quote-${index}`}
              >
                {block.lines.map((line, lineIndex) => (
                  <p key={`quote-line-${lineIndex}`}>
                    {renderInlineMarkdown(line)}
                  </p>
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
  const { t } = useI18n();

  return (
    <button
      aria-label={t("teamRun.event.branch")}
      className={`run-event-feed__branch run-event-feed__branch--anchor${isVisible ? " is-visible" : ""}`}
      onClick={onBranch}
      title={t("teamRun.event.branch")}
      type="button"
    >
      <svg
        aria-hidden="true"
        className="run-event-feed__branch-icon"
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

function RunEventCard({
  agents,
  event,
  mode,
  onBranch,
}: {
  agents: TeamRunAgentRecord[];
  event: FeedEvent;
  mode: "conversation" | "agent";
  onBranch?: (eventId: string) => void;
}) {
  const { locale, t } = useI18n();
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const [isBranchVisible, setIsBranchVisible] = useState(false);
  const linkedAgent = agentRecord(agents, event.agentId);
  const speaker =
    event.kind === "user_instruction"
      ? t("teamRun.speaker.you")
      : (linkedAgent?.name ?? t("teamRun.speaker.system"));
  const speakerRole =
    humanizeTeamRunAgentRole(linkedAgent?.role ?? null, t) ?? null;
  const cardKind = eventCardKind(event);
  const kindLabel =
    mode === "agent"
      ? formatEventCardLabel(cardKind, t)
      : formatEventKindLabel(event.kind, t);
  const statusLabel = formatEventStatus(event.status, t);
  const statusTone = eventStatusTone(event.status);
  const thinking = isThinkingEvent(event);
  const displayTitle =
    locale === "zh-CN"
      ? humanizeTeamRunProtocolCopy(event.title, t)
      : event.title;
  const displayContent =
    locale === "zh-CN"
      ? humanizeTeamRunProtocolCopy(event.content, t)
      : event.content;
  const contentHeading = firstMarkdownHeading(displayContent);
  const relationshipLabel = formatEventRelationship(event, speaker, agents, t);
  const shouldShowTitle =
    event.kind !== "compaction_summary" &&
    !headingsOverlap(displayTitle, contentHeading) &&
    !headingsOverlap(kindLabel, displayTitle);

  return (
    <article
      className={`run-event-feed__item run-event-feed__item--${eventTone(event)} run-event-feed__item--card-${cardKind}${thinking ? " is-thinking" : ""}`}
      data-event-card-kind={cardKind}
      onBlur={(inputEvent) => {
        const nextTarget = inputEvent.relatedTarget;
        if (
          nextTarget instanceof Node &&
          inputEvent.currentTarget.contains(nextTarget)
        ) {
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
          <span className="run-event-feed__eyebrow">{kindLabel}</span>
          <div className="run-event-feed__identity-line">
            <span
              aria-hidden="true"
              className={`run-event-feed__speaker-dot run-event-feed__speaker-dot--${eventTone(event)}`}
            />
            <span className="run-event-feed__agent">{speaker}</span>
            {speakerRole ? (
              <span className="run-event-feed__role">{speakerRole}</span>
            ) : null}
          </div>
          <div className="run-event-feed__activity-row">
            <span className="run-event-feed__relationship">
              {relationshipLabel}
            </span>
            {event.toolName ? (
              <span className="run-event-feed__activity-pill">
                {t("teamRun.eventCard.tool")}
              </span>
            ) : null}
          </div>
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
            {onBranch && event.branchable !== false ? (
              <RunEventBranchAnchor
                isVisible={isBranchVisible}
                onBranch={() => onBranch(event.branchEventId ?? event.id)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {shouldShowTitle ? <h3>{displayTitle}</h3> : null}
      {thinking ? (
        <div className="run-event-feed__thinking">
          <div className="run-event-feed__thinking-summary">
            <strong>{t("teamRun.thinking.title")}</strong>
            <span>{t("teamRun.thinking.summary", { name: speaker })}</span>
          </div>
          <button
            aria-label={
              isThinkingExpanded
                ? t("teamRun.thinking.hide")
                : t("teamRun.thinking.show")
            }
            className="run-event-feed__thinking-toggle"
            onClick={() => setIsThinkingExpanded((current) => !current)}
            type="button"
          >
            {isThinkingExpanded
              ? t("teamRun.thinking.hide")
              : t("teamRun.thinking.show")}
          </button>
          {isThinkingExpanded ? (
            <MarkdownMessage content={displayContent} />
          ) : null}
        </div>
      ) : (
        <MarkdownMessage content={displayContent} />
      )}
      {event.toolName ? (
        <div className="run-event-feed__tool">
          <span className="run-event-feed__tool-label">
            {humanizeToolLabel(event.toolName, t)}
          </span>
          {event.toolTarget ? (
            <span className="run-event-feed__tool-target">
              {event.toolTarget}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function RunEventFeed({
  agents,
  events,
  mode = "conversation",
  onBranch,
  selectedAgentId = null,
}: RunEventFeedProps) {
  const { t } = useI18n();
  const visibleEvents =
    mode === "agent" && selectedAgentId
      ? buildAgentTimelineEvents(agents, events, selectedAgentId)
      : buildConversationTimelineEvents(agents, events);

  return (
    <section
      aria-label={t("teamRun.view.conversation")}
      className="run-event-feed"
    >
      {visibleEvents.map((event) => (
        <RunEventCard
          agents={agents}
          event={event}
          key={event.id}
          mode={mode}
          onBranch={onBranch}
        />
      ))}
    </section>
  );
}
