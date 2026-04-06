import { apiFetch } from "./client";

export interface ModuleDetail {
  name: string;
  content: string;
  summary: string;
  secrets: string[];
}

export function fetchModules(): Promise<{ modules: string[] }> {
  return apiFetch("/modules");
}

export function fetchModule(name: string): Promise<ModuleDetail> {
  return apiFetch(`/modules/${name}`);
}

export function createModule(data: {
  name: string;
  content: string;
  summary: string;
  secrets: string[];
}): Promise<{ name: string }> {
  return apiFetch("/modules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateModule(
  name: string,
  data: { content: string; summary: string; secrets: string[] },
): Promise<{ name: string }> {
  return apiFetch(`/modules/${name}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteModule(name: string): Promise<{ status: string }> {
  return apiFetch(`/modules/${name}`, { method: "DELETE" });
}

export function refreshModules(): Promise<{ modules: string[] }> {
  return apiFetch("/modules/refresh", { method: "POST" });
}

// --- Module file operations ---

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

// --- AI generation ---

export interface GenerateResult {
  content: string;
  summary: string;
  secrets: string[];
  docs: { path: string; content: string }[];
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
