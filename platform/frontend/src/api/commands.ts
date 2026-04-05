import { apiFetch } from "./client";

export interface Command {
  name: string;
  description: string;
}

export function fetchCommands(): Promise<{ commands: Command[] }> {
  return apiFetch("/commands");
}
