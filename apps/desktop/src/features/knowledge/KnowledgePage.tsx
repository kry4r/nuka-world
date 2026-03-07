import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Inspector } from "@/components/shell/Inspector";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

type KnowledgeLibraryResponse = {
  id: string;
  name: string;
};

export function KnowledgePage() {
  const [library, setLibrary] = useState<KnowledgeLibraryResponse>({
    id: "library-user",
    name: "Personal Library",
  });

  useEffect(() => {
    let alive = true;

    void invoke<KnowledgeLibraryResponse>("default_knowledge_library")
      .then((response) => {
        if (alive) {
          setLibrary(response);
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
        meta="Connectors and chunked retrieval"
        status="Connectors"
        tag="Knowledge"
        title="External Knowledge Connectors"
      />

      <div className="page-layout__body">
        <div className="page-layout__main">
          <Card
            description="Connect GitHub, Notion, web docs, and local vaults, then normalize them into one local library model."
            title="External Knowledge Connectors"
            tone="accent"
          />

          <div className="knowledge-row knowledge-row--four">
            <Card description="Repos, docs, issues" title="GitHub" />
            <Card description="Pages and databases" title="Notion" />
            <Card description="Sites and sitemaps" title="Web Docs" />
            <Card description="Folders, notes, files" title="Local Vaults" />
          </div>

          <Card title="Normalized Library Architecture">
            <div className="knowledge-row knowledge-row--four">
              <Card description="Top-level source space" title="Library" tone="soft" />
              <Card description="Repo, space, or folder" title="Collection" tone="soft" />
              <Card description="Page, file, or note" title="Item" tone="soft" />
              <Card description="Retrieval unit with cite" title="Chunk" tone="soft" />
            </div>
          </Card>

          <Card title="Sync and Chunk Pipeline">
            <div className="knowledge-row knowledge-row--five">
              <Card description="Pull source" title="Sync" tone="soft" />
              <Card description="Map metadata" title="Normalize" tone="soft" />
              <Card description="Split content" title="Chunk" tone="soft" />
              <Card description="Vector and filters" title="Index" tone="soft" />
              <Card description="Cited search" title="Retrieve" tone="soft" />
            </div>
          </Card>

          <div className="knowledge-row">
            <Card description={`3 collections · 148 items · 1240 chunks`} title="Library Snapshot">
              <p className="ui-card__description">{library.name}</p>
            </Card>
            <Card description="GitHub docs synced 24m ago · Notion notes queued for chunking" title="Recent Sync" />
            <Card description="Local vector store + metadata filters" title="Index Layer" />
          </div>
        </div>

        <Inspector description="Check connector scope, chunk strategy, and index health." title="Connection Inspector">
          <Card description="GitHub · product docs repo" title="Selected Connector" />
          <Card description="Docs folder, release notes, issues" title="Sync Scope" />
          <Card description="Semantic chunks with source citations" title="Chunking" />
          <Card description="Local vector and metadata filters" title="Index Layer" />
        </Inspector>
      </div>
    </div>
  );
}
