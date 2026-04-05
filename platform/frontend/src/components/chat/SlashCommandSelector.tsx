import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { fetchCommands } from "../../api/commands";

interface SlashCommandSelectorProps {
  filter: string;
  onSelect: (command: string) => void;
  onDismiss: () => void;
}

export function useSlashCommands({ filter, onSelect, onDismiss }: SlashCommandSelectorProps) {
  const { data } = useQuery({
    queryKey: ["commands"],
    queryFn: fetchCommands,
    staleTime: 60_000,
  });

  const commands = data?.commands ?? [];
  const filtered = commands.filter((cmd) =>
    cmd.name.toLowerCase().startsWith(filter.toLowerCase()),
  );

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [filter]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      onSelect(filtered[activeIndex].name);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onDismiss();
    }
  };

  return { filtered, activeIndex, setActiveIndex, handleKeyDown };
}

export function SlashCommandSelector({
  filtered,
  activeIndex,
  setActiveIndex,
  onSelect,
}: {
  filtered: { name: string; description: string }[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onSelect: (command: string) => void;
}) {
  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-bg border border-border rounded-lg shadow-lg overflow-hidden z-10">
      {filtered.map((cmd, i) => (
        <button
          key={cmd.name}
          className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${
            i === activeIndex
              ? "bg-accent/10 text-text"
              : "text-text-secondary hover:bg-bg-hover"
          }`}
          onMouseEnter={() => setActiveIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(cmd.name);
          }}
        >
          <span className="font-medium text-accent">/{cmd.name}</span>
          <span className="text-text-muted text-xs truncate">
            {cmd.description}
          </span>
        </button>
      ))}
    </div>
  );
}
