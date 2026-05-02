import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TreePanelState {
  open: boolean;
  setOpen: (value: boolean) => void;
  toggle: () => void;
}

export const useTreePanelStore = create<TreePanelState>()(
  persist(
    (set, get) => ({
      open: false,
      setOpen: (value) => set({ open: value }),
      toggle: () => set({ open: !get().open }),
    }),
    { name: "context-tree-panel" },
  ),
);
