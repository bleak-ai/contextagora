import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AssistantRuntimeProvider, useComposerRuntime } from "@assistant-ui/react";
import { FileCheck, Zap, Package } from "lucide-react";
import type { ComponentType } from "react";
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
  const composerRuntime = useComposerRuntime();
  const tasks = modules.filter((m) => m.kind === "task");
  const workflows = modules.filter((m) => m.kind === "workflow");
  const integrations = modules.filter((m) => m.kind === "integration");

  const prefillTask = (name: string) =>
    composerRuntime.setText(
      `Let's continue working on the ${name} task (context: modules-repo/${name}/). Read its info.md (and any status notes) and tell me where we left off and what to do next.`,
    );

  const prefillWorkflow = (name: string) =>
    composerRuntime.setText(
      `Let's run the ${name} workflow (context: modules-repo/${name}/). Read its info.md, then walk me through it step by step starting with step 1.`,
    );

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
                tone="accent"
                onClick={() => prefillWorkflow(m.name)}
              />
            ))}
          </div>
        </section>
      )}

      {integrations.length > 0 && (
        <section>
          <SectionHeader label="Integrations" count={integrations.length} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {integrations.map((m) => (
              <CompactTile
                key={m.name}
                module={m}
                icon={Package}
                tone="muted"
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
  onClick,
}: {
  module: ModuleInfo;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative text-left rounded-xl border border-border bg-bg-raised p-4 hover:bg-bg-hover hover:border-accent/50 transition-colors cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-accent-dim text-accent group-hover:bg-accent/20 transition-colors">
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

function CompactTile({
  module: m,
  icon: Icon,
  tone,
  onClick,
}: {
  module: ModuleInfo;
  icon: ComponentType<{ size?: number }>;
  tone: "accent" | "muted";
  onClick?: () => void;
}) {
  const interactive = onClick !== undefined;
  const wrapperClass = `flex items-center gap-3 rounded-lg border bg-bg-raised px-3 py-2.5 text-left ${
    interactive
      ? "border-border hover:bg-bg-hover hover:border-accent/40 transition-colors cursor-pointer"
      : "border-border/60 cursor-default"
  }`;
  const iconWrapClass =
    tone === "accent"
      ? "text-accent bg-accent-dim"
      : "text-text-muted bg-bg";
  const nameClass =
    tone === "accent"
      ? "text-xs font-medium text-text"
      : "text-xs font-medium text-text-secondary";

  const content = (
    <>
      <span
        className={`flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md ${iconWrapClass}`}
      >
        <Icon size={13} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`${nameClass} truncate`} title={m.name}>
          {m.name}
        </div>
        {m.summary && (
          <p className="text-[11px] text-text-muted truncate leading-snug">
            {m.summary}
          </p>
        )}
      </div>
    </>
  );

  if (!interactive) {
    return <div className={wrapperClass}>{content}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={wrapperClass}>
      {content}
    </button>
  );
}
