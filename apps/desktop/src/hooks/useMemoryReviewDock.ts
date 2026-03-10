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
  queueCount: number;
  queuePosition: number;
  selectedDecision: MemoryReviewDecision;
  setSelectedDecision: (decision: MemoryReviewDecision) => void;
  applyDecision: () => Promise<void>;
  isLoading: boolean;
  isApplying: boolean;
  error: string | null;
};

const DEFAULT_DECISION: MemoryReviewDecision = "promote_semantic";

export function useMemoryReviewDock(
  surface: MemoryReviewSurface,
  ownerId: string | null,
  refreshKey: number | string | null = null,
): MemoryReviewDockState {
  const [queue, setQueue] = useState<MemoryCandidate[]>([]);
  const [selectedDecision, setSelectedDecision] =
    useState<MemoryReviewDecision>(DEFAULT_DECISION);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!ownerId) {
      setQueue([]);
      setError(null);
      setIsLoading(false);
      setSelectedDecision(DEFAULT_DECISION);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setError(null);
    setQueue([]);
    setSelectedDecision(DEFAULT_DECISION);

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
    queueCount: queue.length,
    queuePosition: candidate ? 1 : 0,
    selectedDecision,
    setSelectedDecision,
    applyDecision: async () => {
      if (!candidate) {
        return;
      }

      setIsApplying(true);
      setError(null);

      try {
        await reviewMemoryCandidate(candidate.id, selectedDecision);
        setQueue((current) => current.filter((item) => item.id !== candidate.id));
        setSelectedDecision(DEFAULT_DECISION);
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
