import { useEffect, useRef, useState } from "react";
import { rasterize, saveToTmp, downloadAsPng } from "./imageActions";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  SocialTextKind,
  SocialTextPayload,
} from "../../api/socialText";
import type { SocialPostPayload } from "../../api/socialPost";

type Props = {
  kind: SocialTextKind;
  card: SocialPostPayload;
  cardRef: React.RefObject<HTMLDivElement | null>;
  mutation: UseMutationResult<SocialTextPayload, Error, SocialPostPayload>;
};

type CopyState = "idle" | "copied" | "error";

const CONFIG: Record<
  SocialTextKind,
  {
    hardLimit: number;
    softLimit: number;
    rows: number;
    section: string;
    copyText: string;
    generating: string;
    errorFallback: string;
    regenerateConfirm: string;
  }
> = {
  tweet: {
    hardLimit: 280,
    softLimit: 270,
    rows: 6,
    section: "Tweet",
    copyText: "Copy tweet",
    generating: "Writing the tweet…",
    errorFallback: "Couldn't generate the tweet.",
    regenerateConfirm:
      "Regenerate will replace your edits with a fresh tweet. Continue?",
  },
  linkedin: {
    hardLimit: 3000,
    softLimit: 2800,
    rows: 12,
    section: "LinkedIn post",
    copyText: "Copy post",
    generating: "Writing the post…",
    errorFallback: "Couldn't generate the LinkedIn post.",
    regenerateConfirm:
      "Regenerate will replace your edits with a fresh post. Continue?",
  },
};

function slugifyTitle(title: string): string {
  return (
    (title || "card")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "card"
  );
}

export function SocialTextSection({ kind, card, cardRef, mutation }: Props) {
  const cfg = CONFIG[kind];
  const [text, setText] = useState("");
  const [textCopy, setTextCopy] = useState<CopyState>("idle");
  const [imageCopy, setImageCopy] = useState<CopyState>("idle");
  const [imageBusy, setImageBusy] = useState(false);
  const [saveState, setSaveState] = useState<CopyState>("idle");
  const [saveBusy, setSaveBusy] = useState(false);
  const [downloadState, setDownloadState] = useState<"idle" | "done" | "error">(
    "idle",
  );
  const [downloadBusy, setDownloadBusy] = useState(false);
  const isPristine = useRef(true);

  // Seed the textarea once the mutation lands (and re-seed on every regenerate).
  useEffect(() => {
    if (mutation.isSuccess && mutation.data) {
      setText(mutation.data.text);
      isPristine.current = true;
    }
  }, [mutation.isSuccess, mutation.data]);

  const onChangeText = (next: string) => {
    setText(next);
    isPristine.current = false;
  };

  const onCopyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setTextCopy("copied");
      setTimeout(() => setTextCopy("idle"), 1500);
    } catch {
      setTextCopy("error");
      setTimeout(() => setTextCopy("idle"), 2000);
    }
  };

  const onCopyImage = async () => {
    const node = cardRef.current;
    if (!node) {
      setImageCopy("error");
      setTimeout(() => setImageCopy("idle"), 2000);
      return;
    }
    setImageBusy(true);
    try {
      const blob = await rasterize(node);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setImageCopy("copied");
      setTimeout(() => setImageCopy("idle"), 1500);
    } catch {
      setImageCopy("error");
      setTimeout(() => setImageCopy("idle"), 2000);
    } finally {
      setImageBusy(false);
    }
  };

  const onSaveToTmp = async () => {
    const node = cardRef.current;
    if (!node) {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2000);
      return;
    }
    setSaveBusy(true);
    try {
      const { path } = await saveToTmp(node);
      await navigator.clipboard.writeText(path);
      setSaveState("copied");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2000);
    } finally {
      setSaveBusy(false);
    }
  };

  const onDownload = async () => {
    const node = cardRef.current;
    if (!node) {
      setDownloadState("error");
      setTimeout(() => setDownloadState("idle"), 2000);
      return;
    }
    setDownloadBusy(true);
    try {
      await downloadAsPng(node, `${slugifyTitle(card.title)}.png`);
      setDownloadState("done");
      setTimeout(() => setDownloadState("idle"), 2000);
    } catch {
      setDownloadState("error");
      setTimeout(() => setDownloadState("idle"), 2000);
    } finally {
      setDownloadBusy(false);
    }
  };

  const onRegenerate = () => {
    if (!isPristine.current) {
      const ok = window.confirm(cfg.regenerateConfirm);
      if (!ok) return;
    }
    mutation.mutate(card);
  };

  if (mutation.isIdle) return null;

  const charCount = text.length;
  const charColor =
    charCount > cfg.hardLimit
      ? "text-red-500"
      : charCount > cfg.softLimit
        ? "text-amber-500"
        : "text-text-muted";

  return (
    <div className="border-b border-border px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          {cfg.section}
        </div>
        {mutation.isSuccess && (
          <div className={`text-xs tabular-nums ${charColor}`}>
            {charCount} / {cfg.hardLimit}
          </div>
        )}
      </div>

      {mutation.isPending && (
        <div className="py-6 text-center text-sm text-text-muted">
          {cfg.generating}
        </div>
      )}

      {mutation.isError && (
        <div className="py-3">
          <div className="text-text mb-2 text-sm">
            {mutation.error?.message ?? cfg.errorFallback}
          </div>
          <button
            type="button"
            onClick={() => mutation.mutate(card)}
            className="px-3 py-1.5 bg-accent text-white rounded text-sm hover:opacity-90"
          >
            Retry
          </button>
        </div>
      )}

      {mutation.isSuccess && (
        <>
          <textarea
            value={text}
            onChange={(e) => onChangeText(e.target.value)}
            spellCheck={false}
            rows={cfg.rows}
            className="w-full bg-bg border border-border rounded-md p-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              type="button"
              onClick={onCopyText}
              disabled={charCount === 0}
              className="px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {textCopy === "copied"
                ? "Copied!"
                : textCopy === "error"
                  ? "Copy failed"
                  : cfg.copyText}
            </button>
            <button
              type="button"
              onClick={onCopyImage}
              disabled={imageBusy}
              className="px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {imageBusy
                ? "Rendering…"
                : imageCopy === "copied"
                  ? "Image copied!"
                  : imageCopy === "error"
                    ? "Copy failed"
                    : "Copy image"}
            </button>
            <button
              type="button"
              onClick={onSaveToTmp}
              disabled={saveBusy}
              className="px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saveBusy
                ? "Saving…"
                : saveState === "copied"
                  ? "Path copied!"
                  : saveState === "error"
                    ? "Save failed"
                    : "Save to /tmp"}
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={downloadBusy}
              className="px-3 py-1.5 bg-accent text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {downloadBusy
                ? "Rendering…"
                : downloadState === "done"
                  ? "Downloaded!"
                  : downloadState === "error"
                    ? "Download failed"
                    : "Download"}
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={mutation.isPending}
              className="px-3 py-1.5 border border-border rounded text-sm hover:bg-bg-raised disabled:opacity-50"
            >
              {mutation.isPending ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
