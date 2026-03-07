import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

type KnowledgeLibraryResponse = {
  id: string;
  name: string;
};

export function KnowledgePage() {
  const [library, setLibrary] = useState<KnowledgeLibraryResponse | null>(null);

  useEffect(() => {
    void invoke<KnowledgeLibraryResponse>("default_knowledge_library").then(setLibrary);
  }, []);

  return (
    <section>
      <h2>User Knowledge Base</h2>
      <p>Desktop sessions can surface a default personal knowledge library.</p>
      {library ? <p>{library.name}</p> : null}
    </section>
  );
}
