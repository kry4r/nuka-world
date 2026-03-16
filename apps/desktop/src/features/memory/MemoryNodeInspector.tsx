import { useEffect, useState } from "react";
import { FlatSelect } from "@/components/ui/FlatSelect";
import type {
  MemoryConsolidationState,
  MemoryGraphEdge,
  MemoryGraphNode,
  MemoryTraceType,
} from "@/lib/memory";

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
  const [relation, setRelation] = useState("关联");

  const availableTargets = nodes.filter((candidate) => candidate.id !== node?.id);
  const defaultTargetId = availableTargets[0]?.id ?? "";

  useEffect(() => {
    setTargetId(defaultTargetId);
    setRelation("关联");
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
          <span className="memory-page__eyebrow">节点详情</span>
          <h2>{node.title}</h2>
        </div>
        <button
          aria-label="Close node detail"
          className="memory-node-detail__dismiss"
          onClick={onClose}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="memory-node-detail__dismiss-icon"
            viewBox="0 0 16 16"
          >
            <path d="M4 4l8 8M12 4 4 12" />
          </svg>
        </button>
      </div>
      <div className="memory-node-detail__actions">
        <button className="memory-node-detail__action is-primary" disabled={busy} onClick={() => void onSave()} type="button">
          保存节点
        </button>
        <button className="memory-node-detail__action is-danger" disabled={busy} onClick={onRequestDelete} type="button">
          删除节点
        </button>
      </div>

      <div className="memory-node-detail__grid">
        <label className="memory-node-detail__field memory-node-detail__field--full">
          <span className="memory-node-detail__label">标题</span>
          <input
            aria-label="Node title"
            className="memory-node-detail__input"
            onChange={(event) => onTitleDraftChange(event.target.value)}
            value={titleDraft}
          />
        </label>

        <label className="memory-node-detail__field memory-node-detail__field--full">
          <span className="memory-node-detail__label">内容</span>
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
            <h3>记忆状态</h3>
            <span>{memoryKindLabel(node.kind)}</span>
          </div>
          <dl className="memory-node-detail__meta">
            <div>
              <dt>记录类型</dt>
              <dd>{memoryTraceTypeLabel(node.traceType)}</dd>
            </div>
            <div>
              <dt>沉淀状态</dt>
              <dd>{memoryConsolidationStateLabel(node.consolidationState)}</dd>
            </div>
          </dl>
        </section>

        <section className="memory-node-detail__panel memory-node-detail__panel--links">
          <div className="memory-node-detail__panel-header">
            <h3>关联关系</h3>
            <span>{connectedEdges.length} 条关联</span>
          </div>

          <div className="memory-node-detail__link-form">
            <label className="memory-node-detail__field">
              <span className="memory-node-detail__label">连接到</span>
              <FlatSelect
                aria-label="Link target"
                className="memory-node-detail__select"
                onChange={(event) => setTargetId(event.target.value)}
                shellClassName="memory-node-detail__select-shell"
                value={targetId}
              >
                {availableTargets.length === 0 ? <option value="">没有可连接的节点</option> : null}
                {availableTargets.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </FlatSelect>
            </label>

            <label className="memory-node-detail__field">
              <span className="memory-node-detail__label">关系</span>
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
              新建连接
            </button>
          </div>

          <div className="memory-node-detail__link-list">
            {connectedEdges.length === 0 ? (
              <p className="memory-node-detail__empty">还没有关联。</p>
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
                      移除关联
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
            <h3>删除影响</h3>
            <span>{deleteImpact.edgeCount} 条关联</span>
          </div>

          <p className="memory-node-detail__warning-copy">
            会一起移除 {deleteImpact.edgeCount} 条关联。
          </p>
          <div className="memory-node-detail__warning-list">
            {deleteImpact.connectedTitles.length === 0 ? (
              <span>这个节点目前没有关联邻居。</span>
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
              保留节点
            </button>
            <button
              className="memory-node-detail__action is-danger"
              disabled={busy}
              onClick={() => void onConfirmDelete()}
              type="button"
            >
              确认删除
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="memory-node-detail__error">
          <strong>记忆图错误</strong>
          <span>{error}</span>
        </section>
      ) : null}
    </div>
  );
}

function memoryKindLabel(kind: string) {
  switch (kind) {
    case "workflow":
      return "工作流";
    case "session":
      return "对话";
    case "agent":
      return "智能体";
    case "message":
      return "回复";
    case "fact":
      return "要点";
    default:
      return kind;
  }
}

function memoryTraceTypeLabel(traceType: MemoryTraceType) {
  switch (traceType) {
    case "semantic":
      return "结论";
    case "episodic":
      return "过程";
    case "working":
    default:
      return "临时";
  }
}

function memoryConsolidationStateLabel(state: MemoryConsolidationState) {
  switch (state) {
    case "candidate":
      return "待整理";
    case "approved":
      return "已采纳";
    case "rejected":
      return "不保留";
    case "archived":
      return "已归档";
    case "none":
    default:
      return "未整理";
  }
}
