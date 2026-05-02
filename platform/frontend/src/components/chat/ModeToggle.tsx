import type { ChatMode } from "../../api/chat";

type Props = {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
};

// Maps the binary chat mode to a switch state.
// "normal" = context offloading ON (agent may propose writes with confirm).
// "quick"  = context offloading OFF (read-only).
export function ModeToggle({ mode, onChange }: Props) {
  const isOn = mode === "normal";
  const next: ChatMode = isOn ? "quick" : "normal";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      onClick={() => onChange(next)}
      title={
        isOn
          ? "Context offloading is ON — the agent can propose writes (with confirm)."
          : "Context offloading is OFF — read-only chat. The agent cannot write."
      }
      className="group inline-flex items-center gap-3 rounded-full border border-border bg-bg-raised pl-1.5 pr-4 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover hover:text-text transition-colors focus:outline-none focus:ring-1 focus:ring-accent/60"
    >
      <span
        className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors ${
          isOn ? "bg-accent" : "bg-border"
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 inline-block w-5 h-5 rounded-full bg-bg shadow-sm transition-transform ${
            isOn ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="leading-none">
        Context offloading
        <span
          className={`ml-2 tabular-nums ${
            isOn ? "text-accent" : "text-text-muted"
          }`}
        >
          {isOn ? "On" : "Off"}
        </span>
      </span>
    </button>
  );
}
