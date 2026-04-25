import { useRef, useState } from "react";
import { Modal } from "../Modal";
import { useSocialPost } from "../../hooks/useSocialPost";
import { useTweet } from "../../hooks/useTweet";
import { useLinkedin } from "../../hooks/useLinkedin";
import { SocialPostCard } from "./SocialPostCard";
import { TweetSection } from "./TweetSection";
import { LinkedinSection } from "./LinkedinSection";
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
  const cardRef = useRef<HTMLDivElement | null>(null);
  const tweet = useTweet();
  const linkedin = useLinkedin();

  const card = query.data;

  return (
    <Modal onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-bg-raised border border-border rounded-lg w-[520px] max-w-[90vw] max-h-[90vh] overflow-auto"
      >
        {query.isSuccess && card && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Theme · <span className="text-text">{theme.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => tweet.mutate(card)}
                disabled={tweet.isPending}
                title="Create tweet"
                aria-label="Create tweet"
                className="w-9 h-9 flex items-center justify-center rounded-md border border-border text-text font-bold text-base hover:bg-bg disabled:opacity-50"
              >
                T
              </button>
              <button
                type="button"
                onClick={() => linkedin.mutate(card)}
                disabled={linkedin.isPending}
                title="Create LinkedIn post"
                aria-label="Create LinkedIn post"
                className="w-9 h-9 flex items-center justify-center rounded-md border border-border text-text font-bold text-base hover:bg-bg disabled:opacity-50"
              >
                L
              </button>
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

        {query.isSuccess && card && (
          <TweetSection card={card} cardRef={cardRef} mutation={tweet} />
        )}

        {query.isSuccess && card && (
          <LinkedinSection card={card} cardRef={cardRef} mutation={linkedin} />
        )}

        {query.isSuccess && card && (
          <div style={{ zoom: 0.85 }}>
            <div ref={cardRef}>
              <SocialPostCard payload={card} theme={theme} />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
