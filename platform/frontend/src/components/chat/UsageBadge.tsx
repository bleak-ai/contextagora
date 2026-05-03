import { useChatStore, NEW_CHAT_KEY } from "../../hooks/useChatStore";
import { useActiveSessionId } from "../../hooks/useActiveSession";

// Default Claude window. The 1M-context variant advertises itself with
// "1m" in the model id (e.g. `claude-opus-4-7[1m]` or `...-1m`); fall
// back to the standard window for everything else.
function contextWindowFor(model: string | null): number {
  if (model && /1m/i.test(model)) return 1_000_000;
  return 200_000;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function UsageBadge() {
  const activeSessionId = useActiveSessionId();
  const key = activeSessionId ?? NEW_CHAT_KEY;
  const usage = useChatStore((s) => s.usageBySession[key]);
  const model = useChatStore((s) => s.model);

  if (!usage) return null;

  const window = contextWindowFor(model);
  // What Claude actually saw at the start of the last turn — same number
  // Claude Code's status line uses for its "X% context" readout.
  const lastTurnContext =
    usage.lastTurnInputTokens +
    usage.lastTurnCacheReadTokens +
    usage.lastTurnCacheCreationTokens;
  const pct = Math.min(100, Math.round((lastTurnContext / window) * 100));
  const sessionTotal =
    usage.totalInputTokens +
    usage.totalCacheReadTokens +
    usage.totalCacheCreationTokens +
    usage.totalOutputTokens;

  const tone =
    pct >= 90
      ? "text-danger"
      : pct >= 70
        ? "text-text"
        : "text-text-secondary";

  return (
    <div
      className="inline-flex items-center gap-3 rounded-full border border-border bg-bg-raised px-3 py-1.5 text-xs text-text-secondary"
      title={
        `Context: ${formatTokens(lastTurnContext)} / ${formatTokens(window)} ` +
        `(input ${formatTokens(usage.lastTurnInputTokens)}, ` +
        `cache read ${formatTokens(usage.lastTurnCacheReadTokens)}, ` +
        `cache write ${formatTokens(usage.lastTurnCacheCreationTokens)})\n` +
        `Session totals: input ${formatTokens(usage.totalInputTokens)}, ` +
        `output ${formatTokens(usage.totalOutputTokens)}, ` +
        `cache read ${formatTokens(usage.totalCacheReadTokens)}` +
        (usage.totalCostUsd > 0
          ? `\nCost: $${usage.totalCostUsd.toFixed(4)}`
          : "")
      }
    >
      <span className={`tabular-nums ${tone}`}>{pct}% context</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span className="tabular-nums">{formatTokens(sessionTotal)} tokens</span>
    </div>
  );
}
