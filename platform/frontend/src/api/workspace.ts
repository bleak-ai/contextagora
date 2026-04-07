import { apiFetch } from "./client";

export interface WorkspaceState {
  modules: string[];
  secrets: Record<string, Record<string, string | null>>;
}

export function fetchWorkspace(): Promise<WorkspaceState> {
  return apiFetch("/workspace");
}

export interface LoadError {
  module: string;
  reason: "not_available" | "invalid_path" | "missing_secrets" | "load_failed";
  missing?: string[];
  details?: string;
}

export function loadModules(
  modules: string[],
): Promise<WorkspaceState & { errors?: LoadError[] }> {
  return apiFetch("/workspace/load", {
    method: "POST",
    body: JSON.stringify({ modules }),
  });
}

export function refreshSecrets(): Promise<{
  secrets: Record<string, Record<string, string | null>>;
}> {
  return apiFetch("/workspace/secrets", { method: "POST" });
}
