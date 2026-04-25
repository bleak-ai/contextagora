import { useEffect, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import type { UseMutationResult } from "@tanstack/react-query";
import type { LinkedinPayload } from "../../api/linkedin";
import type { SocialPostPayload } from "../../api/socialPost";

type Props = {
  card: SocialPostPayload;
  cardRef: React.RefObject<HTMLDivElement | null>;
  mutation: UseMutationResult<LinkedinPayload, Error, SocialPostPayload>;
};

const HARD_LIMIT = 3000;
const SOFT_LIMIT = 2800;

type CopyState = "idle" | "copied" | "error";

export function LinkedinSection({ card, cardRef, mutation: linkedin }: Props) {
  const [text, setText] = useState("");
  const [textCopy, setTextCopy] = useState<CopyState>("idle");
  const [imageCopy, setImageCopy] = useState<CopyState>("idle");
  const [imageBusy, setImageBusy] = useState(false);
  const isPristine = useRef(true);

  useEffect(() => {
    if (linkedin.isSuccess && linkedin.data) {
      setText(linkedin.data.text);
      isPristine.current = true;
    }
  }, [linkedin.isSuccess, linkedin.data]);

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
      const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true });
      if (!blob) throw new Error("rasterize failed");
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

  const onRegenerate = () => {
    if (!isPristine.current) {
      const ok = window.confirm(
        "Regenerate will replace your edits with a fresh post. Continue?",
      );
      if (!ok) return;
    }
    linkedin.mutate(card);
  };

  if (linkedin.isIdle) return null;

  const charCount = text.length;
  const charColor =
    charCount > HARD_LIMIT
      ? "text-red-500"
      : charCount > SOFT_LIMIT
        ? "text-amber-500"
        : "text-text-muted";

  return (
    <div className="border-b border-border px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          LinkedIn post
        </div>
        {linkedin.isSuccess && (
          <div className={`text-xs tabular-nums ${charColor}`}>
            {charCount} / {HARD_LIMIT}
          </div>
        )}
      </div>

      {linkedin.isPending && (
        <div className="py-6 text-center text-sm text-text-muted">
          Writing the post…
        </div>
      )}

      {linkedin.isError && (
        <div className="py-3">
          <div className="text-text mb-2 text-sm">
            {linkedin.error?.message ?? "Couldn't generate the LinkedIn post."}
          </div>
          <button
            type="button"
            onClick={() => linkedin.mutate(card)}
            className="px-3 py-1.5 bg-accent text-white rounded text-sm hover:opacity-90"
          >
            Retry
          </button>
        </div>
      )}

      {linkedin.isSuccess && (
        <>
          <textarea
            value={text}
            onChange={(e) => onChangeText(e.target.value)}
            spellCheck={false}
            rows={12}
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
                  : "Copy post"}
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
              onClick={onRegenerate}
              disabled={linkedin.isPending}
              className="px-3 py-1.5 border border-border rounded text-sm hover:bg-bg-raised disabled:opacity-50"
            >
              {linkedin.isPending ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
