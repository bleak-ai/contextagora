import { useEffect, useState } from "react";
import { useTreePanelStore } from "../../hooks/useTreePanelStore";
import { useChatStore } from "../../hooks/useChatStore";
import { DecisionTreePanel } from "./DecisionTreePanel";

const ACTIVITY_GRACE_MS = 2500;

export function FloatingTreePanel() {
  const enabled = useTreePanelStore((s) => s.open);
  const treeState = useChatStore((s) => s.currentTreeState);
  const isStreaming = useChatStore((s) => s.streamingSessionId !== null);

  const [recentActivity, setRecentActivity] = useState(false);

  useEffect(() => {
    if (!treeState) return;
    setRecentActivity(true);
    const timer = setTimeout(() => setRecentActivity(false), ACTIVITY_GRACE_MS);
    return () => clearTimeout(timer);
  }, [treeState]);

  useEffect(() => {
    if (!isStreaming) setRecentActivity(false);
  }, [isStreaming]);

  const visible = enabled && isStreaming && recentActivity;

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
      <aside
        className="pointer-events-auto w-[280px] max-h-[60vh] flex flex-col rounded-lg border border-border bg-bg-raised/85 backdrop-blur-md shadow-2xl"
        role="complementary"
        aria-label="Context tree"
      >
        <div className="px-3 py-2 border-b border-border">
          <span className="text-accent text-[11px] font-semibold tracking-wider">
            TREE
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <DecisionTreePanel />
        </div>
      </aside>
    </div>
  );
}
