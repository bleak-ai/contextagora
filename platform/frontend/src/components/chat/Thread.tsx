import { type FC, type ReactNode, useState, useCallback, useEffect } from "react";
import type { TextMessagePartProps } from "@assistant-ui/react";
import {
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  ActionBarPrimitive,
  AuiIf,
  useComposerRuntime,
} from "@assistant-ui/react";
import { SlashCommandSelector, useSlashCommands } from "./SlashCommandSelector";
import { MarkdownText } from "./MarkdownText";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { ThinkingDisplay } from "./ThinkingDisplay";
import { ModulePreviewCard } from "./ModulePreviewCard";

interface ThreadProps {
  emptyState?: ReactNode;
}

export const Thread: FC<ThreadProps> = ({ emptyState }) => {
  return (
    <ThreadPrimitive.Root className="flex flex-col flex-1 min-h-0">
      <ThreadPrimitive.Viewport className="flex-1 flex flex-col overflow-y-auto bg-bg">
        {/* Empty state: welcome + centered composer */}
        {emptyState && (
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <div className="flex-1 flex flex-col items-center justify-center">
              {emptyState}
              <div className="w-full max-w-[700px] px-5 mt-6">
                <Composer />
              </div>
            </div>
          </AuiIf>
        )}

        {/* Messages */}
        <div className="mx-auto w-full px-5 py-4 space-y-6">
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />
        </div>

        {/* Bottom composer (only when messages exist) */}
        <AuiIf condition={(s) => !s.thread.isEmpty}>
          <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto bg-bg">
            <Composer />
          </ThreadPrimitive.ViewportFooter>
        </AuiIf>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const UserMessage: FC = () => (
  <MessagePrimitive.Root className="flex justify-end">
    <div className="ml-auto max-w-[70%] bg-[var(--color-user-bubble)] border border-[var(--color-user-bubble-border)] rounded-[16px_16px_4px_16px] px-4 py-2.5 text-sm text-text">
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
 * Always renders one div; color set via CSS custom property from status.
 */
const LeftRail: FC = () => (
  <div className="flex-shrink-0 w-0.5 rounded-sm mr-4 bg-gradient-to-b from-accent to-success" />
);

const AssistantMessage: FC = () => (
  <MessagePrimitive.Root className="flex items-stretch gap-0 w-full">
    <LeftRail />
    <div className="flex-1 min-w-0 max-w-[80%] flex flex-col gap-1">
      <div className="space-y-1.5">
        <MessagePrimitive.Content
          components={{
            Text: AssistantText,
            Reasoning: ThinkingDisplay,
            tools: {
              by_name: {
                mcp__modules__create_module: ModulePreviewCard,
                mcp__modules__update_module: ModulePreviewCard,
              },
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

const Composer: FC = () => {
  const [inputText, setInputText] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const composerRuntime = useComposerRuntime();

  // Subscribe to composer runtime text — stays in sync after submit clears, etc.
  useEffect(() => {
    return composerRuntime.subscribe(() => {
      const text = composerRuntime.getState().text;
      setInputText((prev) => {
        if (prev !== text) setDismissed(false);
        return text;
      });
    });
  }, [composerRuntime]);

  const showSelector = inputText.startsWith("/") && !inputText.includes(" ") && !dismissed;
  const filter = showSelector ? inputText.slice(1) : "";

  const handleSelect = useCallback(
    (command: string) => {
      composerRuntime.setText(`/${command} `);
    },
    [composerRuntime],
  );

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const { filtered, activeIndex, setActiveIndex, handleKeyDown } = useSlashCommands({
    filter,
    onSelect: handleSelect,
    onDismiss: handleDismiss,
  });

  return (
    <div className="border-t border-border bg-bg px-5 py-3">
      <div className="relative max-w-[700px] mx-auto">
        {showSelector && filtered.length > 0 && (
          <SlashCommandSelector
            filtered={filtered}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            onSelect={handleSelect}
          />
        )}
        <ComposerPrimitive.Root className="relative bg-bg-input border border-border rounded-xl focus-within:border-accent/40 transition-colors">
          <ComposerPrimitive.Input
            autoFocus
            placeholder="Ask anything..."
            rows={3}
            maxRows={10}
            onKeyDown={showSelector ? handleKeyDown : undefined}
            className="w-full resize-none bg-transparent px-4 py-3 pb-12 text-sm text-text placeholder-text-muted outline-none disabled:opacity-50"
          />
          <div className="absolute right-3 bottom-2.5 flex gap-2">
            <AuiIf condition={(s) => !s.thread.isRunning}>
              <ComposerPrimitive.Send asChild>
                <button className="px-4 py-1.5 bg-accent text-accent-text text-xs font-semibold rounded-lg hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-opacity">
                  Send
                </button>
              </ComposerPrimitive.Send>
            </AuiIf>
            <AuiIf condition={(s) => s.thread.isRunning}>
              <ComposerPrimitive.Cancel asChild>
                <button className="px-4 py-1.5 bg-danger/20 text-danger text-xs font-semibold rounded-lg hover:bg-danger/30 transition-opacity">
                  Stop
                </button>
              </ComposerPrimitive.Cancel>
            </AuiIf>
          </div>
        </ComposerPrimitive.Root>
      </div>
    </div>
  );
};
