import { useState } from "react";
import { Modal } from "../Modal";
import { useSocialPost } from "../../hooks/useSocialPost";
import { SocialPostCard } from "./SocialPostCard";
import { THEMES, type Theme } from "./themes";

type Props = {
  sessionId: string;
  onClose: () => void;
};

function randomTheme(excludeId?: string): Theme {
  const pool = excludeId ? THEMES.filter((t) => t.id !== excludeId) : THEMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function SocialPostModal({ sessionId, onClose }: Props) {
  const query = useSocialPost(sessionId);
  const [theme, setTheme] = useState<Theme>(() => randomTheme());

  return (
    <Modal onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-bg-raised border border-border rounded-lg w-[520px] max-w-[90vw] max-h-[90vh] overflow-auto"
      >
        {query.isSuccess && query.data && (
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Theme · <span className="text-text">{theme.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setTheme((cur) => randomTheme(cur.id))}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:opacity-90 transition"
            >
              <span
                aria-hidden
                className="inline-flex w-4 h-4 rounded-sm overflow-hidden ring-1 ring-white/30"
                style={{ backgroundColor: theme.bg }}
              >
                <span
                  className="w-full h-full"
                  style={{
                    background: `linear-gradient(135deg, ${theme.bg} 50%, ${theme.accent} 50%)`,
                  }}
                />
              </span>
              Shuffle theme
            </button>
          </div>
        )}

        {query.isLoading && (
          <div className="p-10 text-center text-text-muted">
            Writing the post…
          </div>
        )}

        {query.isError && (
          <div className="p-8 text-center">
            <div className="text-text mb-4">
              {query.error?.message ?? "Couldn't generate the post."}
            </div>
            <button
              onClick={() => query.refetch()}
              className="px-4 py-2 bg-accent text-white rounded hover:opacity-90"
            >
              Retry
            </button>
          </div>
        )}

        {query.isSuccess && query.data && (
          <div style={{ zoom: 0.85 }}>
            <SocialPostCard payload={query.data} theme={theme} />
          </div>
        )}
      </div>
    </Modal>
  );
}
