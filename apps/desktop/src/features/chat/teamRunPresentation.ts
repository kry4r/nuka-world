import { useI18n } from "@/lib/i18n";
import type { TeamRunEventRecord } from "@/lib/team";

type TeamRunTranslate = ReturnType<typeof useI18n>["t"];

export function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function firstMarkdownHeading(content: string) {
  const match = content.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m);
  return match?.[1] ?? null;
}

function normalizeLabel(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.:：。!！?？]+$/u, "")
    .toLocaleLowerCase();
}

function sameNormalizedLabel(left: string | null, right: string | null) {
  const leftLabel = normalizeLabel(left);
  const rightLabel = normalizeLabel(right);

  if (!leftLabel || !rightLabel) {
    return false;
  }

  return leftLabel === rightLabel;
}

function comparisonLabel(value: string | null) {
  const normalized = normalizeLabel(value);
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\s*[\(\[（【].*?[\)\]）】]\s*$/u, "").trim();
}

export function headingsOverlap(left: string | null, right: string | null) {
  const leftLabel = comparisonLabel(left);
  const rightLabel = comparisonLabel(right);

  if (!leftLabel || !rightLabel) {
    return false;
  }

  return leftLabel === rightLabel;
}

export function humanizeTeamRunAgentRole(
  value: string | null,
  t: TeamRunTranslate,
) {
  const normalized = normalizeLabel(value);

  switch (normalized) {
    case "coordinator":
      return "协调者";
    case "scheduler agent":
      return t("teamRun.agent.role.scheduler");
    case "executor agent":
      return t("teamRun.agent.role.executor");
    default:
      return value;
  }
}

export function humanizeTeamRunWork(value: string | null, t: TeamRunTranslate) {
  const normalized = normalizeLabel(value);

  switch (normalized) {
    case "completed current round":
      return t("teamRun.agent.work.completedRound");
    case "drafting position card":
      return t("teamRun.agent.work.draftingPositionCard");
    case "waiting for coordinator":
      return t("teamRun.agent.work.waitingForCoordinator");
    default:
      return value;
  }
}

export function humanizeTeamRunProtocolCopy(
  value: string | null,
  t: TeamRunTranslate,
) {
  if (!value) {
    return "";
  }

  return value
    .replace(/\bTeam run started\b/g, t("teamRun.event.runStarted"))
    .replace(/\bRun queued\b/g, t("teamRun.event.queued"))
    .replace(/\bRun blocked\b/g, t("teamRun.event.blocked"))
    .replace(/\bRun resumed\b/g, t("teamRun.event.resumed"))
    .replace(/\bRun retry\b/g, t("teamRun.event.retry"))
    .replace(/Retrying queued prompt:\s*/g, "正在重试排队中的指令：")
    .replace(/Continuing from checkpoint:\s*/g, "正在从检查点继续：")
    .replace(
      /Continuing from the last pending instruction\.\s*/g,
      "正在继续上一条待处理指令。",
    )
    .replace(
      /Started run from team\s+([^\n]+)/g,
      (_match, teamName: string) => `已从协作团队 ${teamName.trim()} 启动运行`,
    )
    .replace(/\bUser follow-up\b/g, "用户跟进")
    .replace(/\bRun heartbeat\b/g, "运行心跳")
    .replace(/\bProvider preflight\b/g, "提供方预检")
    .replace(/Executing prompt:\s*/g, "正在执行提示：")
    .replace(
      /Connection checks passed for\s+([^\n]+?)(?:\.)?(?=\n|$)/g,
      (_match, providerName: string) =>
        `${providerName.trim()} 连接预检已通过。`,
    )
    .replace(
      /Round agenda:\s*focus on\s+(.+?)\s+and synthesize a checkpoint with[^\n]*/g,
      (_match, focus: string) =>
        `轮次议程：围绕 ${focus.trim()} 推进，并整理一份检查点总结。`,
    )
    .replace(/\bCoordinator agenda\b/g, "调度议程")
    .replace(/\bCoordinator\b/g, "协调者")
    .replace(/\bposition card\b/g, "立场卡")
    .replace(/\bConditional Pass\b/g, "条件通过")
    .replace(/\bCheckpoint summary\b/g, t("teamRun.event.checkpointSummary"))
    .replace(/\bScheduler Agent\b/g, t("teamRun.agent.role.scheduler"))
    .replace(/\bExecutor Agent\b/g, t("teamRun.agent.role.executor"));
}

