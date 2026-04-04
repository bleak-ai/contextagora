export interface HumanizedToolCall {
  verb: string;
  moduleName: string | null;
  fallbackLabel: string | null;
}

const VERB_MAP: Record<string, string> = {
  Read: "Read",
  Grep: "Searched",
  Glob: "Browsed",
  Edit: "Updated",
  Write: "Created",
  Bash: "Ran command",
};

const PATH_ARG_MAP: Record<string, string> = {
  Read: "file_path",
  Edit: "file_path",
  Write: "file_path",
  Grep: "path",
};

function extractModuleName(
  rawPath: string,
  modules: string[],
): string | null {
  // Strip absolute prefix up to and including /context/
  let relative = rawPath;
  const contextIdx = rawPath.lastIndexOf("/context/");
  if (contextIdx !== -1) {
    relative = rawPath.slice(contextIdx + "/context/".length);
  }

  // First segment is the candidate module name
  const firstSegment = relative.split("/")[0];
  if (!firstSegment) return null;

  // Case-insensitive match against loaded modules
  return (
    modules.find(
      (m) => m.toLowerCase() === firstSegment.toLowerCase(),
    ) ?? null
  );
}

function extractModuleFromGlob(
  pattern: string,
  modules: string[],
): string | null {
  // Strip glob characters and try each segment
  const segments = pattern.replace(/\*+/g, "").split("/").filter(Boolean);
  for (const seg of segments) {
    const match = modules.find(
      (m) => m.toLowerCase() === seg.toLowerCase(),
    );
    if (match) return match;
  }
  return null;
}

export function humanizeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  modules: string[],
): HumanizedToolCall {
  const verb = VERB_MAP[toolName] ?? toolName;

  if (toolName === "Bash") {
    return { verb, moduleName: null, fallbackLabel: null };
  }

  if (toolName === "Glob") {
    const pattern = (args.pattern as string) ?? "";
    return { verb, moduleName: extractModuleFromGlob(pattern, modules), fallbackLabel: null };
  }

  const pathKey = PATH_ARG_MAP[toolName];
  if (pathKey) {
    const rawPath = (args[pathKey] as string) ?? "";
    const moduleName = extractModuleName(rawPath, modules);
    // Fallback: show basename if module can't be resolved
    const fallbackLabel = !moduleName && rawPath
      ? rawPath.split("/").pop() ?? null
      : null;
    return { verb, moduleName, fallbackLabel };
  }

  // Fallback for unknown tools
  return { verb, moduleName: null, fallbackLabel: null };
}
