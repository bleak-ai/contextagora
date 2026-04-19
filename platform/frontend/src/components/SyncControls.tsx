import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  fetchSyncStatus,
  pullSync,
  pushSync,
  type SyncStatus,
} from "../api/sync";
import { ApiError } from "../api/client";

export function SyncControls() {
  const qc = useQueryClient();

  const { data } = useQuery<SyncStatus>({
    queryKey: ["sync-status"],
    queryFn: fetchSyncStatus,
    refetchInterval: 30_000,
  });

  const pull = useMutation({
    mutationFn: pullSync,
    onSuccess: (data) => {
      qc.setQueryData(["sync-status"], data.sync);
      qc.invalidateQueries({ queryKey: ["modules"] });
    },
    onError: () => {
      setTimeout(() => pull.reset(), 4000);
    },
  });

  const push = useMutation({
    mutationFn: (message: string) => pushSync(message),
    onSuccess: (data) => {
      qc.setQueryData(["sync-status"], data.sync);
    },
    onError: () => {
      setTimeout(() => push.reset(), 4000);
    },
  });

  const canPull = Boolean(data?.can_pull);
  const canPush = Boolean(data?.can_push);

  const handlePush = () => {
    const message = window.prompt("Commit message:");
    if (!message?.trim()) return;
    push.mutate(message.trim());
  };

  const errorMessage = (error: Error | null) =>
    error instanceof ApiError ? error.message : "Failed";

  return (
    <div className="flex items-center gap-1.5 mt-3 px-1">
      <button
        type="button"
        disabled={!canPull || pull.isPending}
        className="flex-1 text-[11px] font-medium py-1 rounded border transition-colors border-border text-text-secondary hover:text-text hover:border-accent/50 hover:bg-accent/5 disabled:opacity-30 disabled:pointer-events-none inline-flex items-center justify-center gap-1"
        onClick={() => pull.mutate()}
        title={canPull ? "Pull latest from remote" : "Up to date"}
      >
        {pull.isPending ? (
          "Pulling…"
        ) : (
          <>
            <ArrowDown className="w-3 h-3" /> Pull
          </>
        )}
      </button>
      <button
        type="button"
        disabled={!canPush || push.isPending}
        className="flex-1 text-[11px] font-medium py-1 rounded border transition-colors border-border text-text-secondary hover:text-text hover:border-accent/50 hover:bg-accent/5 disabled:opacity-30 disabled:pointer-events-none inline-flex items-center justify-center gap-1"
        onClick={handlePush}
        title={canPush ? "Push local changes" : "Nothing to push"}
      >
        {push.isPending ? (
          "Pushing…"
        ) : (
          <>
            <ArrowUp className="w-3 h-3" /> Push
          </>
        )}
      </button>
      {(pull.isError || push.isError) && (
        <span className="text-[10px] text-red-400">
          {errorMessage(pull.error ?? push.error)}
        </span>
      )}
    </div>
  );
}
