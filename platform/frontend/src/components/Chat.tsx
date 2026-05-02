import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { fetchModules, type ModuleInfo } from "../api/modules";
import {
  useActiveSessionId,
  useNavigateToSession,
} from "../hooks/useActiveSession";
import { useChatStore, NEW_CHAT_KEY } from "../hooks/useChatStore";
import { useContextChatRuntime } from "../hooks/useContextChatRuntime";
import { Thread } from "./chat/Thread";
import { ContextPanel } from "./ContextPanel";

export function Chat() {
  const activeClaudeSessionId = useActiveSessionId();
  const navigateToSession = useNavigateToSession();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const { data: modulesData } = useQuery({
    queryKey: ["modules"],
    queryFn: fetchModules,
  });

  const allModules = (modulesData?.modules || []).filter((m) => !m.archived);

  const { runtime, hasMessages } = useContextChatRuntime({
    isDisabled: false,
    sessionId: activeClaudeSessionId,
  });

  // When the chat store learns a server-assigned session id mid-stream, upgrade
  // the URL so the chat becomes shareable + survives refresh. We only navigate
  // when we're on `/` (no id in the URL yet) — once the URL is on a session, we
  // leave it alone.
  useEffect(() => {
    let prev = useChatStore.getState().streamingSessionId;
    return useChatStore.subscribe((state) => {
      const next = state.streamingSessionId;
      if (
        next &&
        next !== prev &&
        next !== NEW_CHAT_KEY &&
        activeClaudeSessionId === null
      ) {
        navigateToSession(next);
      }
      prev = next;
    });
  }, [activeClaudeSessionId, navigateToSession]);

  const startNewSession = () => {
    navigateToSession(null);
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
            emptyState={<WelcomeScreen modules={allModules} />}
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

function WelcomeScreen({ modules }: { modules: ModuleInfo[] }) {
  const tasks = modules.filter((m) => m.kind === "task");
  const workflows = modules.filter((m) => m.kind === "workflow");
  const integrations = modules.filter((m) => m.kind === "integration");

  return (
    <div className="w-full max-w-[900px] px-6 space-y-10">
      {tasks.length > 0 && (
        <section>
          <h2 className="text-text-muted text-xs tracking-wider mb-3">
            TASKS
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tasks.map((m) => (
              <ModuleTile key={m.name} module={m} size="lg" />
            ))}
          </div>
        </section>
      )}

      {workflows.length > 0 && (
        <section>
          <h3 className="text-text-muted text-[11px] tracking-wider mb-2">
            WORKFLOWS
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {workflows.map((m) => (
              <ModuleTile key={m.name} module={m} size="sm" />
            ))}
          </div>
        </section>
      )}

      {integrations.length > 0 && (
        <section>
          <h3 className="text-text-muted text-[11px] tracking-wider mb-2">
            INTEGRATIONS
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {integrations.map((m) => (
              <ModuleTile key={m.name} module={m} size="sm" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ModuleTile({
  module: m,
  size,
}: {
  module: ModuleInfo;
  size: "lg" | "sm";
}) {
  const isLg = size === "lg";
  return (
    <button
      type="button"
      className={`text-left rounded-lg border border-border bg-bg-raised hover:bg-bg-hover hover:border-accent/40 transition-colors ${
        isLg ? "p-4" : "px-3 py-2"
      }`}
    >
      <div
        className={`font-medium text-text truncate ${
          isLg ? "text-sm" : "text-xs"
        }`}
        title={m.name}
      >
        {m.name}
      </div>
      {isLg && m.summary && (
        <p className="mt-1 text-xs text-text-muted line-clamp-2">{m.summary}</p>
      )}
    </button>
  );
}
