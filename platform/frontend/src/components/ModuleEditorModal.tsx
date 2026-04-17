import { useEffect, useCallback, useState } from "react";
import { useModuleEditorStore } from "../hooks/useModuleEditorStore";
import { ModuleEditor } from "./ModuleEditor";

export function ModuleEditorModal() {
  const editingModule = useModuleEditorStore((s) => s.editingModule);
  const closeModuleEditor = useModuleEditorStore((s) => s.closeModuleEditor);
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const attemptClose = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      closeModuleEditor();
    }
  }, [isDirty, closeModuleEditor]);

  const confirmDiscard = useCallback(() => {
    setShowConfirm(false);
    closeModuleEditor();
  }, [closeModuleEditor]);

  // Escape key handler
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showConfirm) {
          setShowConfirm(false);
        } else {
          attemptClose();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [attemptClose, showConfirm]);

  // Scroll lock
  useEffect(() => {
    const main = document.querySelector("main");
    if (main) {
      main.style.overflow = "hidden";
      return () => { main.style.overflow = ""; };
    }
  }, []);

  if (!editingModule) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Container */}
      <div className="relative w-[85vw] h-[90vh] bg-bg-raised rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden modal-enter">
        {/* Close button */}
        <button
          type="button"
          onClick={attemptClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text hover:bg-bg-hover transition-colors"
          title="Close editor"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Editor */}
        <ModuleEditor
          name={editingModule}
          onClose={attemptClose}
          onDirtyChange={setIsDirty}
        />
      </div>

      {/* Unsaved changes confirmation */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-bg-raised border border-border rounded-lg p-5 shadow-xl max-w-sm">
            <h3 className="text-sm font-semibold text-text mb-2">Unsaved changes</h3>
            <p className="text-xs text-text-secondary mb-4">
              You have unsaved changes. Are you sure you want to close?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded px-3 py-1.5 text-xs text-text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDiscard}
                className="rounded bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
