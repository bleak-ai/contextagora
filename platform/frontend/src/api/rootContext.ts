import { apiFetch } from "./client";

export interface RootFile {
  path: string;
  exists: boolean;
  content: string | null;
}

export interface RootContext {
  claude_md: RootFile;
  llms_txt: RootFile;
}

export function fetchRootContext(): Promise<RootContext> {
  return apiFetch<RootContext>("/root-context");
}
