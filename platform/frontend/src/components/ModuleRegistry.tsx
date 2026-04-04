import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchModules,
  fetchModule,
  createModule,
  updateModule,
  deleteModule,
} from "../api/modules";
import { ModuleForm } from "./ModuleForm";

type FormState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; name: string };

export function ModuleRegistry() {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<FormState>({ mode: "closed" });

  const { data: modulesData } = useQuery({
    queryKey: ["modules"],
    queryFn: fetchModules,
  });

  const [editData, setEditData] = useState<{
    content: string;
    summary: string;
    secrets: string[];
  } | null>(null);

  const modules = modulesData?.modules || [];

  const createMutation = useMutation({
    mutationFn: createModule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modules"] });
      setFormState({ mode: "closed" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ name, data }: { name: string; data: { content: string; summary: string; secrets: string[] } }) =>
      updateModule(name, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modules"] });
      setFormState({ mode: "closed" });
      setEditData(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteModule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modules"] });
    },
  });

  const handleEdit = async (name: string) => {
    const detail = await fetchModule(name);
    setEditData({ content: detail.content, summary: detail.summary, secrets: detail.secrets });
    setFormState({ mode: "edit", name });
  };

  const handleDelete = (name: string) => {
    if (confirm(`Delete module "${name}"? This cannot be undone.`)) {
      deleteMutation.mutate(name);
    }
  };

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text">
          Module Registry ({modules.length})
        </h2>
        <button
          onClick={() => setFormState({ mode: "create" })}
          className="text-xs text-accent hover:text-accent-hover"
        >
          + New Module
        </button>
      </div>

      {formState.mode === "create" && (
        <div className="mb-4 p-4 border border-border rounded-lg bg-bg-raised">
          <ModuleForm
            mode="create"
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => setFormState({ mode: "closed" })}
            isPending={createMutation.isPending}
          />
        </div>
      )}

      {formState.mode === "edit" && editData && (
        <div className="mb-4 p-4 border border-border rounded-lg bg-bg-raised">
          <ModuleForm
            mode="edit"
            initialName={formState.name}
            initialContent={editData.content}
            initialSummary={editData.summary}
            initialSecrets={editData.secrets}
            onSubmit={(data) =>
              updateMutation.mutate({
                name: formState.name,
                data: { content: data.content, summary: data.summary, secrets: data.secrets },
              })
            }
            onCancel={() => {
              setFormState({ mode: "closed" });
              setEditData(null);
            }}
            isPending={updateMutation.isPending}
          />
        </div>
      )}

      <div className="space-y-1">
        {modules.map((name) => (
          <div
            key={name}
            className="flex items-center justify-between px-3 py-2 rounded hover:bg-bg-hover"
          >
            <span className="text-sm text-text">{name}</span>
            <div className="flex gap-2">
              <button
                onClick={() => handleEdit(name)}
                className="text-xs text-text-muted hover:text-text-secondary"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(name)}
                disabled={deleteMutation.isPending}
                className="text-xs text-danger/60 hover:text-danger"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
