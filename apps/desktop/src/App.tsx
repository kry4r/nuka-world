import { KnowledgePage } from "./features/knowledge/KnowledgePage";
import { MemoryPage } from "./features/memory/MemoryPage";
import { ProvidersPage } from "./features/providers/ProvidersPage";
import { ToolInvocationPanel } from "./features/tools/ToolInvocationPanel";

export default function App() {
  return (
    <main>
      <h1>Nuka World Desktop</h1>
      <p>Rust + Tauri + React workspace bootstrap complete.</p>
      <MemoryPage />
      <KnowledgePage />
      <ProvidersPage />
      <ToolInvocationPanel />
    </main>
  );
}
