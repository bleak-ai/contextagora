import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import {
  fetchModule,
  fetchModuleFiles,
  fetchModuleFile,
  saveModuleFile,
  deleteModuleFile,
  updateModule,
  generateModule,
} from "../api/modules";
import { EditorHeader } from "./modules/EditorHeader";
import { EditorSidebar } from "./modules/EditorSidebar";
import { EditorContent } from "./modules/EditorContent";

const routeApi = getRouteApi("/modules/$name");

interface OpenFile {
  content: string;
  dirty: boolean;
  original: string;
}

export function ModuleEditor() {
  const { name } = routeApi.useParams();
  const queryClient = useQueryClient();

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["module-detail", name],
    queryFn: () => fetchModule(name),
  });

  const { data: filesData } = useQuery({
    queryKey: ["module-files", name],
    queryFn: () => fetchModuleFiles(name),
  });

  const files = filesData?.files || [];

  // Local editor state
  const [summary, setSummary] = useState("");
  const [secrets, setSecrets] = useState<string[]>([]);
  const [openFiles, setOpenFiles] = useState<Map<string, OpenFile>>(new Map());
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [mode, setMode] = useState<"files" | "secrets">("files");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Track server values for dirty detection
  const serverSummary = useRef("");
  const serverSecrets = useRef<string[]>([]);

  // Initialize state when detail loads
  useEffect(() => {
    if (detail) {
      setSummary(detail.summary);
      setSecrets(detail.secrets);
      serverSummary.current = detail.summary;
      serverSecrets.current = detail.secrets;
    }
  }, [detail]);

  // Compute dirty state
  const summaryDirty = summary !== serverSummary.current;
  const secretsDirty =
    JSON.stringify(secrets) !== JSON.stringify(serverSecrets.current);
  const filesDirty = Array.from(openFiles.values()).some((f) => f.dirty);
  const isDirty = summaryDirty || secretsDirty || filesDirty;

  // Open a file in the editor
  const handleSelectFile = useCallback(
    async (path: string) => {
      setActiveFile(path);
      setMode("files");
      if (!openFiles.has(path)) {
        try {
          const file = await fetchModuleFile(name, path);
          setOpenFiles((prev) => {
            const next = new Map(prev);
            next.set(path, {
              content: file.content,
              dirty: false,
              original: file.content,
            });
            return next;
          });
        } catch {
          // File might not have content yet (new file)
          setOpenFiles((prev) => {
            const next = new Map(prev);
            next.set(path, { content: "", dirty: false, original: "" });
            return next;
          });
        }
      }
    },
    [name, openFiles],
  );

  const handleFileChange = useCallback((path: string, content: string) => {
    setOpenFiles((prev) => {
      const next = new Map(prev);
      const file = next.get(path);
      if (file) {
        next.set(path, {
          ...file,
          content,
          dirty: content !== file.original,
        });
      }
      return next;
    });
  }, []);

  const handleDeleteFile = useCallback(
    async (path: string) => {
      await deleteModuleFile(name, path);
      queryClient.invalidateQueries({ queryKey: ["module-files", name] });
      setOpenFiles((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
      if (activeFile === path) {
        setActiveFile(null);
      }
    },
    [name, activeFile, queryClient],
  );

  const handleAddFile = useCallback(
    async (path: string) => {
      await saveModuleFile(name, path, "");
      queryClient.invalidateQueries({ queryKey: ["module-files", name] });
      // Open the new file
      setOpenFiles((prev) => {
        const next = new Map(prev);
        next.set(path, { content: "", dirty: false, original: "" });
        return next;
      });
      setActiveFile(path);
      setMode("files");
    },
    [name, queryClient],
  );

  const handleSave = useCallback(async () => {
    if (!detail || isSaving) return;
    const currentInfoContent = openFiles.get("info.md")?.content ?? detail.content;
    setIsSaving(true);

    try {
      const promises: Promise<unknown>[] = [];

      // Save module-level changes (summary, secrets)
      if (summaryDirty || secretsDirty) {
        promises.push(
          updateModule(name, {
            content: currentInfoContent,
            summary,
            secrets,
          }).then(() => {
            serverSummary.current = summary;
            serverSecrets.current = secrets;
          }),
        );
      }

      // Save dirty files
      for (const [path, file] of openFiles) {
        if (file.dirty) {
          promises.push(
            saveModuleFile(name, path, file.content).then(() => {
              setOpenFiles((prev) => {
                const next = new Map(prev);
                const f = next.get(path);
                if (f) {
                  next.set(path, {
                    ...f,
                    dirty: false,
                    original: f.content,
                  });
                }
                return next;
              });
            }),
          );
        }
      }

      await Promise.all(promises);

      queryClient.invalidateQueries({ queryKey: ["module-detail", name] });
      queryClient.invalidateQueries({ queryKey: ["module-files", name] });
    } finally {
      setIsSaving(false);
    }
  }, [
    detail,
    isSaving,
    name,
    summary,
    secrets,
    summaryDirty,
    secretsDirty,
    openFiles,
    queryClient,
  ]);

  const handleGenerate = useCallback(async () => {
    // Get info.md content — from open files if edited, otherwise from server
    const infoFile = openFiles.get("info.md");
    const content = infoFile ? infoFile.content : detail?.content || "";
    if (!content.trim()) return;

    setIsGenerating(true);
    try {
      const result = await generateModule(name, content);
      setSummary(result.summary);
    } catch (err) {
      console.error("Generate failed:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [name, openFiles, detail]);

  if (detailLoading || !detail) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm text-text-muted">Loading...</span>
      </div>
    );
  }

  const canGenerate = (openFiles.get("info.md")?.content ?? detail?.content ?? "").trim().length > 0 && !isGenerating && !isSaving;

  // Build openFiles map for EditorContent (without `original` field)
  const contentOpenFiles = new Map<string, { content: string; dirty: boolean }>();
  for (const [path, file] of openFiles) {
    contentOpenFiles.set(path, { content: file.content, dirty: file.dirty });
  }

  return (
    <div className="flex flex-col h-full">
      <EditorHeader
        name={name}
        isDirty={isDirty}
        isSaving={isSaving}
        isGenerating={isGenerating}
        canGenerate={canGenerate}
        onSave={handleSave}
        onGenerate={handleGenerate}
      />

      {/* Summary bar */}
      <div className="flex items-start gap-3 px-4 py-2 border-b border-border bg-bg-raised/50">
        <span className="text-[10px] text-text-muted uppercase tracking-wide mt-2 flex-shrink-0">
          Summary
        </span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          className="flex-1 bg-bg-input border border-border rounded px-3 py-1.5 text-sm text-text resize-none outline-none focus:border-accent/40"
        />
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        <EditorSidebar
          files={files}
          secrets={secrets}
          activeFile={activeFile}
          mode={mode}
          onSelectFile={handleSelectFile}
          onDeleteFile={handleDeleteFile}
          onAddFile={handleAddFile}
          onSetMode={setMode}
        />
        <EditorContent
          mode={mode}
          openFiles={contentOpenFiles}
          activeFile={activeFile}
          secrets={secrets}
          onFileChange={handleFileChange}
          onSelectFile={handleSelectFile}
          onSecretsChange={setSecrets}
        />
      </div>
    </div>
  );
}
