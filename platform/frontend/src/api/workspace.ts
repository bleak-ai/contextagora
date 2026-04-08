import { apiFetch } from "./client";

export interface PackageInfo {
  name: string;
  version: string | null;
  installed: boolean;
}

export interface LoadedModule {
  name: string;
  files: string[];
  secrets: Record<string, string | null>; // null = missing, otherwise masked preview
  packages: PackageInfo[];
}

export interface WorkspaceState {
  modules: LoadedModule[];
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
): Promise<{ modules: string[]; errors?: LoadError[] }> {
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

export interface WorkspaceFile {
  module: string;
  path: string;
  label: string; // "<module>/<path>"
}

export function fetchWorkspaceFiles(): Promise<{ files: WorkspaceFile[] }> {
  return apiFetch("/workspace/files");
}
