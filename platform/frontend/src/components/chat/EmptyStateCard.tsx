import type { FC } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOnboardingState } from "../../api/onboarding";
import { useChatStore } from "../../hooks/useChatStore";
import { useSessionStore } from "../../hooks/useSessionStore";

export const EmptyStateCard: FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: getOnboardingState,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const sendMessage = useChatStore((s) => s.sendMessage);
  const activeSessionId = useSessionStore((s) => s.activeClaudeSessionId);

  if (isLoading || !data) return null;

  const { modules_in_repo, modules_loaded, loaded_module_names } = data;

  if (modules_in_repo === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-raised p-5">
        <h3 className="text-base font-semibold text-text">Welcome</h3>
        <p className="mt-1 text-sm text-text-secondary">
          You don't have any integrations yet. Start with onboarding, then run
          {" "}
          <code>/add-integration &lt;name&gt;</code>
          {" "}
          for the first one you want to set up.
        </p>
        <button
          type="button"
          onClick={() => sendMessage(activeSessionId, "/introduction")}
          className="mt-3 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-text hover:bg-accent-hover transition-colors"
        >
          Get started
        </button>
      </div>
    );
  }

  if (modules_loaded === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-raised px-4 py-3 text-sm text-text-secondary">
        You have <strong className="text-text">{modules_in_repo}</strong> integration{modules_in_repo === 1 ? "" : "s"} available but none are loaded. Pick one in the sidebar to get started.
      </div>
    );
  }

  const names = loaded_module_names.join(", ");
  return (
    <div className="rounded-lg border border-border bg-bg-raised p-5">
      <h3 className="text-base font-semibold text-text">
        {modules_loaded} module{modules_loaded === 1 ? "" : "s"} loaded
      </h3>
      <p className="mt-1 text-sm text-text-secondary">
        <strong className="text-text">{names}</strong>. Want a quick tour of what they can do?
      </p>
      <button
        type="button"
        onClick={() => sendMessage(activeSessionId, "/guide")}
        className="mt-3 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-text hover:bg-accent-hover transition-colors"
      >
        Show me
      </button>
    </div>
  );
};
