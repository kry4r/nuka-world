"use client";

export default function NodeDetailPanel({
  nodeId,
}: {
  nodeId: string | null;
}) {
  if (!nodeId) {
    return (
      <div className="w-[300px] bg-nuka-card rounded-2xl p-5 flex items-center justify-center">
        <span className="text-xs text-nuka-muted">
          Select a node to view details
        </span>
      </div>
    );
  }

  return (
    <div className="w-[300px] bg-nuka-card rounded-2xl p-5 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="font-[var(--font-oswald)] text-sm font-bold text-white">
          NODE DETAILS
        </span>
        <span className="text-xs text-nuka-muted">ID: {nodeId}</span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-nuka-muted">TYPE</span>
        <span className="text-sm text-white">Schema</span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-nuka-muted">CONNECTIONS</span>
        <span className="text-sm text-nuka-teal">3 linked nodes</span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-nuka-muted">ACTIVATION</span>
        <div className="w-full h-2 bg-nuka-elevated rounded-full">
          <div className="w-2/3 h-full bg-nuka-orange rounded-full" />
        </div>
      </div>
    </div>
  );
}
