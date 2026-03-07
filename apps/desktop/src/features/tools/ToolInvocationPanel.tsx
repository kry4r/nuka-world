import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { IntegratedToolSessionCard } from "./IntegratedToolSessionCard";

type IntegratedToolPolicyResponse = {
  toolName: string;
  targetScope: string;
};

const TOOL_NAMES = ["codex", "claude_code"];

export function ToolInvocationPanel() {
  const [policies, setPolicies] = useState<IntegratedToolPolicyResponse[]>([]);

  useEffect(() => {
    void Promise.all(
      TOOL_NAMES.map((toolName) =>
        invoke<IntegratedToolPolicyResponse>("integrated_tool_output_policy", { toolName }),
      ),
    ).then(setPolicies);
  }, []);

  return (
    <section>
      <h2>Integrated Coding Tools</h2>
      <div>
        {policies.map((tool) => (
          <IntegratedToolSessionCard
            key={tool.toolName}
            toolName={tool.toolName}
            targetScope={tool.targetScope}
          />
        ))}
      </div>
    </section>
  );
}
