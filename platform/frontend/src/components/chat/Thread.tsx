import type { FC, ReactNode } from "react";
import type { TextMessagePartProps } from "@assistant-ui/react";
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

        <div className="max-w-3xl mx-auto w-full px-5 py-4 space-y-6">
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
    <div className="ml-auto max-w-[70%] bg-[rgba(196,163,90,0.08)] border border-[rgba(196,163,90,0.15)] rounded-[16px_16px_4px_16px] px-4 py-2.5 text-sm text-text">
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

/**
 * ErrorText detects the __ERROR__ marker injected by convertMessage
 * and renders it in red. Normal text goes through MarkdownText.
 */
const AssistantText: FC<TextMessagePartProps> = (props) => {
  const { text } = props;
  if (text.startsWith("\n\n__ERROR__:")) {
    const errorMsg = text.replace("\n\n__ERROR__:", "");
    return (
      <p className="text-sm text-danger mt-2">{errorMsg}</p>
    );
  }
  return <MarkdownText {...props} />;
};

/**
 * LeftRail renders the 2px colored vertical line.
 * Gold while running, gold→green when complete, gold→red on error.
 */
const LeftRail: FC = () => (
  <div className="flex-shrink-0 mr-4 w-0.5 rounded-sm">
    <MessagePrimitive.If running>
      <div className="w-full h-full bg-accent rounded-sm" />
    </MessagePrimitive.If>
    <MessagePrimitive.If complete>
      <div className="w-full h-full bg-gradient-to-b from-accent to-success rounded-sm" />
    </MessagePrimitive.If>
    <MessagePrimitive.If incomplete>
      <div className="w-full h-full bg-gradient-to-b from-accent to-danger rounded-sm" />
    </MessagePrimitive.If>
  </div>
);

const AssistantMessage: FC = () => (
  <MessagePrimitive.Root className="flex gap-0 w-full">
    <LeftRail />
    <div className="flex-1 min-w-0 flex flex-col gap-1">
      <div className="space-y-1.5">
        <MessagePrimitive.Content
          components={{
            Text: AssistantText,
            Reasoning: ThinkingDisplay,
            tools: {
              Fallback: ToolCallDisplay,
            },
          }}
        />
      </div>
      <AssistantActions />
    </div>
  </MessagePrimitive.Root>
);

const AssistantActions: FC = () => (
  <ActionBarPrimitive.Root
    hideWhenRunning
    autohide="not-last"
    className="flex gap-1"
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
        className="flex-1 resize-none bg-bg-input border border-border rounded-xl px-4 py-3 text-sm text-text placeholder-text-muted outline-none focus:border-accent/40 transition-colors disabled:opacity-50"
      />
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <button className="px-5 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-[10px] hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-opacity flex-shrink-0">
            Send
          </button>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <button className="px-5 py-2.5 bg-danger/20 text-danger text-sm font-semibold rounded-[10px] hover:bg-danger/30 transition-opacity flex-shrink-0">
            Stop
          </button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </ComposerPrimitive.Root>
  </div>
);
