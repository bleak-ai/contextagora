import { useRef, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";
import type { TextMessagePartProps } from "@assistant-ui/react";
import { MessagePartPrimitive } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";

const TypingIndicator = () => (
  <span className="typing-indicator">
    <span className="typing-ping" />
    <span className="typing-core" />
  </span>
);

const DownloadLink = (props: ComponentPropsWithoutRef<"a">) => {
  const { href, children, ...rest } = props;
  const isDownload = href?.startsWith("/api/files/download");

  if (isDownload) {
    return (
      <a
        href={href}
        download
        className="inline-flex items-center gap-1.5 text-accent hover:text-accent-hover underline"
        {...rest}
      >
        <svg
          className="w-3.5 h-3.5 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3"
          />
        </svg>
        {children}
      </a>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
};

type PreProps = ComponentPropsWithoutRef<"pre"> & { node?: unknown };

const CopyablePre = (props: PreProps) => {
  // Strip hast `node` so it never lands on the DOM.
  const { children, node: _node, ...rest } = props;
  void _node;
  const preRef = useRef<HTMLPreElement | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const codeEl = preRef.current?.querySelector("code");
    const text = (codeEl?.innerText ?? preRef.current?.innerText ?? "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be blocked (insecure context, denied permission); silent no-op.
    }
  };

  // Wrapper carries `relative group` so positioning is isolated from
  // .aui-md pre styles and from @assistant-ui/react-markdown's pre wiring.
  return (
    <div className="relative group">
      <pre ref={preRef} {...rest}>
        {children}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-3 right-3 px-2 py-1 text-[11px] font-medium rounded border border-border bg-bg-raised text-text-muted opacity-0 group-hover:opacity-100 hover:text-text transition"
        aria-label={copied ? "Copied" : "Copy code"}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
};

type ImgProps = ComponentPropsWithoutRef<"img"> & { node?: unknown };

const CopyableImage = (props: ImgProps) => {
  const { src, alt, node: _node, ...rest } = props;
  void _node;
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleCopy = async () => {
    if (!src) return;
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`fetch ${response.status}`);
      const raw = await response.blob();
      // ClipboardItem is fussy about MIME types — most browsers only
      // permit image/png. If the source is already PNG, use it directly;
      // otherwise re-encode through a canvas.
      let blob = raw;
      if (raw.type !== "image/png") {
        const bitmap = await createImageBitmap(raw);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
        });
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setFailed(true);
      window.setTimeout(() => setFailed(false), 2000);
    }
  };

  const label = failed ? "Failed" : copied ? "Copied" : "Copy image";

  return (
    <span className="relative inline-block group/img my-2">
      <img src={src} alt={alt ?? ""} {...rest} className="max-w-full rounded border border-border" />
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 text-[11px] font-medium rounded border border-border bg-bg-raised text-text-muted opacity-0 group-hover/img:opacity-100 hover:text-text transition"
        aria-label={label}
      >
        {label}
      </button>
    </span>
  );
};

const REMARK_PLUGINS = [remarkGfm];
const MD_COMPONENTS = { a: DownloadLink, pre: CopyablePre, img: CopyableImage };

type MarkdownTextProps = TextMessagePartProps & {
  /**
   * Optional text transform applied before markdown processing. Forwarded
   * to MarkdownTextPrimitive. Used by AssistantText to strip the
   * `(context: ...)` pointer line before rendering, so it can be
   * re-rendered as a clickable element separately.
   */
  preprocess?: (text: string) => string;
};

export const MarkdownText = (props: MarkdownTextProps) => (
  <>
    <MarkdownTextPrimitive
      className="aui-md"
      remarkPlugins={REMARK_PLUGINS}
      components={MD_COMPONENTS}
      preprocess={props.preprocess}
    />
    <MessagePartPrimitive.InProgress>
      <TypingIndicator />
    </MessagePartPrimitive.InProgress>
  </>
);
