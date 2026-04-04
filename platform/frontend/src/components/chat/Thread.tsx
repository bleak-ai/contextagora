import type { FC, ReactNode } from "react";
import {
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  ActionBarPrimitive,
  AuiIf,
} from "@assistant-ui/react";
import { MarkdownText } from "./MarkdownText";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { ThinkingDisplay } from "./ThinkingDisplay";

interface ThreadProps {
  emptyState?: ReactNode;
}

export const Thread: FC<ThreadProps> = ({ emptyState }) => {
  return (
    <ThreadPrimitive.Root className="flex flex-col flex-1 min-h-0">
      <ThreadPrimitive.Viewport className="flex-1 flex flex-col overflow-y-auto">
        {emptyState && (
          <AuiIf condition={(s) => s.thread.isEmpty}>
            {emptyState}
          </AuiIf>
        )}

        <div className="max-w-3xl mx-auto w-full px-5 py-4 space-y-4">
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />
        </div>

        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto bg-bg">
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const UserMessage: FC = () => (
  <MessagePrimitive.Root className="flex justify-end">
    <div className="ml-auto max-w-[70%] bg-accent-dim border border-accent/20 rounded-lg px-4 py-2.5 text-sm text-text">
      <MessagePrimitive.Content
        components={{
          Text: ({ text }) => (
            <span className="whitespace-pre-wrap">{text}</span>
          ),
        }}
      />
    </div>
  </MessagePrimitive.Root>
);

const AssistantMessage: FC = () => (
  <MessagePrimitive.Root className="flex flex-col gap-1 w-full">
    <div className="mr-auto w-full bg-bg-raised border border-border rounded-lg px-5 py-3 text-sm space-y-3 overflow-x-auto">
      <MessagePrimitive.Content
        components={{
          Text: MarkdownText,
          Reasoning: ThinkingDisplay,
          tools: {
            Fallback: ToolCallDisplay,
          },
        }}
      />
    </div>
    <AssistantActions />
  </MessagePrimitive.Root>
);

const AssistantActions: FC = () => (
  <ActionBarPrimitive.Root
    hideWhenRunning
    autohide="not-last"
    className="flex gap-1 ml-1"
  >
    <ActionBarPrimitive.Copy asChild>
      <button className="text-text-muted hover:text-text-secondary text-xs px-1.5 py-0.5 rounded hover:bg-bg-hover transition-colors">
        Copy
      </button>
    </ActionBarPrimitive.Copy>
  </ActionBarPrimitive.Root>
);

const Composer: FC = () => (
  <div className="border-t border-border bg-bg px-5 py-3">
    <ComposerPrimitive.Root className="flex items-end gap-3">
      <ComposerPrimitive.Input
        autoFocus
        placeholder="Message..."
        rows={1}
        maxRows={5}
        className="flex-1 resize-none bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text placeholder-text-muted outline-none focus:border-accent/40 transition-colors disabled:opacity-50"
      />
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <button className="px-4 py-2.5 bg-accent text-accent-text text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-opacity flex-shrink-0">
            Send
          </button>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <button className="px-4 py-2.5 bg-danger/20 text-danger text-sm font-medium rounded-lg hover:bg-danger/30 transition-opacity flex-shrink-0">
            Stop
          </button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </ComposerPrimitive.Root>
  </div>
);
