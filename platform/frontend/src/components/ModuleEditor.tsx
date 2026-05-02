import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchModule,
  fetchModuleFiles,
  fetchModuleFile,
  saveModuleFile,
  deleteModuleFile,
  updateModule,
} from "../api/modules";
import { EditorHeader } from "./modules/EditorHeader";
import { EditorSidebar } from "./modules/EditorSidebar";
import { EditorContent } from "./modules/EditorContent";
import type { OpenFile } from "./modules/types";

interface ModuleEditorProps {
  name: string;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function ModuleEditor({ name, onClose, onDirtyChange }: ModuleEditorProps) {
  const queryClient = useQueryClient();

  const { data: detail, isLoading: detailLoading, error: detailError } = useQuery({
    queryKey: ["module-detail", name],
    queryFn: () => fetchModule(name),
  });

  const { data: filesData } = useQuery({
    queryKey: ["module-files", name],
    queryFn: () => fetchModuleFiles(name),
  });

  const files = filesData?.files || [];

  const [secrets, setSecrets] = useState<string[]>([]);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [openFiles, setOpenFiles] = useState<Map<string, OpenFile>>(new Map());
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [mode, setMode] = useState<"files" | "secrets" | "requirements" | "where-to-write">("files");
  const [isSaving, setIsSaving] = useState(false);

  const serverSecrets = useRef<string[]>([]);
  const serverRequirements = useRef<string[]>([]);

  useEffect(() => {
    if (detail) {
      setSecrets(detail.secrets);
      setRequirements(detail.requirements);
      serverSecrets.current = detail.secrets;
      serverRequirements.current = detail.requirements;
    }
  }, [detail]);

  const secretsDirty =
    JSON.stringify(secrets) !== JSON.stringify(serverSecrets.current);
  const requirementsDirty =
    JSON.stringify(requirements) !== JSON.stringify(serverRequirements.current);
  const filesDirty = Array.from(openFiles.values()).some((f) => f.dirty);
  const isDirty = secretsDirty || requirementsDirty || filesDirty;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

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

      if (secretsDirty || requirementsDirty) {
        promises.push(
          updateModule(name, {
            content: currentInfoContent,
            summary: detail.summary,
            secrets,
            requirements,
          }).then(() => {
            serverSecrets.current = secrets;
            serverRequirements.current = requirements;
          }),
        );
      }

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
    secrets,
    requirements,
    secretsDirty,
    requirementsDirty,
    openFiles,
    queryClient,
  ]);

  if (detailError) {
    const message =
      detailError instanceof Error ? detailError.message : "Failed to load module";
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <span className="text-sm font-semibold text-red-400">
          Couldn't load "{name}"
        </span>
        <span className="text-xs text-text-muted">{message}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text"
        >
          Close
        </button>
      </div>
    );
  }

  if (detailLoading || !detail) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm text-text-muted">Loading...</span>
      </div>
    );
  }

  const contentOpenFiles = new Map<string, OpenFile>();
  for (const [path, file] of openFiles) {
    contentOpenFiles.set(path, { content: file.content, dirty: file.dirty, original: file.original });
  }

  return (
    <div className="flex flex-col h-full">
      <EditorHeader
        name={name}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onClose={onClose}
      />

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        <EditorSidebar
          files={files}
          secrets={secrets}
          requirements={requirements}
          activeFile={activeFile}
          mode={mode}
          onSelectFile={handleSelectFile}
          onDeleteFile={handleDeleteFile}
          onAddFile={handleAddFile}
          onSetMode={setMode}
        />
        <EditorContent
          mode={mode}
          moduleName={name}
          openFiles={contentOpenFiles}
          activeFile={activeFile}
          secrets={secrets}
          requirements={requirements}
          onFileChange={handleFileChange}
          onSelectFile={handleSelectFile}
          onSecretsChange={setSecrets}
          onRequirementsChange={setRequirements}
        />
      </div>
    </div>
  );
}
