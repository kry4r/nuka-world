"use client";

import { useState } from "react";
import PageLayout from "@/components/PageLayout";
import PageHeader from "@/components/PageHeader";
import GraphCanvas from "@/components/GraphCanvas";
import NodeDetailPanel from "@/components/NodeDetailPanel";

export default function MemoryPage() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  return (
    <PageLayout>
      <div className="flex flex-col gap-6 p-10 px-12 h-screen">
        <PageHeader title="MEMORY GRAPH" subtitle="Neo4j Knowledge Graph" />

        <div className="flex gap-4 flex-1 min-h-0">
          <GraphCanvas onSelectNode={setSelectedNode} />
          <NodeDetailPanel nodeId={selectedNode} />
        </div>
      </div>
    </PageLayout>
  );
}
