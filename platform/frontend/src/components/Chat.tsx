import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { fetchWorkspace } from "../api/workspace";
import { fetchModules } from "../api/modules";
import { useSessionStore } from "../hooks/useSessionStore";
import { useChatStore } from "../hooks/useChatStore";
import { useContextChatRuntime } from "../hooks/useContextChatRuntime";
import { Thread } from "./chat/Thread";
import { ContextPanel } from "./ContextPanel";
import { EmptyStateCard } from "./chat/EmptyStateCard";

export function Chat() {
  const activeClaudeSessionId = useSessionStore((s) => s.activeClaudeSessionId);
  const queryClient = useQueryClient();
  const moduleToolCount = useChatStore((s) => s.moduleToolCompletedCount);
  const prevCount = useRef(moduleToolCount);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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

  const loaded = workspace?.modules.map((m) => m.name) || [];
  const allModules = (modulesData?.modules || []).map((m) => m.name);

  const setActiveClaudeSessionId = useSessionStore((s) => s.setActiveClaudeSessionId);

  const { runtime, hasMessages } = useContextChatRuntime({
    isDisabled: false,
    sessionId: activeClaudeSessionId,
  });

  const startNewSession = () => {
    setActiveClaudeSessionId(null);
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full">
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile top bar */}
          <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-border bg-bg-raised flex-shrink-0">
            <span className="text-sm font-medium text-text">Context Agora</span>
            <button
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open context panel"
              className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-bg-hover"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            </button>
          </div>
          {/* Thread */}
          <Thread
            emptyState={
              <>
                <WelcomeScreen
                  modules={allModules}
                  loadedModules={loaded}
                />
                <div className="w-full max-w-[420px] mt-4">
                  <EmptyStateCard />
                </div>
              </>
            }
            onNewSession={hasMessages ? startNewSession : undefined}
          />
        </div>
        <ContextPanel
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
      </div>
    </AssistantRuntimeProvider>
  );
}

function WelcomeScreen({
  modules,
  loadedModules,
}: {
  modules: string[];
  loadedModules: string[];
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
          Context Agora
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
                <span
                  key={name}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
                    isLoaded
                      ? "bg-accent/10 border-accent/25 text-accent"
                      : "bg-bg-raised border-border text-text-secondary"
                  }`}
                >
                  {isLoaded && (
                    <span className="text-success text-[10px]">&#10003;</span>
                  )}
                  {name}
                </span>
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
