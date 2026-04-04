import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { streamChat, type ChatEvent } from "../api/chat";
import { fetchWorkspace } from "../api/workspace";
import { ChatMessage, type ContentBlock } from "./ChatMessage";

interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: workspace } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspace,
  });

  const loaded = workspace?.modules || [];
  const hasContext = loaded.length > 0;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  const handleSubmit = async () => {
    const prompt = input.trim();
    if (!prompt || isStreaming) return;

    setInput("");
    setIsStreaming(true);

    setMessages((prev) => [...prev, { role: "user", content: prompt }]);

    const assistantBlocks: ContentBlock[] = [];
    setMessages((prev) => [...prev, { role: "assistant", content: assistantBlocks }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        prompt,
        (event: ChatEvent) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role !== "assistant") return prev;

            const blocks = [...(last.content as ContentBlock[])];
            const lastBlock = blocks[blocks.length - 1];

            switch (event.type) {
              case "thinking":
                if (lastBlock?.type === "thinking" && lastBlock.isStreaming) {
                  blocks[blocks.length - 1] = {
                    ...lastBlock,
                    text: (lastBlock.text || "") + event.text,
                  };
                } else {
                  blocks.push({ type: "thinking", text: event.text, isStreaming: true });
                }
                break;
              case "text":
                if (lastBlock?.type === "text" && lastBlock.isStreaming) {
                  blocks[blocks.length - 1] = {
                    ...lastBlock,
                    text: (lastBlock.text || "") + event.text,
                  };
                } else {
                  blocks.push({ type: "text", text: event.text, isStreaming: true });
                }
                break;
              case "tool_use":
                blocks.push({
                  type: "tool_use",
                  tool: event.tool,
                  input: event.input,
                  isStreaming: true,
                });
                break;
              case "tool_input":
                break;
              case "error":
                blocks.push({ type: "error", message: event.message });
                break;
              case "done":
                for (let i = 0; i < blocks.length; i++) {
                  if (blocks[i].isStreaming) {
                    blocks[i] = { ...blocks[i], isStreaming: false };
                  }
                }
                break;
            }

            updated[updated.length - 1] = { ...last, content: blocks };
            return updated;
          });
        },
        controller.signal,
      );
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            const blocks = [...(last.content as ContentBlock[])];
            blocks.push({ type: "error", message: err.message });
            updated[updated.length - 1] = { ...last, content: blocks };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      {/* Header */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-bg">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium text-text">Chat</h1>
          <span className="text-xs text-text-muted">
            {hasContext
              ? `${loaded.length} module${loaded.length !== 1 ? "s" : ""} loaded`
              : "No context loaded"}
          </span>
        </div>
        <button
          onClick={() => setMessages([])}
          className="text-xs text-text-muted hover:text-text-secondary"
        >
          Clear
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            {hasContext ? (
              <>
                <div className="text-text-muted text-sm mb-1">Context ready</div>
                <div className="text-text-muted text-xs">
                  {loaded.map((mod) => (
                    <span
                      key={mod}
                      className="inline-block bg-accent-dim text-accent text-xs px-2 py-0.5 rounded mr-1 mb-1"
                    >
                      {mod}
                    </span>
                  ))}
                </div>
                <div className="text-text-muted text-xs mt-3">
                  Ask anything about your loaded modules
                </div>
              </>
            ) : (
              <>
                <div className="text-text-muted text-sm mb-2">
                  Select context modules from the sidebar
                </div>
                <div className="text-text-muted text-xs">then start chatting</div>
              </>
            )}
          </div>
        ) : (
          messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border bg-bg px-5 py-3">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Message..."
            disabled={!hasContext || isStreaming}
            className="flex-1 resize-none bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text placeholder-text-muted outline-none focus:border-accent/40 transition-colors disabled:opacity-50"
            style={{ maxHeight: "120px" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!hasContext || isStreaming || !input.trim()}
            className="px-4 py-2.5 bg-accent text-accent-text text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-opacity flex-shrink-0"
          >
            {isStreaming ? "..." : "Send"}
          </button>
        </div>
      </div>
    </>
  );
}
