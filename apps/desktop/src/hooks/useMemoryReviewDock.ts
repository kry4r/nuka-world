import { useEffect, useState } from "react";
import {
  listPendingMemoryCandidates,
  reviewMemoryCandidate,
  type MemoryCandidate,
  type MemoryReviewDecision,
  type MemoryReviewSurface,
} from "@/lib/memory";

export type MemoryReviewDockState = {
  candidate: MemoryCandidate | null;
  applyDecision: (decision: MemoryReviewDecision) => Promise<void>;
  isLoading: boolean;
  isApplying: boolean;
  error: string | null;
};

export function useMemoryReviewDock(
  surface: MemoryReviewSurface,
  ownerId: string | null,
  refreshKey: number | string | null = null,
): MemoryReviewDockState {
  const [queue, setQueue] = useState<MemoryCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!ownerId) {
      setQueue([]);
      setError(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setError(null);
    setQueue([]);

    void listPendingMemoryCandidates(surface, ownerId)
      .then((items) => {
        if (cancelled) {
          return;
        }

        setQueue(items);
      })
      .catch((caughtError) => {
        if (cancelled) {
          return;
        }

        const message =
          caughtError instanceof Error ? caughtError.message : String(caughtError);
        setError(message);
        setQueue([]);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ownerId, refreshKey, surface]);

  const candidate = queue[0] ?? null;

  return {
    candidate,
    applyDecision: async (decision: MemoryReviewDecision) => {
      if (!candidate) {
        return;
      }

      setIsApplying(true);
      setError(null);

      try {
        await reviewMemoryCandidate(candidate.id, decision);
        setQueue((current) => current.filter((item) => item.id !== candidate.id));
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : String(caughtError);
        setError(message);
      } finally {
        setIsApplying(false);
      }
    },
    isLoading,
    isApplying,
    error,
  };
}
