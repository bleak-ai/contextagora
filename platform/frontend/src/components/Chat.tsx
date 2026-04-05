import { useQuery } from "@tanstack/react-query";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { fetchWorkspace } from "../api/workspace";
import { useSessionStore } from "../hooks/useSessionStore";
import { useContextChatRuntime } from "../hooks/useContextChatRuntime";
import { Thread } from "./chat/Thread";
import { ContextPanel } from "./ContextPanel";

export function Chat() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const { data: workspace } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspace,
  });

  const loaded = workspace?.modules || [];
  const hasContext = loaded.length > 0;

  const { runtime, clearMessages, hasMessages } = useContextChatRuntime({
    isDisabled: !hasContext,
    sessionId: activeSessionId,
  });

  if (!activeSessionId) {
    return (
      <div className="flex h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-text-muted text-sm mb-2">
              No active session
            </div>
            <div className="text-text-muted text-xs">
              Create a new session from the context panel to start chatting
            </div>
          </div>
        </div>
        <ContextPanel />
      </div>
    );
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full">
        <div className="flex-1 flex flex-col min-w-0">
          {/* Clear button */}
          {hasMessages && (
            <div className="flex justify-end px-5 py-1.5">
              <button
                onClick={clearMessages}
                className="text-xs text-text-muted hover:text-text-secondary"
              >
                Clear
              </button>
            </div>
          )}

          {/* Thread */}
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
                        No modules loaded
                      </div>
                      <div className="text-text-muted text-xs">
                        Select modules from the context panel &rarr;
                      </div>
                    </>
                  )}
                </div>
              </div>
            }
          />
        </div>
        <ContextPanel />
      </div>
    </AssistantRuntimeProvider>
  );
}
