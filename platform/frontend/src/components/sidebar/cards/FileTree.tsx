import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Zap,
} from "lucide-react";
import type { CheckboxCount } from "../../../api/workspace";

interface FileTreeProps {
  paths: string[];
  onSelect: (path: string) => void;
  checkboxes?: Record<string, CheckboxCount>;
}

type FileNode = { kind: "file"; name: string; path: string };
type FolderNode = { kind: "folder"; name: string; children: TreeNode[] };
type TreeNode = FileNode | FolderNode;

interface RawNode {
  folders: Map<string, RawNode>;
  files: { name: string; path: string }[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: RawNode = { folders: new Map(), files: [] };

  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      let child = node.folders.get(seg);
      if (!child) {
        child = { folders: new Map(), files: [] };
        node.folders.set(seg, child);
      }
      node = child;
    }
    node.files.push({ name: parts[parts.length - 1], path: p });
  }

  function toNodes(n: RawNode): TreeNode[] {
    const folders: TreeNode[] = [...n.folders.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, child]) => ({
        kind: "folder",
        name,
        children: toNodes(child),
      }));
    const files: TreeNode[] = [...n.files]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => ({ kind: "file", name: f.name, path: f.path }));
    return [...folders, ...files];
  }

  return toNodes(root);
}

function CheckboxBadge({ counts }: { counts: CheckboxCount }) {
  const pct = counts.total > 0 ? counts.checked / counts.total : 0;
  const ratio = Math.round(pct * 100);
  const done = counts.total > 0 && counts.checked === counts.total;
  const started = counts.checked > 0 && !done;
  // 3-state signal: gray (untouched) → gold (in progress) → green (done).
  const color = done
    ? "var(--color-success)"
    : started
      ? "var(--color-accent)"
      : "var(--color-text-secondary)";
  return (
    <span
      className="shrink-0 inline-flex items-center gap-1.5 transition-colors"
      style={{ color }}
      title={`${counts.checked} of ${counts.total} tasks done (${ratio}%)`}
    >
      <span className="relative h-3 w-3 shrink-0 overflow-hidden rounded-[2px] bg-bg-input ring-1 ring-border">
        <span
          className={`absolute inset-x-0 bottom-0 transition-all duration-300 ${counts.checked === counts.total ? "bg-success" : "bg-accent"}`}
          style={{ height: `${ratio}%` }}
        />
      </span>
      <span className="font-mono text-[10px] font-semibold tabular-nums">
        {counts.checked}/{counts.total}
      </span>
    </span>
  );
}

export function FileTree({ paths, onSelect, checkboxes }: FileTreeProps) {
  const tree = buildTree(paths);
  return (
    <div className="space-y-px">
      {tree.map((node) => (
        <TreeRow
          key={node.kind === "file" ? node.path : `dir:${node.name}`}
          node={node}
          depth={0}
          onSelect={onSelect}
          checkboxes={checkboxes}
        />
      ))}
    </div>
  );
}

interface RowProps {
  node: TreeNode;
  depth: number;
  onSelect: (path: string) => void;
  checkboxes?: Record<string, CheckboxCount>;
}

function TreeRow({ node, depth, onSelect, checkboxes }: RowProps) {
  const [open, setOpen] = useState(false);
  const indent = { paddingLeft: `${depth * 10 + 6}px` };

  if (node.kind === "file") {
    const counts = checkboxes?.[node.path];
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        style={indent}
        className="group flex w-full items-center gap-1.5 rounded pr-1.5 py-1 text-left font-mono text-[11px] transition-colors hover:bg-accent/10"
      >
        {node.name.endsWith(".py")
          ? <Zap className="w-3 h-3 text-accent shrink-0" />
          : <FileText className="w-3 h-3 text-text-muted shrink-0" />}
        <span className="flex-1 truncate text-text font-medium">
          {node.name}
        </span>
        {counts && <CheckboxBadge counts={counts} />}
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={indent}
        className="group flex w-full items-center gap-1.5 rounded pr-1.5 py-1 text-left font-mono text-[11px] transition-colors hover:bg-accent/10"
      >
        {open
          ? <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
          : <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />}
        {open
          ? <FolderOpen className="w-3 h-3 text-text-muted shrink-0" />
          : <Folder className="w-3 h-3 text-text-muted shrink-0" />}
        <span className="flex-1 truncate text-text-secondary">{node.name}/</span>
      </button>
      {open && (
        <div className="space-y-px">
          {node.children.map((child) => (
            <TreeRow
              key={child.kind === "file" ? child.path : `dir:${child.name}`}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              checkboxes={checkboxes}
            />
          ))}
        </div>
      )}
    </div>
  );
}
