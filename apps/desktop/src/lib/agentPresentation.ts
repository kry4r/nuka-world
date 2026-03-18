import type { AgentArchetypeRecord } from "./agents";

const TEXT_MAP: Record<string, string> = {
  "Avoid unsupported claims": "避免没有依据的结论",
  "Avoid unsupported or destructive actions": "避免无依据或破坏性操作",
  "Calm and evidence-first": "冷静、证据优先",
  "Clear and directive": "清晰直接，便于执行",
  "Clear and pragmatic": "表达清晰，务实推进",
  "Escalate on unresolved blockers": "未解决阻塞时升级处理",
  "Escalate when evidence conflicts": "证据冲突时升级处理",
  "Escalate when blocked or when risk rises": "阻塞时升级，风险升高时也要升级",
  "General Operator": "通用执行者",
  "General execution": "通用执行",
  "Household Planner": "家庭事务规划者",
  "Investigate and summarize": "先调查，再归纳结论",
  "Keep durable findings": "保留可复用的重要发现",
  "Operational follow-through": "流程推进与闭环",
  "Operations Coordinator": "流程协调者",
  "Pause before destructive actions": "涉及破坏性动作前先暂停确认",
  "Plan, coordinate, and close loops": "规划、协调并推动闭环",
  "Prefer low-cost coordination tools": "优先使用低成本的协调类工具",
  "Prefer search and synthesis": "优先检索与归纳",
  "Research Analyst": "研究分析者",
  "Research synthesis": "研究归纳",
  "Retain durable checkpoints": "保留关键检查点",
  "Retain durable context and drop transient chatter": "保留长期上下文，丢弃短期噪音",
  "Return a checkpoint plan": "输出可执行的检查点计划",
  "Return a concise actionable result": "输出简洁且可执行的结果",
  "Return a findings brief": "输出一份发现简报",
  "Synthesis and retrieval": "信息检索与归纳",
  "Understand the goal and move it forward": "理解目标并持续推进",
  "Use the least-cost tool that can finish the work":
    "优先选择能完成任务的最低成本工具",
  general: "通用",
  household_and_personal_logistics: "家庭与个人事务",
  operations: "运营流程",
  research_and_analysis: "研究分析",
};

function replaceExact(value: string) {
  return TEXT_MAP[value] ?? value;
}

function translatedGeneratedRole(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized === "scheduler agent") {
    return "调度智能体";
  }

  if (normalized === "executor agent") {
    return "执行智能体";
  }

  if (normalized === "coordinator") {
    return "协调者";
  }

  return replaceExact(value.trim());
}

export function humanizeGeneratedAgentDescription(value: string | null) {
  if (!value) {
    return "";
  }

  if (value === "Contribute as Scheduler Agent for the team goal.") {
    return "以调度智能体身份推进当前协作团队目标。";
  }

  if (value === "Contribute as Executor Agent for the team goal.") {
    return "以执行智能体身份推进当前协作团队目标。";
  }

  if (
    value === "Scheduler Agent: Contribute as Scheduler Agent for the team goal."
  ) {
    return "以调度智能体身份推进当前协作团队目标。";
  }

  if (
    value === "Executor Agent: Contribute as Executor Agent for the team goal."
  ) {
    return "以执行智能体身份推进当前协作团队目标。";
  }

  const genericFallback = value.match(
    /^(?:.+:\s*)?Contribute as (.+?) for the team goal\.\s*$/i,
  );
  if (genericFallback) {
    return `以${translatedGeneratedRole(genericFallback[1] ?? "")}身份推进当前协作团队目标。`;
  }

  return replaceExact(value);
}

export function humanizeGeneratedAgentRole(value: string | null) {
  if (!value) {
    return "";
  }

  if (value === "Scheduler Agent") {
    return "调度智能体";
  }

  if (value === "Executor Agent") {
    return "执行智能体";
  }

  if (value === "Coordinator") {
    return "协调者";
  }

  return replaceExact(value);
}

export function humanizeGeneratedAgentSystemPrompt(
  value: string | null,
  agentName?: string,
) {
  if (!value) {
    return "";
  }

  const schedulerMatch = value.match(
    /^Act as (.+) in the Scheduler Agent role and focus on Contribute as Scheduler Agent for the team goal\.\.?$/i,
  );
  if (schedulerMatch) {
    return `以${agentName ?? schedulerMatch[1]}的身份承担调度智能体职责，围绕当前协作团队目标推进工作。`;
  }

  const executorMatch = value.match(
    /^Act as (.+) in the Executor Agent role and focus on Contribute as Executor Agent for the team goal\.\.?$/i,
  );
  if (executorMatch) {
    return `以${agentName ?? executorMatch[1]}的身份承担执行智能体职责，围绕当前协作团队目标推进工作。`;
  }

  if (value === "Summarize findings and cite sources.") {
    return "归纳发现并标注来源。";
  }

  if (value === "Write concise weekly release digests.") {
    return "撰写简洁的每周发布摘要。";
  }

  const genericPrompt = value.match(
    /^Act as (.+) in the (.+?) role and focus on Contribute as (.+?) for the team goal\.\.?$/i,
  );
  if (genericPrompt) {
    return `以${agentName ?? genericPrompt[1]}的身份承担${translatedGeneratedRole(genericPrompt[2] ?? genericPrompt[3] ?? "")}职责，围绕当前协作团队目标推进工作。`;
  }

  return replaceExact(value);
}

export function humanizeArchetype(
  archetype: AgentArchetypeRecord,
): AgentArchetypeRecord {
  return {
    ...archetype,
    communicationStyle: replaceExact(archetype.communicationStyle),
    defaultToolPosture: replaceExact(archetype.defaultToolPosture),
    domainFocus: replaceExact(archetype.domainFocus),
    escalationPosture: replaceExact(archetype.escalationPosture),
    family: replaceExact(archetype.family),
    memoryPosture: replaceExact(archetype.memoryPosture),
    objectivePattern: replaceExact(archetype.objectivePattern),
    outputContract: replaceExact(archetype.outputContract),
    safetyPosture: replaceExact(archetype.safetyPosture),
    title: replaceExact(archetype.title),
  };
}
