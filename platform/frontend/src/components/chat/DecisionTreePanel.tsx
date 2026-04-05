import { useQueries, useQuery } from "@tanstack/react-query";
import { Search, FileCheck } from "lucide-react";
import { fetchModuleFiles } from "../../api/modules";
import { fetchWorkspace } from "../../api/workspace";
import { useChatStore } from "../../hooks/useChatStore";
import { useSessionStore } from "../../hooks/useSessionStore";

interface TreeNode {
  name: string;
  fullPath: string;
  children?: TreeNode[];
}

function buildTree(files: { path: string }[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join("/");

      let existing = current.find((n) => n.name === name);
      if (!existing) {
        existing = { name, fullPath, ...(isFile ? {} : { children: [] }) };
        current.push(existing);
      }
      if (!isFile) {
        current = existing.children!;
      }
    }
  }

  return root;
}

function TreeBranch({ depth }: { depth: number }) {
  if (depth === 0) return null;
  return (
    <span className="text-text-muted/40 text-[11px] select-none whitespace-pre font-mono">
      {"│ ".repeat(depth - 1)}├─
    </span>
  );
}

function TreeNodeView({
  node,
  module,
  accessedFiles,
  currentFile,
  isStreaming,
  depth,
}: {
  node: TreeNode;
  module: string;
  accessedFiles: Set<string>;
  currentFile: string | null;
  isStreaming: boolean;
  depth: number;
}) {
  const isDir = !!node.children;
  const fullPath = `${module}/${node.fullPath}`;

  if (isDir) {
    const hasReadChildren = node.children!.some((child) =>
      child.children
        ? child.children.some((c) => accessedFiles.has(`${module}/${c.fullPath}`))
        : accessedFiles.has(`${module}/${child.fullPath}`)
    );

    return (
      <div>
        <div className={`flex items-center gap-1 text-[13px] font-medium ${hasReadChildren ? "text-text" : "text-text-secondary"}`}>
          <TreeBranch depth={depth} />
          <span>{hasReadChildren ? "📂" : "📁"}</span>
          <span className="truncate">{node.name}</span>
        </div>
        <div className="space-y-0.5">
          {node.children!.map((child) => (
            <TreeNodeView
              key={child.fullPath}
              node={child}
              module={module}
              accessedFiles={accessedFiles}
              currentFile={currentFile}
              isStreaming={isStreaming}
              depth={depth + 1}
            />
          ))}
        </div>
      </div>
    );
  }

  const isRead = accessedFiles.has(fullPath);
  const isCurrent = isStreaming && currentFile === fullPath;

  return (
    <div
      className={`flex items-center gap-1 text-[13px] rounded px-1 py-0.5 ${
        isCurrent
          ? "text-white bg-accent/15 border border-accent/30"
          : isRead
            ? "text-white bg-white/5"
            : "text-text-muted"
      }`}
    >
      <TreeBranch depth={depth} />
      <span className="truncate">{node.name}</span>
      {isCurrent ? (
        <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-accent text-accent-text font-semibold whitespace-nowrap shrink-0">
          <Search size={12} className="animate-pulse" />
          reading
        </span>
      ) : isRead ? (
        <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-success text-black font-semibold whitespace-nowrap shrink-0">
          <FileCheck size={12} />
          read
        </span>
      ) : null}
    </div>
  );
}

export function DecisionTreePanel() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const treeState = useChatStore((s) => activeSessionId ? s.treeStateBySession[activeSessionId] : null) ?? null;
  const isStreaming = useChatStore((s) => s.streamingSessionId !== null);
  const { data: workspace } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspace,
  });

  const modules = workspace?.modules || [];

  const fileQueries = useQueries({
    queries: modules.map((mod) => ({
      queryKey: ["module-files", mod],
      queryFn: () => fetchModuleFiles(mod),
    })),
  });

  const accessedFiles = new Set(treeState?.accessed_files || []);
  const currentFile = treeState
    ? treeState.active_path.join("/")
    : null;

  return (
    <div className="space-y-0.5 px-1 py-1">
      <div className="text-sm space-y-1">
        {modules.map((module, i) => {
          const isActive = treeState?.active_path[0] === module;
          const apiFiles = fileQueries[i]?.data?.files || [];
          const allFiles = [{ path: "llms.txt" }, ...apiFiles.map((f) => ({ path: f.path }))];
          const tree = buildTree(allFiles);
          const hasReadFiles = allFiles.some((f) => accessedFiles.has(`${module}/${f.path}`));

          return (
            <div key={module}>
              <div
                className={`flex items-center gap-1.5 text-sm font-semibold ${
                  isActive
                    ? "text-accent"
                    : hasReadFiles
                      ? "text-text"
                      : "text-text-secondary"
                }`}
              >
                <span>{hasReadFiles ? "📂" : "📁"}</span>
                <span className="truncate">{module}</span>
              </div>
              <div className="space-y-0.5 ml-1">
                {tree.map((node) => (
                  <TreeNodeView
                    key={node.fullPath}
                    node={node}
                    module={module}
                    accessedFiles={accessedFiles}
                    currentFile={currentFile}
                    isStreaming={isStreaming}
                    depth={1}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
