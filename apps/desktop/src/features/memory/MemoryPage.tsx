import { invoke } from "@tauri-apps/api/core";
import { type CSSProperties, useEffect, useState } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

type MemoryPromotionResponse = {
  canPromote: boolean;
};

type MemoryNodeProps = {
  className?: string;
  description?: string;
  meta?: string;
  style: CSSProperties;
  title: string;
};

function MemoryNode({ className, description, meta, style, title }: MemoryNodeProps) {
  return (
    <article className={["memory-node", className].filter(Boolean).join(" ")} style={style}>
      <span className="memory-node__title">{title}</span>
      {meta ? <span className="memory-node__meta">{meta}</span> : null}
      {description ? <span className="memory-node__text">{description}</span> : null}
    </article>
  );
}

export function MemoryPage() {
  const [canPromote, setCanPromote] = useState(false);

  useEffect(() => {
    let alive = true;

    void invoke<MemoryPromotionResponse>("memory_promotion_policy", { savedWorkflow: true })
      .then((response) => {
        if (alive) {
          setCanPromote(response.canPromote);
        }
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="page-layout">
      <SectionHeader
        meta="Layered graph view"
        status="Graph View"
        tag="Memory"
        title="Schema Memory Graph"
      />

      <div className="page-layout__body">
        <div className="page-layout__main">
          <Card
            description="Inspect how memory nodes connect across layers and subjects."
            title="Schema Memory Graph"
            tone="accent"
          />

          <div className="memory-graph">
            <span className="memory-graph__hint memory-graph__hint--top">
              Layers · Global User · Main World · Workflow · Session · Agent
            </span>
            <span className="memory-graph__hint memory-graph__hint--second">
              Subjects · World · Workflow · Researcher · Reviewer
            </span>

            <div className="memory-graph__edge" style={{ height: 2, left: 236, top: 92, width: 110 }} />
            <div className="memory-graph__edge" style={{ height: 2, left: 236, top: 216, width: 124 }} />
            <div className="memory-graph__edge" style={{ height: 78, left: 410, top: 250, width: 2 }} />
            <div className="memory-graph__edge" style={{ height: 2, left: 534, top: 216, width: 126 }} />
            <div className="memory-graph__edge" style={{ height: 2, left: 534, top: 92, width: 124 }} />
            <div className="memory-graph__edge" style={{ height: 2, left: 534, top: 338, width: 124 }} />

            <MemoryNode meta="Patterns and long-term prefs" style={{ left: 58, top: 58, width: 176 }} title="Global User" />
            <MemoryNode meta="Shared world memory" style={{ left: 58, top: 182, width: 184 }} title="Main World" />
            <MemoryNode meta="Reusable workflow facts" style={{ left: 244, top: 316, width: 184 }} title="Workflow Shared" />
            <MemoryNode
              className="memory-node--focus"
              description="Active inside Session with links to user, workflow, and agents."
              meta="Selected subject"
              style={{ left: 350, top: 152, width: 192 }}
              title="World"
            />
            <MemoryNode className="memory-node--session" meta="Current conversation state" style={{ left: 548, top: 182, width: 178 }} title="Session" />
            <MemoryNode meta="Recall and notes" style={{ left: 668, top: 56, width: 170 }} title="Agent · Researcher" />
            <MemoryNode meta="Checks and traces" style={{ left: 668, top: 316, width: 170 }} title="Agent · Reviewer" />
          </div>
        </div>

        <Inspector description="Switch layer first, then change subject focus." title="Node Details">
          <Card description="World" title="Selected Subject" />
          <Card description="Session" title="Active Layer" />
          <Card description="User, Main World, Workflow, Researcher, Reviewer" title="Related Nodes" />
          <Card
            description={
              canPromote
                ? "Session facts can promote into workflow or world memory."
                : "Promotion is disabled for this workflow."
            }
            title="Promotion Rule"
          />
        </Inspector>
      </div>
    </div>
  );
}
