import type { ComponentPropsWithoutRef } from "react";
import type { TextMessagePartProps } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";

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

const REMARK_PLUGINS = [remarkGfm];
const MD_COMPONENTS = { a: DownloadLink };

export const MarkdownText = (_props: TextMessagePartProps) => (
  <MarkdownTextPrimitive
    className="aui-md"
    remarkPlugins={REMARK_PLUGINS}
    components={MD_COMPONENTS}
  />
);
