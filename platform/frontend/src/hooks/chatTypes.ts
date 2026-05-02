import type {
  TreeNavigationPayload,
  ValidationErrorPayload,
} from "../api/chat";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  startedAt: number;
  completedAt?: number;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "tool_call"; toolCall: ToolCall };

export type ValidationErrorEntry = ValidationErrorPayload;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  thinking: string;
  parts: ContentPart[];
  streaming: boolean;
  error?: string;
  suggestions?: string[]; // ephemeral, never persisted
  validationErrors?: ValidationErrorEntry[]; // ephemeral, never persisted
}

export type TreeState = TreeNavigationPayload;
