import { apiFetch } from "./client";

export interface ModuleInfo {
  name: string;
  kind: "integration" | "task" | "workflow";
  summary: string;
  archived: boolean;
  parent_workflow: string | null;
  has_growth_areas?: boolean;
}

export interface ModuleDetail {
  name: string;
  content: string;
  summary: string;
  secrets: string[];
  requirements: string[];
}

export function fetchModules(): Promise<{ modules: ModuleInfo[] }> {
  return apiFetch("/modules");
}

export function fetchModule(name: string): Promise<ModuleDetail> {
  return apiFetch(`/modules/${name}`);
}

export interface RunResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

export function runModuleFile(
  name: string,
  path: string,
): Promise<RunResult> {
  return apiFetch(`/modules/${name}/files/${path}/run`, { method: "POST" });
}

export function updateModule(
  name: string,
  data: { content: string; summary: string; secrets: string[]; requirements: string[] },
): Promise<{ name: string }> {
  return apiFetch(`/modules/${name}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteModule(name: string): Promise<{ status: string }> {
  return apiFetch(`/modules/${name}`, { method: "DELETE" });
}

export function archiveModule(
  name: string,
  archived: boolean,
): Promise<{ name: string; archived: boolean }> {
  return apiFetch(`/modules/${name}/archive?archived=${archived}`, {
    method: "POST",
  });
}

export interface ModuleFile {
  name: string;
  path: string;
}

export function fetchModuleFiles(
  name: string,
): Promise<{ files: ModuleFile[] }> {
  return apiFetch(`/modules/${name}/files`);
}

export function fetchModuleFile(
  name: string,
  path: string,
): Promise<{ path: string; content: string }> {
  return apiFetch(`/modules/${name}/files/${path}`);
}

export function saveModuleFile(
  name: string,
  path: string,
  content: string,
): Promise<{ path: string }> {
  return apiFetch(`/modules/${name}/files/${path}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export function deleteModuleFile(
  name: string,
  path: string,
): Promise<{ status: string }> {
  return apiFetch(`/modules/${name}/files/${path}`, { method: "DELETE" });
}

export function fetchLegacyArchived(): Promise<string[]> {
  return apiFetch<string[]>("/legacy-archived");
}

