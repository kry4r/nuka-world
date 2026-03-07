import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

type MemoryPromotionResponse = {
  canPromote: boolean;
};

export function MemoryPage() {
  const [canPromote, setCanPromote] = useState<boolean | null>(null);

  useEffect(() => {
    void invoke<MemoryPromotionResponse>("memory_promotion_policy", { savedWorkflow: true }).then(
      (response) => setCanPromote(response.canPromote),
    );
  }, []);

  return (
    <section>
      <h2>Layered Memory</h2>
      <p>Saved workflows can promote session memory into shared memory.</p>
      {canPromote !== null ? <p>Promotion enabled: {canPromote ? "yes" : "no"}</p> : null}
    </section>
  );
}
