import type { FC } from "react";

interface Props {
  prompt: string;
  onClick: (prompt: string) => void;
}

export const SuggestionPill: FC<Props> = ({ prompt, onClick }) => (
  <button
    type="button"
    onClick={() => onClick(prompt)}
    className="mt-2 mr-2 inline-flex items-center rounded-full border border-border bg-bg-raised px-3 py-1 text-sm text-text-secondary hover:bg-bg-hover hover:border-accent/40 hover:text-text transition-colors"
  >
    <span className="mr-1.5 text-accent text-xs">▶</span>
    {prompt}
  </button>
);
