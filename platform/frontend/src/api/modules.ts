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
