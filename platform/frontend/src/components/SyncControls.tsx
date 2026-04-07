import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSyncStatus,
  pullSync,
  pushSync,
  type SyncStatus,
} from "../api/sync";

export function SyncControls() {
  const qc = useQueryClient();

  const { data } = useQuery<SyncStatus>({
    queryKey: ["sync-status"],
    queryFn: fetchSyncStatus,
    refetchInterval: 30_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["sync-status"] });
    qc.invalidateQueries({ queryKey: ["modules"] });
  };

  const pull = useMutation({
    mutationFn: pullSync,
    onSuccess: invalidateAll,
  });

  const push = useMutation({
    mutationFn: (message: string) => pushSync(message),
    onSuccess: invalidateAll,
  });

  const canPull = Boolean(data?.can_pull);
  const canPush = Boolean(data?.can_push);

  const handlePush = () => {
    const message = window.prompt("Commit message:");
    if (!message?.trim()) return;
    push.mutate(message.trim());
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="flex items-center gap-1 text-[10px] text-text-secondary bg-border border border-border-light px-1.5 py-0.5 rounded hover:text-text disabled:opacity-40"
        disabled={!canPull || pull.isPending}
        onClick={() => pull.mutate()}
        title={canPull ? "Pull latest from remote" : "Up to date"}
      >
        {pull.isPending ? "Pulling…" : "Pull"}
      </button>
      <button
        type="button"
        className="flex items-center gap-1 text-[10px] text-text-secondary bg-border border border-border-light px-1.5 py-0.5 rounded hover:text-text disabled:opacity-40"
        disabled={!canPush || push.isPending}
        onClick={handlePush}
        title={canPush ? "Push local changes" : "Nothing to push"}
      >
        {push.isPending ? "Pushing…" : "Push"}
      </button>
    </div>
  );
}
