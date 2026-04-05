import { useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { fetchWorkspace, loadModules } from "../api/workspace";
import { fetchModules } from "../api/modules";
import { createSession } from "../api/sessions";
import { useSessionStore } from "../hooks/useSessionStore";
import { useChatStore } from "../hooks/useChatStore";
import { useContextChatRuntime } from "../hooks/useContextChatRuntime";
import { Thread } from "./chat/Thread";
import { ContextPanel } from "./ContextPanel";

export function Chat() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const addSession = useSessionStore((s) => s.addSession);
  const queryClient = useQueryClient();
  const moduleToolCount = useChatStore((s) => s.moduleToolCompletedCount);
  const prevCount = useRef(moduleToolCount);
  const creatingSession = useRef(false);

  // Auto-create a session if none exists
  useEffect(() => {
    if (!activeSessionId && !creatingSession.current) {
      creatingSession.current = true;
      createSession("New chat").then((session) => {
        addSession({
          id: session.id,
          name: session.name,
          createdAt: session.created_at,
        });
        creatingSession.current = false;
      }).catch(() => {
        creatingSession.current = false;
      });
    }
  }, [activeSessionId, addSession]);

  // Refresh module list when the agent creates/updates a module
  useEffect(() => {
    if (moduleToolCount > prevCount.current) {
      queryClient.invalidateQueries({ queryKey: ["modules"] });
    }
    prevCount.current = moduleToolCount;
  }, [moduleToolCount, queryClient]);

  const { data: workspace } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspace,
  });

  const { data: modulesData } = useQuery({
    queryKey: ["modules"],
    queryFn: fetchModules,
  });

  const loaded = workspace?.modules || [];
  const allModules = modulesData?.modules || [];

  const { runtime, clearMessages, hasMessages } = useContextChatRuntime({
    isDisabled: false,
    sessionId: activeSessionId,
  });

  const loadMutation = useMutation({
    mutationFn: loadModules,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  const handleQuickLoad = useCallback(
    (moduleName: string) => {
      // Toggle module load/unload without sending a chat message
      const current = workspace?.modules || [];
      const next = current.includes(moduleName)
        ? current.filter((m) => m !== moduleName)
        : [...current, moduleName];
      loadMutation.mutate(next);
    },
    [workspace?.modules, loadMutation],
  );

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
              <WelcomeScreen
                modules={allModules}
                loadedModules={loaded}
                onModuleClick={handleQuickLoad}
              />
            }
          />
        </div>
        <ContextPanel />
      </div>
    </AssistantRuntimeProvider>
  );
}

function WelcomeScreen({
  modules,
  loadedModules,
  onModuleClick,
}: {
  modules: string[];
  loadedModules: string[];
  onModuleClick: (name: string) => void;
}) {
  return (
    <div className="flex flex-col items-center px-6">
      {/* Logo / greeting */}
      <div className="mb-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 mb-4">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-accent"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <h2 className="text-text text-base font-medium mb-1">
          Context Loader
        </h2>
        <p className="text-text-muted text-sm max-w-[320px]">
          Your context-aware assistant. Ask me anything or pick a module to get started.
        </p>
      </div>

      {/* Module pills */}
      {modules.length > 0 && (
        <div className="w-full max-w-[420px]">
          <p className="text-text-muted text-[11px] tracking-wider mb-2 text-center">
            AVAILABLE MODULES
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {modules.map((name) => {
              const isLoaded = loadedModules.includes(name);
              return (
                <button
                  key={name}
                  onClick={() => onModuleClick(name)}
                  className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all border ${
                    isLoaded
                      ? "bg-accent/10 border-accent/25 text-accent hover:bg-accent/15"
                      : "bg-bg-raised border-border text-text-secondary hover:border-accent/30 hover:text-accent hover:bg-accent/5"
                  }`}
                >
                  {isLoaded && (
                    <span className="text-success text-[10px]">&#10003;</span>
                  )}
                  {name}
                </button>
              );
            })}
          </div>
          {loadedModules.length > 0 && (
            <p className="text-text-muted text-[10px] text-center mt-3">
              {loadedModules.length} module{loadedModules.length !== 1 ? "s" : ""} loaded
            </p>
          )}
        </div>
      )}
    </div>
  );
}
