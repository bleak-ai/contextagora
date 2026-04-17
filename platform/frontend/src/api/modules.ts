import { apiFetch } from "./client";

export interface ModuleInfo {
  name: string;
  kind: "integration" | "task";
  summary: string;
  archived: boolean;
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

export function createModule(data: {
  name: string;
  kind?: "integration" | "task";
  content?: string;
  summary?: string;
  description?: string;
  secrets?: string[];
  requirements?: string[];
}): Promise<{ name: string }> {
  return apiFetch("/modules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function archiveModule(name: string): Promise<{ status: string }> {
  return apiFetch(`/modules/${name}/archive`, { method: "POST" });
}

export function unarchiveModule(name: string): Promise<{ status: string }> {
  return apiFetch(`/modules/${name}/unarchive`, { method: "POST" });
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

export interface GenerateResult {
  summary: string;
}

export function generateModule(
  name: string,
  content: string,
): Promise<GenerateResult> {
  return apiFetch(`/modules/${name}/generate`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function detectPackages(
  name: string,
  content: string,
): Promise<{ packages: string[] }> {
  return apiFetch(`/modules/${name}/detect-packages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}
