import { create } from "zustand";

interface ModuleEditorState {
  editingModule: string | null;
  openModuleEditor: (name: string) => void;
  closeModuleEditor: () => void;
}

export const useModuleEditorStore = create<ModuleEditorState>()((set) => ({
  editingModule: null,
  openModuleEditor: (name) => set({ editingModule: name }),
  closeModuleEditor: () => set({ editingModule: null }),
}));
