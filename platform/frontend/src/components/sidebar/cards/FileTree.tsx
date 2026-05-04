import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Search,
  X,
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

// Collapse single-child folder chains into a breadcrumb-style row.
// e.g. functions -> 2_transform -> _utils -> [files] becomes
//      "functions/2_transform/_utils" with the leaf's children.
function compressFolder(node: FolderNode): {
  displayName: string;
  children: TreeNode[];
  key: string;
} {
  let displayName = node.name;
  let children = node.children;
  let key = node.name;
  while (children.length === 1 && children[0].kind === "folder") {
    const next = children[0] as FolderNode;
    displayName = `${displayName}/${next.name}`;
    key = `${key}/${next.name}`;
    children = next.children;
  }
  return { displayName, children, key };
}

function fileIcon(name: string) {
  const lower = name.toLowerCase();
  const codeExt = [
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".go",
    ".rs",
    ".java",
    ".rb",
    ".sh",
    ".c",
    ".cpp",
    ".h",
  ];
  const dataExt = [
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".env",
    ".lock",
    ".ini",
  ];
  const docExt = [".md", ".mdx", ".txt", ".rst"];
  if (codeExt.some((e) => lower.endsWith(e))) return FileCode2;
  if (dataExt.some((e) => lower.endsWith(e))) return FileJson;
  if (docExt.some((e) => lower.endsWith(e))) return FileText;
  return File;
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
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();

  const filteredPaths = useMemo(() => {
    if (!trimmed) return paths;
    return paths.filter((p) => p.toLowerCase().includes(trimmed));
  }, [paths, trimmed]);

  const tree = useMemo(() => buildTree(filteredPaths), [filteredPaths]);
  const filterActive = trimmed.length > 0;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Filter ${paths.length} files…`}
          className="w-full rounded border border-border bg-bg-input pl-7 pr-7 py-1 text-[11px] text-text placeholder:text-text-muted outline-none focus:border-accent/60"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear filter"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {filterActive && filteredPaths.length === 0 && (
        <p className="text-[10px] italic text-text-muted px-1 py-2">
          No files match "{query}".
        </p>
      )}

      <div className="space-y-px">
        {tree.map((node) => (
          <TreeRow
            key={node.kind === "file" ? node.path : `dir:${node.name}`}
            node={node}
            depth={0}
            onSelect={onSelect}
            checkboxes={checkboxes}
            forceOpen={filterActive}
            query={trimmed}
          />
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  node: TreeNode;
  depth: number;
  onSelect: (path: string) => void;
  checkboxes?: Record<string, CheckboxCount>;
  forceOpen: boolean;
  query: string;
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query) return <>{name}</>;
  const idx = name.toLowerCase().indexOf(query);
  if (idx < 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, idx)}
      <mark className="bg-accent/30 text-text rounded-sm px-px">
        {name.slice(idx, idx + query.length)}
      </mark>
      {name.slice(idx + query.length)}
    </>
  );
}

function IndentGuides({ depth }: { depth: number }) {
  if (depth === 0) return null;
  return (
    <span aria-hidden className="flex shrink-0">
      {Array.from({ length: depth }).map((_, i) => (
        <span
          key={i}
          className="w-4 border-r border-border/40 self-stretch"
        />
      ))}
    </span>
  );
}

function TreeRow({
  node,
  depth,
  onSelect,
  checkboxes,
  forceOpen,
  query,
}: RowProps) {
  const [open, setOpen] = useState(false);
  const effectiveOpen = forceOpen || open;

  if (node.kind === "file") {
    const counts = checkboxes?.[node.path];
    const Icon = fileIcon(node.name);
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className="group flex w-full items-stretch rounded pr-1.5 text-left font-mono text-[11px] transition-colors hover:bg-accent/10"
      >
        <IndentGuides depth={depth} />
        <span className="flex flex-1 items-center gap-1.5 py-1 pl-1.5 min-w-0">
          <Icon className="w-3 h-3 text-text-muted shrink-0" />
          <span className="flex-1 truncate text-text">
            <HighlightedName name={node.name} query={query} />
          </span>
          {counts && <CheckboxBadge counts={counts} />}
        </span>
      </button>
    );
  }

  const compressed = compressFolder(node);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-stretch rounded pr-1.5 text-left font-mono text-[11px] transition-colors hover:bg-accent/10"
      >
        <IndentGuides depth={depth} />
        <span className="flex flex-1 items-center gap-1.5 py-1 pl-1.5 min-w-0">
          {effectiveOpen ? (
            <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
          )}
          {effectiveOpen ? (
            <FolderOpen className="w-3 h-3 text-accent shrink-0" />
          ) : (
            <Folder className="w-3 h-3 text-accent shrink-0" />
          )}
          <span className="flex-1 truncate text-text font-semibold">
            <HighlightedName name={compressed.displayName} query={query} />
            <span className="text-text-muted font-normal">/</span>
          </span>
        </span>
      </button>
      {effectiveOpen && (
        <div className="space-y-px">
          {compressed.children.map((child) => (
            <TreeRow
              key={child.kind === "file" ? child.path : `dir:${child.name}`}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              checkboxes={checkboxes}
              forceOpen={forceOpen}
              query={query}
            />
          ))}
        </div>
      )}
    </div>
  );
}
