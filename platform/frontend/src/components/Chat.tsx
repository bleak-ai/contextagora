import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { fetchWorkspace } from "../api/workspace";
import { useChatStore } from "../hooks/useChatStore";
import { useContextChatRuntime } from "../hooks/useContextChatRuntime";
import { Thread } from "./chat/Thread";

export function Chat() {
  const syncSession = useChatStore((s) => s.syncSession);

  useEffect(() => {
    syncSession();
  }, [syncSession]);

  const { data: workspace } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspace,
  });

  const loaded = workspace?.modules || [];
  const hasContext = loaded.length > 0;

  const { runtime, clearMessages, hasMessages } = useContextChatRuntime({
    isDisabled: !hasContext,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* Header */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-bg">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium text-text">Chat</h1>
          <span className="text-xs text-text-muted">
            {hasContext
              ? `${loaded.length} module${loaded.length !== 1 ? "s" : ""} loaded`
              : "No context loaded"}
          </span>
        </div>
        {hasMessages && (
          <button
            onClick={clearMessages}
            className="text-xs text-text-muted hover:text-text-secondary"
          >
            Clear
          </button>
        )}
      </div>

      {/* Thread always mounted — empty state rendered inside */}
      <Thread
        emptyState={
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              {hasContext ? (
                <>
                  <div className="text-text-muted text-sm mb-1">
                    Context ready
                  </div>
                  <div className="text-text-muted text-xs">
                    {loaded.map((mod) => (
                      <span
                        key={mod}
                        className="inline-block bg-accent-dim text-accent text-xs px-2 py-0.5 rounded mr-1 mb-1"
                      >
                        {mod}
                      </span>
                    ))}
                  </div>
                  <div className="text-text-muted text-xs mt-3">
                    Ask anything about your loaded modules
                  </div>
                </>
              ) : (
                <>
                  <div className="text-text-muted text-sm mb-2">
                    Select context modules from the sidebar
                  </div>
                  <div className="text-text-muted text-xs">
                    then start chatting
                  </div>
                </>
              )}
            </div>
          </div>
        }
      />
    </AssistantRuntimeProvider>
  );
}
