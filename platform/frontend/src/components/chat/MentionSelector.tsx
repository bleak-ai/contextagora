import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { fetchWorkspaceFiles, type WorkspaceFile } from "../../api/workspace";

/**
 * Walk backwards from `cursor` looking for an `@` that starts a mention.
 * Returns null if the cursor isn't inside a mention.
 *
 * Rules:
 *  - The `@` must be at the start of input or preceded by whitespace
 *    (so `foo@bar.com` does NOT trigger).
 *  - Whitespace before the `@` (between `@` and cursor) breaks the mention.
 */
export function findActiveMention(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "@") {
      if (i === 0 || /\s/.test(text[i - 1])) {
        return { start: i, query: text.slice(i + 1, cursor) };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

interface UseMentionPickerArgs {
  inputText: string;
  cursorPosition: number;
  dismissed: boolean;
  onSelect: (file: WorkspaceFile) => void;
  onDismiss: () => void;
}

const MAX_RESULTS = 8;

export function useMentionPicker({
  inputText,
  cursorPosition,
  dismissed,
  onSelect,
  onDismiss,
}: UseMentionPickerArgs) {
  const mention = findActiveMention(inputText, cursorPosition);
  const active = mention !== null && !dismissed;

  const { data } = useQuery({
    queryKey: ["workspace-files"],
    queryFn: fetchWorkspaceFiles,
    staleTime: 30_000,
    enabled: active,
  });

  const all = data?.files ?? [];
  const query = mention?.query ?? "";
  const matches = active
    ? all.filter((f) => f.label.toLowerCase().includes(query.toLowerCase()))
    : [];
  const filtered = matches.slice(0, MAX_RESULTS);

  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    setActiveIndex(0);
  }, [query, active]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!active) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length > 0)
        setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length > 0)
        setActiveIndex(
          (i) => (i - 1 + filtered.length) % filtered.length,
        );
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (filtered.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onDismiss();
    }
  };

  return {
    active,
    mention,
    filtered,
    totalMatches: matches.length,
    activeIndex,
    setActiveIndex,
    handleKeyDown,
    hasModules: all.length > 0,
  };
}

export function MentionSelector({
  filtered,
  totalMatches,
  hasModules,
  activeIndex,
  setActiveIndex,
  onSelect,
}: {
  filtered: WorkspaceFile[];
  totalMatches: number;
  hasModules: boolean;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onSelect: (file: WorkspaceFile) => void;
}) {
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-bg border border-border rounded-lg shadow-lg overflow-hidden z-10">
      {!hasModules && (
        <div className="px-4 py-2.5 text-sm text-text-muted">
          no modules loaded — load one in the sidebar
        </div>
      )}
      {hasModules && filtered.length === 0 && (
        <div className="px-4 py-2.5 text-sm text-text-muted">no matches</div>
      )}
      {filtered.map((file, i) => {
        const slash = file.label.indexOf("/");
        const modulePart = file.label.slice(0, slash + 1);
        const pathPart = file.label.slice(slash + 1);
        return (
          <button
            key={file.label}
            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
              i === activeIndex
                ? "bg-accent/10 text-text"
                : "text-text-secondary hover:bg-bg-hover"
            }`}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(file);
            }}
          >
            <span>📄</span>
            <span className="text-text-muted">{modulePart}</span>
            <span className="truncate">{pathPart}</span>
          </button>
        );
      })}
      {totalMatches > filtered.length && (
        <div className="px-4 py-1.5 text-xs text-text-muted border-t border-border">
          +{totalMatches - filtered.length} more — keep typing
        </div>
      )}
    </div>
  );
}
