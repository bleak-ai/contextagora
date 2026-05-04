import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AssistantRuntimeProvider, useComposerRuntime } from "@assistant-ui/react";
import { FileCheck, Zap, Package } from "lucide-react";
import type { ComponentType } from "react";
import { fetchModules, type ModuleInfo } from "../api/modules";
import { fetchWorkspace } from "../api/workspace";
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

  const { data: workspace } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspace,
  });

  const allModules = (modulesData?.modules || []).filter((m) => !m.archived);
  const loadedNames = new Set((workspace?.modules ?? []).map((m) => m.name));

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

  // Once the URL has caught up to a real session id, drop the NEW_CHAT_KEY
  // alias kept by sendMessage's session-event migration. Leaving it would mean
  // navigating back to `/` shows a stale snapshot of the previous chat.
  useEffect(() => {
    if (activeClaudeSessionId !== null) {
      useChatStore.getState().deleteSessionMessages(NEW_CHAT_KEY);
    }
  }, [activeClaudeSessionId]);

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
            emptyState={
              <WelcomeScreen
                modules={allModules}
                loadedNames={loadedNames}
                sessionId={activeClaudeSessionId}
              />
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
  loadedNames,
  sessionId,
}: {
  modules: ModuleInfo[];
  loadedNames: Set<string>;
  sessionId: string | null;
}) {
  const composerRuntime = useComposerRuntime();
  const setMode = useChatStore((s) => s.setMode);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const tasks = modules.filter((m) => m.kind === "task");
  const workflows = modules.filter((m) => m.kind === "workflow");
  const integrations = modules.filter((m) => m.kind === "integration");

  // Tasks and workflows imply context offloading: the agent will likely need
  // to update status, log findings, or write back into the module. Flip the
  // toggle on so the user doesn't have to.
  const enableOffloading = () => {
    void setMode("normal", sessionId);
  };

  const prefillTask = (name: string) => {
    enableOffloading();
    setSelectedName(name);
    composerRuntime.setText(
      `Load the context of the ${name} task (modules-repo/${name}/)`,
    );
  };

  const prefillWorkflow = (name: string) => {
    enableOffloading();
    setSelectedName(name);
    composerRuntime.setText(
      `Load the context of the ${name} workflow (modules-repo/${name}/)`,
    );
  };

  return (
    <div className="w-full max-w-[900px] px-6 space-y-8">
      {tasks.length > 0 && (
        <section>
          <SectionHeader label="Tasks" count={tasks.length} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tasks.map((m) => (
              <TaskTile
                key={m.name}
                module={m}
                loaded={loadedNames.has(m.name)}
                selected={selectedName === m.name}
                onClick={() => prefillTask(m.name)}
              />
            ))}
          </div>
        </section>
      )}

      {workflows.length > 0 && (
        <section>
          <SectionHeader label="Workflows" count={workflows.length} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {workflows.map((m) => (
              <CompactTile
                key={m.name}
                module={m}
                icon={Zap}
                loaded={loadedNames.has(m.name)}
                selected={selectedName === m.name}
                onClick={() => prefillWorkflow(m.name)}
              />
            ))}
          </div>
        </section>
      )}

      {integrations.length > 0 && (
        <section>
          <SectionHeader label="Integrations" count={integrations.length} />
          <div className="flex flex-wrap gap-1.5">
            {integrations.map((m) => (
              <IntegrationChip
                key={m.name}
                module={m}
                loaded={loadedNames.has(m.name)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <h3 className="text-text-secondary text-[11px] font-medium tracking-[0.18em] uppercase">
        {label}
      </h3>
      <span className="text-text-muted text-[11px] tabular-nums">{count}</span>
      <div className="flex-1 border-t border-border/60" />
    </div>
  );
}

function TaskTile({
  module: m,
  loaded,
  selected,
  onClick,
}: {
  module: ModuleInfo;
  loaded: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const base = "group relative text-left rounded-xl border p-4 transition";
  const stateClass = !loaded
    ? "border-border/60 bg-bg-raised opacity-40 cursor-not-allowed"
    : selected
      ? "border-accent/40 bg-accent/5 shadow-[inset_2px_0_0_0_var(--color-accent)] hover:bg-accent/10 hover:border-accent/60 cursor-pointer"
      : "border-border/60 bg-bg-raised hover:bg-bg-hover hover:border-border-light cursor-pointer";
  const iconClass = loaded && selected
    ? "bg-accent/15 text-accent"
    : "bg-bg text-text-muted";
  return (
    <button
      type="button"
      onClick={loaded ? onClick : undefined}
      disabled={!loaded}
      title={loaded ? undefined : "Load this task from the sidebar to start"}
      className={`${base} ${stateClass}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${iconClass}`}
        >
          <FileCheck size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold text-text truncate"
            title={m.name}
          >
            {m.name}
          </div>
          {m.summary && (
            <p className="mt-1 text-xs text-text-secondary leading-relaxed line-clamp-2">
              {m.summary}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function IntegrationChip({
  module: m,
  loaded,
}: {
  module: ModuleInfo;
  loaded: boolean;
}) {
  const tone = loaded
    ? "bg-accent/10 text-accent border-accent/30"
    : "bg-bg text-text-muted border-border/60";
  return (
    <span
      title={m.summary || m.name}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}
    >
      <Package size={11} />
      {m.name}
    </span>
  );
}

function CompactTile({
  module: m,
  icon: Icon,
  loaded,
  selected,
  onClick,
}: {
  module: ModuleInfo;
  icon: ComponentType<{ size?: number }>;
  loaded: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const base =
    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition";
  const stateClass = !loaded
    ? "border-border/60 bg-bg-raised opacity-40 cursor-not-allowed"
    : selected
      ? "border-accent/40 bg-accent/5 shadow-[inset_2px_0_0_0_var(--color-accent)] hover:bg-accent/10 hover:border-accent/60 cursor-pointer"
      : "border-border/60 bg-bg-raised hover:bg-bg-hover hover:border-border-light cursor-pointer";
  const iconWrapClass = loaded && selected
    ? "text-accent bg-accent/15"
    : "text-text-muted bg-bg";

  return (
    <button
      type="button"
      onClick={loaded ? onClick : undefined}
      disabled={!loaded}
      title={loaded ? undefined : "Load this workflow from the sidebar to start"}
      className={`${base} ${stateClass}`}
    >
      <span
        className={`flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md ${iconWrapClass}`}
      >
        <Icon size={13} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-text truncate" title={m.name}>
          {m.name}
        </div>
        {m.summary && (
          <p className="text-[11px] text-text-muted truncate leading-snug">
            {m.summary}
          </p>
        )}
      </div>
    </button>
  );
}
