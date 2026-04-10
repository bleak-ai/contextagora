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
import { MentionSelector, useMentionPicker } from "./MentionSelector";
import type { WorkspaceFile } from "../../api/workspace";
import { MarkdownText } from "./MarkdownText";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { ThinkingDisplay } from "./ThinkingDisplay";
import { ModulePreviewCard } from "./ModulePreviewCard";

interface ThreadProps {
  emptyState?: ReactNode;
  onNewSession?: () => void;
}

export const Thread: FC<ThreadProps> = ({ emptyState, onNewSession }) => {
  return (
    <ThreadPrimitive.Root className="flex flex-col flex-1 min-h-0">
      <ThreadPrimitive.Viewport className="flex-1 flex flex-col overflow-y-auto bg-bg">
        {/* Empty state: welcome + centered composer */}
        {emptyState && (
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <div className="flex-1 flex flex-col items-center justify-center">
              {emptyState}
              <div className="w-full max-w-[900px] px-8 sm:px-16 mt-8">
                <Composer />
              </div>
            </div>
          </AuiIf>
        )}

        {/* Messages */}
        <div className="mx-auto w-full max-w-[900px] px-8 sm:px-16 py-8 space-y-8">
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
            <Composer onNewSession={onNewSession} />
          </ThreadPrimitive.ViewportFooter>
        </AuiIf>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const UserMessage: FC = () => (
  <MessagePrimitive.Root className="flex justify-end">
    <div className="ml-auto max-w-[80%] bg-[var(--color-user-bubble)] border border-white/[0.04] rounded-3xl px-5 py-3 text-sm text-text shadow-sm">
      <MessagePrimitive.Content
        components={{
          Text: ({ text }) => (
            <span className="whitespace-pre-wrap leading-relaxed">{text}</span>
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

const AssistantMessage: FC = () => (
  <MessagePrimitive.Root className="relative flex items-stretch gap-0 w-full group">
    <div className="flex-1 min-w-0">
      <div className="space-y-2">
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
  <div className="h-0 overflow-visible">
    <div className="pt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <ActionBarPrimitive.Copy asChild>
        <button className="text-text-muted hover:text-text-secondary text-xs px-1.5 py-0.5 rounded hover:bg-bg-hover transition-colors">
          Copy
        </button>
      </ActionBarPrimitive.Copy>
    </div>
  </div>
);

const Composer: FC<{ onNewSession?: () => void }> = ({ onNewSession }) => {
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

  const handleMentionSelect = useCallback(
    (file: WorkspaceFile) => {
      const text = composerRuntime.getState().text;
      const c = text.length;
      let start = -1;
      for (let i = c - 1; i >= 0; i--) {
        const ch = text[i];
        if (ch === "@") {
          if (i === 0 || /\s/.test(text[i - 1])) start = i;
          break;
        }
        if (/\s/.test(ch)) break;
      }
      if (start === -1) return;
      const before = text.slice(0, start);
      const after = text.slice(c);
      composerRuntime.setText(`${before}@${file.label} ${after}`);
    },
    [composerRuntime],
  );

  const mentionPicker = useMentionPicker({
    inputText,
    cursorPosition: inputText.length,
    dismissed,
    onSelect: handleMentionSelect,
    onDismiss: handleDismiss,
  });

  return (
    <div className="border-t border-border bg-bg px-8 sm:px-16 py-4">
      <div className="relative max-w-[900px] mx-auto">
        {showSelector && filtered.length > 0 && (
          <SlashCommandSelector
            filtered={filtered}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            onSelect={handleSelect}
          />
        )}
        {!showSelector && mentionPicker.active && (
          <MentionSelector
            filtered={mentionPicker.filtered}
            totalMatches={mentionPicker.totalMatches}
            hasModules={mentionPicker.hasModules}
            activeIndex={mentionPicker.activeIndex}
            setActiveIndex={mentionPicker.setActiveIndex}
            onSelect={handleMentionSelect}
          />
        )}
        <ComposerPrimitive.Root className="relative bg-bg-input border border-border rounded-2xl focus-within:border-accent/40 focus-within:shadow-[0_0_0_1px_rgba(196,163,90,0.1)] transition-all">
          <ComposerPrimitive.Input
            autoFocus
            placeholder="Ask anything..."
            rows={1}
            maxRows={10}
            onKeyDown={
              showSelector
                ? handleKeyDown
                : mentionPicker.active
                  ? mentionPicker.handleKeyDown
                  : undefined
            }
            className="w-full resize-none bg-transparent px-5 py-3.5 pb-13 text-sm text-text placeholder:text-text-secondary/70 outline-none disabled:opacity-50"
          />
          {onNewSession && (
            <div className="absolute left-3 bottom-2.5">
              <button
                onClick={onNewSession}
                aria-label="New session"
                title="New session"
                className="flex items-center gap-1.5 h-8 px-2 text-text-muted rounded-lg hover:bg-bg-hover hover:text-text-secondary transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span className="text-[11px]">New session</span>
              </button>
            </div>
          )}
          <div className="absolute right-3 bottom-2.5 flex gap-2">
            <AuiIf condition={(s: { thread: { isRunning: boolean } }) => !s.thread.isRunning}>
              <ComposerPrimitive.Send asChild>
                <button
                  aria-label="Send message"
                  title="Send"
                  className="flex items-center justify-center w-8 h-8 bg-accent text-accent-text rounded-lg hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              </ComposerPrimitive.Send>
            </AuiIf>
            <AuiIf condition={(s: { thread: { isRunning: boolean } }) => s.thread.isRunning}>
              <ComposerPrimitive.Cancel asChild>
                <button
                  aria-label="Stop generating"
                  title="Stop"
                  className="flex items-center justify-center w-8 h-8 bg-danger/20 text-danger rounded-lg hover:bg-danger/30 transition-opacity"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="4" y="4" width="16" height="16" rx="1.5" />
                  </svg>
                </button>
              </ComposerPrimitive.Cancel>
            </AuiIf>
          </div>
        </ComposerPrimitive.Root>
      </div>
    </div>
  );
};
