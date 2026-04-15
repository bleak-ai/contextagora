import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Invalidate all module- and workspace-related queries.
 *
 * Use after any mutation that changes module state (create, archive,
 * unarchive, delete, load/unload). Centralizes the 4-key pattern that
 * was previously copy-pasted across TaskCard, CreateTaskModal,
 * ArchivedSection, and ContextPanel.
 */
export function invalidateModuleQueries(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: ["modules"] });
  qc.invalidateQueries({ queryKey: ["workspace"] });
  qc.invalidateQueries({ queryKey: ["workspace-files"] });
  qc.invalidateQueries({ queryKey: ["root-context"] });
}