export type TeamRunCompactionEntry = {
  kind: string;
  agentName: string | null;
  title: string;
  content: string;
};

function stripCompactionBulletPrefix(value: string) {
  return value.replace(/^\s*-\s*/, "").trim();
}

function parseCompactionEntry(value: string): TeamRunCompactionEntry | null {
  const line = stripCompactionBulletPrefix(value);
  if (!line) {
    return null;
  }

  const englishPositionCard = line.match(
    /^position_card\s*\/\s*(.+?)\s+position card[:：]\s*(.+)$/i,
  );
  if (englishPositionCard) {
    return {
      kind: "position_card",
      agentName: englishPositionCard[1].trim(),
      title: `${englishPositionCard[1].trim()} position card`,
      content: englishPositionCard[2].trim(),
    };
  }

  const chinesePositionCard = line.match(/^立场卡｜([^:：]+)[:：]\s*(.+)$/);
  if (chinesePositionCard) {
    return {
      kind: "position_card",
      agentName: chinesePositionCard[1].trim(),
      title: `立场卡｜${chinesePositionCard[1].trim()}`,
      content: chinesePositionCard[2].trim(),
    };
  }

  const mappings = [
    {
      kind: "run_started",
      patterns: [
        /^run_started\s*\/\s*([^:：]+)[:：]\s*(.+)$/i,
        /^运行开始[:：]\s*(.+)$/,
      ],
      title: "Team run started",
    },
    {
      kind: "user_instruction",
      patterns: [
        /^user_instruction\s*\/\s*([^:：]+)[:：]\s*(.+)$/i,
        /^跟进｜([^:：]+)[:：]\s*(.+)$/,
      ],
      title: "User follow-up",
    },
    {
      kind: "run_heartbeat",
      patterns: [
        /^run_heartbeat\s*\/\s*([^:：]+)[:：]\s*(.+)$/i,
        /^运行心跳｜([^:：]+)[:：]\s*(.+)$/,
      ],
      title: "Run heartbeat",
    },
    {
      kind: "provider_check_passed",
      patterns: [
        /^provider_check_passed\s*\/\s*([^:：]+)[:：]\s*(.+)$/i,
        /^提供方预检通过｜([^:：]+)[:：]\s*(.+)$/,
      ],
      title: "Provider preflight",
    },
    {
      kind: "round_agenda",
      patterns: [
        /^round_agenda\s*\/\s*([^:：]+)[:：]\s*(.+)$/i,
        /^轮次议程｜([^:：]+)[:：]\s*(.+)$/,
      ],
      title: "Coordinator agenda",
    },
    {
      kind: "checkpoint_summary",
      patterns: [
        /^checkpoint_summary\s*\/\s*([^:：]+)[:：]\s*(.+)$/i,
        /^检查点总结[:：]\s*(.+)$/,
      ],
      title: "Checkpoint summary",
    },
  ] as const;

  for (const mapping of mappings) {
    for (const pattern of mapping.patterns) {
      const match = line.match(pattern);
      if (!match) {
        continue;
      }

      if (match.length === 3) {
        return {
          kind: mapping.kind,
          agentName: null,
          title: match[1].trim() || mapping.title,
          content: match[2].trim(),
        };
      }

      return {
        kind: mapping.kind,
        agentName: null,
        title: mapping.title,
        content: match[1].trim(),
      };
    }
  }

  return null;
}

export function parseTeamRunCompactionEntries(summary: string) {
  return summary
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => parseCompactionEntry(line))
    .filter((entry): entry is TeamRunCompactionEntry => Boolean(entry));
}

export function latestCompactionAgentEntry(
  events: TeamRunEventRecord[],
  agentName: string,
) {
  for (const event of [...events].reverse()) {
    if (event.kind !== "compaction_summary") {
      continue;
    }

    const entry = [...parseTeamRunCompactionEntries(event.content)]
      .reverse()
      .find((candidate) => sameNormalizedLabel(candidate.agentName, agentName));

    if (entry) {
      return entry;
    }
  }

  return null;
}

export function compactionEntryMatchesAgent(
  entry: TeamRunCompactionEntry,
  agentName: string,
) {
  if (!entry.agentName) {
    return false;
  }

  return sameNormalizedLabel(entry.agentName, agentName);
}
