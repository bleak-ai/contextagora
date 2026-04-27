import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { saveModuleFile } from "../../api/modules";

interface Props {
  moduleName: string;
  path: string;
  initialContent: string;
  toolbarTarget?: HTMLElement | null;
}

type Status = "idle" | "saving" | "saved" | "error";

const EXTENSIONS = [
  StarterKit,
  TaskList.configure({ HTMLAttributes: { class: "ctx-task-list" } }),
  TaskItem.configure({ nested: true, HTMLAttributes: { class: "ctx-task-item" } }),
  Markdown.configure({ html: false, tightLists: true, breaks: false, transformPastedText: true }),
];

function getMarkdown(editor: ReturnType<typeof useEditor>): string {
  if (!editor) return "";
  const storage = editor.storage as { markdown?: { getMarkdown: () => string } };
  return storage.markdown?.getMarkdown() ?? "";
}

export function MarkdownEditor({ moduleName, path, initialContent, toolbarTarget }: Props) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const lastSavedRef = useRef<string>(initialContent);

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: initialContent,
    editorProps: {
      attributes: {
        class: "aui-md ctx-md-editor outline-none min-h-[40vh]",
      },
    },
    onUpdate: ({ editor: e }) => {
      const md = (e.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? "";
      setDirty(md !== lastSavedRef.current);
      if (status === "saved") setStatus("idle");
    },
  });

  const save = async () => {
    if (!editor) return;
    const md = getMarkdown(editor);
    if (md === lastSavedRef.current) {
      setDirty(false);
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1200);
      return;
    }
    setStatus("saving");
    setErrorMsg(null);
    try {
      await saveModuleFile(moduleName, path, md);
      lastSavedRef.current = md;
      setDirty(false);
      setStatus("saved");
      queryClient.setQueryData(["module-file", moduleName, path], { path, content: md });
      window.setTimeout(() => setStatus("idle"), 1500);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  if (!editor) {
    return <p className="text-xs text-text-muted">loading editor…</p>;
  }

  const toolbar = (
    <div className="flex items-center gap-2 text-[11px]">
      {status === "saving" && <span className="text-text-muted">saving…</span>}
      {status === "saved" && !dirty && (
        <span className="text-accent inline-flex items-center gap-1">
          <Check className="w-3 h-3" /> saved
        </span>
      )}
      {status === "error" && (
        <span className="text-red-400" title={errorMsg ?? undefined}>
          save failed
        </span>
      )}
      {dirty && status !== "saving" && (
        <span className="inline-flex items-center gap-1 text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          unsaved
        </span>
      )}
      <span className="text-text-muted">⌘S</span>
      <button
        type="button"
        onClick={save}
        disabled={status === "saving" || !dirty}
        className={
          "text-[11px] font-medium px-2.5 py-1 rounded border transition " +
          (dirty
            ? "border-accent bg-accent text-accent-text hover:bg-accent-hover"
            : "border-border text-text-muted opacity-60")
        }
      >
        Save
      </button>
    </div>
  );

  return (
    <>
      {toolbarTarget ? createPortal(toolbar, toolbarTarget) : (
        <div className="mb-2 flex justify-end">{toolbar}</div>
      )}
      <EditorContent editor={editor} />
    </>
  );
}
