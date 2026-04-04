import type { TextMessagePartProps } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";

export const MarkdownText = (_props: TextMessagePartProps) => (
  <MarkdownTextPrimitive className="aui-md" remarkPlugins={[remarkGfm]} />
);
