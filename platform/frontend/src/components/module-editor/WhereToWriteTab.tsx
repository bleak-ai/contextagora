import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchModuleFile, saveModuleFile } from "../../api/modules";

type GrowthArea = { name: string; path: string; template: string };

const HEADING = "## Where to write";

function parseSection(llms: string): GrowthArea[] {
  const m = llms.match(/^## Where to write\s*$/m);
  if (!m) return [];
  const start = m.index! + m[0].length;
  const rest = llms.slice(start);
  const next = rest.search(/^## /m);
  const body = next === -1 ? rest : rest.slice(0, next);
  const out: GrowthArea[] = [];
  for (const line of body.split("\n")) {
    const lm = line
      .trim()
      .match(
        /^-\s+([a-z0-9_-]+)\s*->\s*(\S+)\s*\(template:\s*(\S+)\s*\)$/,
      );
    if (lm) out.push({ name: lm[1], path: lm[2], template: lm[3] });
  }
  return out;
}

function formatSection(areas: GrowthArea[]): string {
  const lines = [HEADING, ""];
  for (const a of areas)
    lines.push(`- ${a.name} -> ${a.path} (template: ${a.template})`);
  lines.push("");
  return lines.join("\n");
}

function replaceSection(llms: string, areas: GrowthArea[]): string {
  const newSection = formatSection(areas);
  const m = llms.match(/^## Where to write\s*$/m);
  if (m) {
    const start = m.index!;
    const after = llms.slice(start + m[0].length);
    const next = after.search(/^## /m);
    const end = next === -1 ? llms.length : start + m[0].length + next;
    return llms.slice(0, start) + newSection + llms.slice(end);
  }
  // No existing section: insert before the next ## heading or at end.
  const next = llms.search(/^## /m);
  if (next === -1) {
    const sep = llms.endsWith("\n\n") ? "" : llms.endsWith("\n") ? "\n" : "\n\n";
    return llms + sep + newSection;
  }
  return llms.slice(0, next) + newSection + "\n" + llms.slice(next);
}

export function WhereToWriteTab({ moduleName }: { moduleName: string }) {
  const qc = useQueryClient();
  const { data: file } = useQuery({
    queryKey: ["module-file", moduleName, "llms.txt"],
    queryFn: () => fetchModuleFile(moduleName, "llms.txt"),
  });
  const llms = file?.content ?? "";
  const [areas, setAreas] = useState<GrowthArea[]>([]);

  useEffect(() => {
    setAreas(parseSection(llms));
  }, [llms]);

  const save = useMutation({
    mutationFn: (next: GrowthArea[]) =>
      saveModuleFile(moduleName, "llms.txt", replaceSection(llms, next)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["module-file", moduleName, "llms.txt"] });
      qc.invalidateQueries({ queryKey: ["modules"] });
    },
  });

  function update(i: number, patch: Partial<GrowthArea>) {
    setAreas((cur) =>
      cur.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    );
  }
  function add() {
    setAreas((cur) => [
      ...cur,
      {
        name: "new",
        path: "new/<date-slug>.md",
        template: "new/_template.md",
      },
    ]);
  }
  function remove(i: number) {
    setAreas((cur) => cur.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">
        Tell the agent where to write specific kinds of content inside this
        module. Saves to <code>llms.txt</code>; the rest of the file is
        preserved.
      </p>
      <div className="space-y-2">
        {areas.map((a, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input
              className="col-span-2 border rounded px-2 py-1 text-sm"
              value={a.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="name"
            />
            <input
              className="col-span-5 border rounded px-2 py-1 text-sm font-mono"
              value={a.path}
              onChange={(e) => update(i, { path: e.target.value })}
              placeholder="findings/<date-slug>.md"
            />
            <input
              className="col-span-4 border rounded px-2 py-1 text-sm font-mono"
              value={a.template}
              onChange={(e) => update(i, { template: e.target.value })}
              placeholder="findings/_template.md"
            />
            <button
              className="col-span-1 text-xs text-red-600 hover:underline"
              onClick={() => remove(i)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          className="text-sm border px-2 py-1 rounded"
          onClick={add}
        >
          + Add
        </button>
        <button
          className="text-sm bg-neutral-900 text-white px-3 py-1 rounded"
          onClick={() => save.mutate(areas)}
          disabled={save.isPending}
        >
          {save.isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
