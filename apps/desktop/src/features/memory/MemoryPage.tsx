import { useEffect, useState } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import {
  getMemoryNodeDetail,
  listMemoryByWorkflow,
  listMemoryScopes,
  type MemoryNodeDetail,
  type MemoryScopeRecord,
} from "@/lib/memory";

export function MemoryPage() {
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [nodes, setNodes] = useState<MemoryScopeRecord[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<MemoryNodeDetail | null>(null);

  const loadNodes = async (workflowId?: string) => {
    const nextWorkflowId = workflowId?.trim() ?? "";
    const nextNodes = nextWorkflowId
      ? await listMemoryByWorkflow(nextWorkflowId)
      : await listMemoryScopes();

    setNodes(nextNodes);
    setSelectedNodeId(nextNodes[0]?.id ?? null);
  };

  useEffect(() => {
    void loadNodes();
  }, []);

  useEffect(() => {
    if (!selectedNodeId) {
      setSelectedDetail(null);
      return;
    }

    let alive = true;
    void getMemoryNodeDetail(selectedNodeId)
      .then((detail) => {
        if (alive) {
          setSelectedDetail(detail);
        }
      })
      .catch(() => {
        if (alive) {
          setSelectedDetail(null);
        }
      });

    return () => {
      alive = false;
    };
  }, [selectedNodeId]);

  return (
    <div className="page-layout">
      <div className="page-layout__body">
        <div className="page-layout__main">
          <Card
            description="Browse saved memory scopes by workflow and inspect their real workflow, session, and agent links."
            title="Workflow-linked Memory"
            tone="accent"
          />

          <Card title="Browse Memory">
            <div className="split-row">
              <input
                aria-label="Workflow filter"
                className="field-input"
                onChange={(event) => setWorkflowFilter(event.target.value)}
                placeholder="Filter by workflow id"
                value={workflowFilter}
              />
              <button className="composer__send" onClick={() => void loadNodes(workflowFilter)} type="button">
                Load Workflow Memory
              </button>
            </div>
          </Card>

          {nodes.length === 0 ? (
            <Card description="Save a workflow, session, or agent-linked scope to inspect it here." title="No memory nodes yet." tone="soft" />
          ) : (
            <Card title="Memory Nodes">
              <div className="workflow-grid">
                {nodes.map((node) => (
                  <button
                    className="settings-panel__trigger"
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    type="button"
                  >
                    <Card
                      description={[node.kind, node.workflowId, node.sessionId, node.agentId].filter(Boolean).join(" �� ")}
                      title={node.title}
                      tone={node.id === selectedNodeId ? "accent" : "soft"}
                    />
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>

        <Inspector description="Shows the selected memory node and its real workflow/session/agent metadata." title="Node Details">
          {selectedDetail ? (
            <>
              <Card description={selectedDetail.title} title="Selected Node" tone="accent" />
              <Card description={selectedDetail.kind} title="Node Kind" tone="soft" />
              <Card description={selectedDetail.workflowId ?? "Not linked"} title="Workflow" tone="soft" />
              <Card description={selectedDetail.sessionId ?? "Not linked"} title="Session" tone="soft" />
              <Card description={selectedDetail.agentId ?? "Not linked"} title="Agent" tone="soft" />
              <Card description={selectedDetail.relatedIds.join(", ") || "No related ids"} title="Related IDs" tone="soft" />
              {selectedDetail.body ? <Card description={selectedDetail.body} title="Summary" tone="soft" /> : null}
            </>
          ) : (
            <Card description="Select a memory node to inspect its workflow-linked metadata." title="Node Details" tone="soft" />
          )}
        </Inspector>
      </div>
    </div>
  );
}
