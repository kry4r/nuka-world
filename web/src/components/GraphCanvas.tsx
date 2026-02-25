"use client";

export default function GraphCanvas({
  onSelectNode,
}: {
  onSelectNode: (id: string | null) => void;
}) {
  return (
    <div className="flex-1 bg-nuka-card rounded-2xl overflow-hidden relative">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-nuka-muted text-sm mb-2">Memory Graph</div>
          <div className="text-nuka-muted text-xs">
            Requires Neo4j connection
          </div>
          <div className="mt-6 flex gap-4 justify-center">
            {["Schema A", "Schema B", "Memory 1"].map((label, i) => (
              <button
                key={i}
                onClick={() => onSelectNode(`node-${i}`)}
                className="w-16 h-16 rounded-full bg-nuka-elevated border-2 border-nuka-placeholder flex items-center justify-center text-xs text-nuka-muted hover:border-nuka-orange transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
