import type { ChatMode } from "../../api/chat";

type Props = {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
};

export function ModeToggle({ mode, onChange }: Props) {
  const base =
    "px-2.5 py-1 text-[11px] font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-accent/60";
  const active = "bg-accent text-accent-text";
  const inactive = "bg-bg-raised text-text-secondary hover:text-text hover:bg-bg-hover";

  return (
    <div
      className="inline-flex rounded-md border border-border overflow-hidden"
      role="group"
      aria-label="Chat mode"
    >
      <button
        type="button"
        onClick={() => onChange("normal")}
        aria-pressed={mode === "normal"}
        title="Normal: agent can read and propose writes (with confirm)"
        className={`${base} ${mode === "normal" ? active : inactive}`}
      >
        Normal
      </button>
      <button
        type="button"
        onClick={() => onChange("quick")}
        aria-pressed={mode === "quick"}
        title="Quick: read-only chat. Agent cannot write anything."
        className={`${base} border-l border-border ${mode === "quick" ? active : inactive}`}
      >
        Quick
      </button>
    </div>
  );
}
