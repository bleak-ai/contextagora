import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchRootContext, type RootFile } from "../../api/rootContext";
import { FilePreviewModal } from "./FilePreviewModal";

type PreviewKey = "claude_md" | "llms_txt";

const ROW_LABEL: Record<PreviewKey, string> = {
  claude_md: "CLAUDE.md",
  llms_txt: "llms.txt",
};

export function RootSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["root-context"],
    queryFn: fetchRootContext,
    staleTime: 30_000,
  });

  const [preview, setPreview] = useState<PreviewKey | null>(null);

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="flex items-center gap-1 text-[10px] tracking-wider text-text-muted">
          <span aria-hidden>🔒</span>
          ROOT
        </span>
      </div>

      <div className="space-y-1">
        <Row
          label={ROW_LABEL.claude_md}
          file={data?.claude_md}
          loading={isLoading}
          onOpen={() => setPreview("claude_md")}
        />
        <Row
          label={ROW_LABEL.llms_txt}
          file={data?.llms_txt}
          loading={isLoading}
          onOpen={() => setPreview("llms_txt")}
        />
      </div>

      {preview && data && (
        <FilePreviewModal
          title={ROW_LABEL[preview]}
          content={data[preview].content}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function Row({
  label,
  file,
  loading,
  onOpen,
}: {
  label: string;
  file: RootFile | undefined;
  loading: boolean;
  onOpen: () => void;
}) {
  if (loading) {
    return (
      <div className="px-1.5 py-1 text-[11px] text-text-muted italic">
        loading {label}…
      </div>
    );
  }
  if (!file || !file.exists) {
    return (
      <div className="flex items-center gap-2 rounded px-1.5 py-1 text-[11px] font-mono text-text-muted">
        <span className="text-[9px] leading-none">○</span>
        <span className="flex-1 truncate">{label}</span>
        <span className="text-[10px] italic">not present</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] font-mono transition-colors hover:bg-accent/10"
    >
      <span className="text-[9px] leading-none text-accent/60">●</span>
      <span className="flex-1 truncate text-text font-medium">{label}</span>
    </button>
  );
}
