import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Zap,
} from "lucide-react";

interface FileTreeProps {
  paths: string[];
  onSelect: (path: string) => void;
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

export function FileTree({ paths, onSelect }: FileTreeProps) {
  const tree = buildTree(paths);
  return (
    <div className="space-y-px">
      {tree.map((node) => (
        <TreeRow
          key={node.kind === "file" ? node.path : `dir:${node.name}`}
          node={node}
          depth={0}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

interface RowProps {
  node: TreeNode;
  depth: number;
  onSelect: (path: string) => void;
}

function TreeRow({ node, depth, onSelect }: RowProps) {
  const [open, setOpen] = useState(true);
  const indent = { paddingLeft: `${depth * 10 + 6}px` };

  if (node.kind === "file") {
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
