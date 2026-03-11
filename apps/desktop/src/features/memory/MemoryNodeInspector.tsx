import { useEffect, useState } from "react";
import type { MemoryGraphEdge, MemoryGraphNode } from "@/lib/memory";

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
  onClose: () => void;
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
  onClose,
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
    return null;
  }

  const handleCreateEdge = async () => {
    if (!targetId || !relation.trim()) {
      return;
    }

    await onCreateEdge(targetId, relation.trim());
  };

  return (
    <div className="memory-node-detail">
      <div className="memory-node-detail__header">
        <div className="memory-node-detail__copy">
          <span className="memory-page__eyebrow">Node detail</span>
          <h2>{node.title}</h2>
          <p>Update local memory, review consolidation state, and manage connected edges inline.</p>
        </div>
        <div className="memory-node-detail__actions">
          <button className="memory-node-detail__action" onClick={onClose} type="button">
            Close detail
          </button>
          <button className="memory-node-detail__action is-primary" disabled={busy} onClick={() => void onSave()} type="button">
            Save node
          </button>
          <button className="memory-node-detail__action is-danger" disabled={busy} onClick={onRequestDelete} type="button">
            Delete node
          </button>
        </div>
      </div>

      <div className="memory-node-detail__grid">
        <label className="memory-node-detail__field memory-node-detail__field--full">
          <span className="memory-node-detail__label">Title</span>
          <input
            aria-label="Node title"
            className="memory-node-detail__input"
            onChange={(event) => onTitleDraftChange(event.target.value)}
            value={titleDraft}
          />
        </label>

        <label className="memory-node-detail__field memory-node-detail__field--full">
          <span className="memory-node-detail__label">Body</span>
          <textarea
            aria-label="Node body"
            className="memory-node-detail__textarea"
            onChange={(event) => onBodyDraftChange(event.target.value)}
            rows={6}
            value={bodyDraft}
          />
        </label>

        <section className="memory-node-detail__panel">
          <div className="memory-node-detail__panel-header">
            <h3>Memory state</h3>
            <span>{node.kind}</span>
          </div>
          <dl className="memory-node-detail__meta">
            <div>
              <dt>Trace type</dt>
              <dd>{node.traceType}</dd>
            </div>
            <div>
              <dt>Consolidation state</dt>
              <dd>{node.consolidationState}</dd>
            </div>
          </dl>
        </section>

        <section className="memory-node-detail__panel memory-node-detail__panel--links">
          <div className="memory-node-detail__panel-header">
            <h3>Graph links</h3>
            <span>{connectedEdges.length} connected</span>
          </div>

          <div className="memory-node-detail__link-form">
            <label className="memory-node-detail__field">
              <span className="memory-node-detail__label">Link target</span>
              <select
                aria-label="Link target"
                className="memory-node-detail__select"
                onChange={(event) => setTargetId(event.target.value)}
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

            <label className="memory-node-detail__field">
              <span className="memory-node-detail__label">Relation</span>
              <input
                aria-label="Edge relation"
                className="memory-node-detail__input"
                onChange={(event) => setRelation(event.target.value)}
                value={relation}
              />
            </label>

            <button
              className="memory-node-detail__action"
              disabled={busy || !targetId || !relation.trim()}
              onClick={() => void handleCreateEdge()}
              type="button"
            >
              Create link
            </button>
          </div>

          <div className="memory-node-detail__link-list">
            {connectedEdges.length === 0 ? (
              <p className="memory-node-detail__empty">No connected edges yet.</p>
            ) : (
              connectedEdges.map((edge) => {
                const peerId = edge.sourceId === node.id ? edge.targetId : edge.sourceId;
                const peer = nodes.find((candidate) => candidate.id === peerId);

                return (
                  <div className="memory-node-detail__link-row" key={edge.id}>
                    <div className="memory-node-detail__link-copy">
                      <strong>{edge.relation}</strong>
                      <span>{peer?.title ?? peerId}</span>
                    </div>
                    <button className="memory-node-detail__action" disabled={busy} onClick={() => void onDeleteEdge(edge.id)} type="button">
                      Remove edge
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {deleteImpact ? (
        <section className="memory-node-detail__panel memory-node-detail__panel--warning">
          <div className="memory-node-detail__panel-header">
            <h3>Delete impact</h3>
            <span>{deleteImpact.edgeCount} links</span>
          </div>

          <p className="memory-node-detail__warning-copy">
            {deleteImpact.edgeCount} connected links will be removed.
          </p>
          <div className="memory-node-detail__warning-list">
            {deleteImpact.connectedTitles.length === 0 ? (
              <span>This node has no linked neighbors.</span>
            ) : (
              deleteImpact.connectedTitles.map((title) => <span key={title}>{title}</span>)
            )}
          </div>
          <div className="memory-node-detail__actions">
            <button
              className="memory-node-detail__action"
              disabled={busy}
              onClick={onCancelDelete}
              type="button"
            >
              Keep node
            </button>
            <button
              className="memory-node-detail__action is-danger"
              disabled={busy}
              onClick={() => void onConfirmDelete()}
              type="button"
            >
              Confirm delete
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="memory-node-detail__error">
          <strong>Memory graph error</strong>
          <span>{error}</span>
        </section>
      ) : null}
    </div>
  );
}
