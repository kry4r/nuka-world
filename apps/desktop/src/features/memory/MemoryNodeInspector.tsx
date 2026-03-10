import { useEffect, useState, type CSSProperties } from "react";
import { Card } from "@/components/ui/Card";
import type { MemoryGraphEdge, MemoryGraphNode } from "@/lib/memory";

const inputSurfaceStyle = {
  background: "rgba(255, 255, 255, 0.04)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "0.95rem",
  color: "rgba(248, 244, 236, 0.96)",
  padding: "0.8rem 0.95rem",
  width: "100%",
} satisfies CSSProperties;

type MemoryNodeInspectorProps = {
  busy: boolean;
  connectedEdges: MemoryGraphEdge[];
  deleteImpact: {
    connectedTitles: string[];
    edgeCount: number;
  } | null;
  error: string | null;
  node: MemoryGraphNode | null;
  nodes: MemoryGraphNode[];
  titleDraft: string;
  bodyDraft: string;
  onCancelDelete: () => void;
  onBodyDraftChange: (value: string) => void;
  onConfirmDelete: () => Promise<void>;
  onCreateEdge: (targetId: string, relation: string) => Promise<void>;
  onDeleteEdge: (edgeId: string) => Promise<void>;
  onRequestDelete: () => void;
  onSave: () => Promise<void>;
  onTitleDraftChange: (value: string) => void;
};

export function MemoryNodeInspector({
  busy,
  connectedEdges,
  deleteImpact,
  error,
  node,
  nodes,
  titleDraft,
  bodyDraft,
  onCancelDelete,
  onBodyDraftChange,
  onConfirmDelete,
  onCreateEdge,
  onDeleteEdge,
  onRequestDelete,
  onSave,
  onTitleDraftChange,
}: MemoryNodeInspectorProps) {
  const [targetId, setTargetId] = useState("");
  const [relation, setRelation] = useState("relates");

  const availableTargets = nodes.filter((candidate) => candidate.id !== node?.id);
  const defaultTargetId = availableTargets[0]?.id ?? "";

  useEffect(() => {
    setTargetId(defaultTargetId);
    setRelation("relates");
  }, [defaultTargetId, node?.id]);

  if (!node) {
    return (
      <Card
        description="Select a node in the graph to edit its note, delete it, or manage its links."
        title="No node selected"
        tone="soft"
      />
    );
  }

  const handleCreateEdge = async () => {
    if (!targetId || !relation.trim()) {
      return;
    }

    await onCreateEdge(targetId, relation.trim());
  };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Card title="Selected Node" tone="accent">
        <div style={{ display: "grid", gap: "0.9rem" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>Title</span>
            <input
              aria-label="Node title"
              className="field-input"
              onChange={(event) => onTitleDraftChange(event.target.value)}
              style={inputSurfaceStyle}
              value={titleDraft}
            />
          </label>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>Body</span>
            <textarea
              aria-label="Node body"
              onChange={(event) => onBodyDraftChange(event.target.value)}
              rows={6}
              style={{ ...inputSurfaceStyle, minHeight: "8.5rem", resize: "vertical" }}
              value={bodyDraft}
            />
          </label>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button className="composer__send" disabled={busy} onClick={() => void onSave()} type="button">
              Save node
            </button>
            <button className="settings-panel__trigger" disabled={busy} onClick={onRequestDelete} type="button">
              Delete node
            </button>
          </div>
        </div>
      </Card>

      <Card title="Memory State" tone="soft">
        <div style={{ display: "grid", gap: "0.55rem" }}>
          <div style={{ display: "grid", gap: "0.15rem" }}>
            <strong>Trace type</strong>
            <span style={{ color: "rgba(248, 244, 236, 0.72)" }}>{node.traceType}</span>
          </div>
          <div style={{ display: "grid", gap: "0.15rem" }}>
            <strong>Consolidation state</strong>
            <span style={{ color: "rgba(248, 244, 236, 0.72)" }}>
              {node.consolidationState}
            </span>
          </div>
        </div>
      </Card>

      {deleteImpact ? (
        <Card
          description={`${deleteImpact.edgeCount} connected links will be removed.`}
          title="Delete impact"
          tone="soft"
        >
          <div style={{ display: "grid", gap: "0.8rem" }}>
            <div style={{ display: "grid", gap: "0.35rem" }}>
              {deleteImpact.connectedTitles.length === 0 ? (
                <p style={{ color: "rgba(248, 244, 236, 0.68)", margin: 0 }}>
                  This node has no linked neighbors.
                </p>
              ) : (
                deleteImpact.connectedTitles.map((title) => (
                  <span key={title} style={{ color: "rgba(248, 244, 236, 0.78)" }}>
                    {title}
                  </span>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                className="settings-panel__trigger"
                disabled={busy}
                onClick={onCancelDelete}
                type="button"
              >
                Keep node
              </button>
              <button
                className="settings-button settings-button--danger"
                disabled={busy}
                onClick={() => void onConfirmDelete()}
                type="button"
              >
                Confirm delete
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card description={`Kind: ${node.kind}`} title="Graph Links" tone="soft">
        <div style={{ display: "grid", gap: "0.8rem" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>Link target</span>
            <select
              aria-label="Link target"
              onChange={(event) => setTargetId(event.target.value)}
              style={inputSurfaceStyle}
              value={targetId}
            >
              {availableTargets.length === 0 ? <option value="">No other nodes</option> : null}
              {availableTargets.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>Relation</span>
            <input
              aria-label="Edge relation"
              className="field-input"
              onChange={(event) => setRelation(event.target.value)}
              style={inputSurfaceStyle}
              value={relation}
            />
          </label>

          <button
            className="settings-panel__trigger"
            disabled={busy || !targetId || !relation.trim()}
            onClick={() => void handleCreateEdge()}
            type="button"
          >
            Create link
          </button>

          <div style={{ display: "grid", gap: "0.6rem" }}>
            {connectedEdges.length === 0 ? (
              <p style={{ color: "rgba(248, 244, 236, 0.68)", margin: 0 }}>No connected edges yet.</p>
            ) : (
              connectedEdges.map((edge) => {
                const peerId = edge.sourceId === node.id ? edge.targetId : edge.sourceId;
                const peer = nodes.find((candidate) => candidate.id === peerId);

                return (
                  <div
                    key={edge.id}
                    style={{
                      alignItems: "center",
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "1rem",
                      display: "flex",
                      gap: "0.75rem",
                      justifyContent: "space-between",
                      padding: "0.85rem 1rem",
                    }}
                  >
                    <div style={{ display: "grid", gap: "0.2rem" }}>
                      <strong>{edge.relation}</strong>
                      <span style={{ color: "rgba(248, 244, 236, 0.68)", fontSize: "0.9rem" }}>
                        {peer?.title ?? peerId}
                      </span>
                    </div>
                    <button className="settings-panel__trigger" disabled={busy} onClick={() => void onDeleteEdge(edge.id)} type="button">
                      Remove edge
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Card>

      {error ? <Card description={error} title="Memory graph error" tone="soft" /> : null}
    </div>
  );
}
