export interface HumanizedToolCall {
  verb: string;
  moduleName: string | null;
  fileName: string | null;
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
  let relative = rawPath;
  const contextIdx = rawPath.lastIndexOf("/context/");
  if (contextIdx !== -1) {
    relative = rawPath.slice(contextIdx + "/context/".length);
  }

  const firstSegment = relative.split("/")[0];
  if (!firstSegment) return null;

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
  const segments = pattern.replace(/\*+/g, "").split("/").filter(Boolean);
  for (const seg of segments) {
    const match = modules.find(
      (m) => m.toLowerCase() === seg.toLowerCase(),
    );
    if (match) return match;
  }
  return null;
}

function summarizeBashCommand(command: string): string | null {
  if (!command) return null;

  let cmd = command;
  const varlockMatch = cmd.match(/varlock\s+run\s+.*?--\s+(.+)/s);
  if (varlockMatch) cmd = varlockMatch[1];
  const shMatch = cmd.match(/sh\s+-c\s+['"](.+)['"]/s);
  if (shMatch) cmd = shMatch[1];

  const urlMatch = cmd.match(/curl\s.*?(https?:\/\/[^\s'"]+)/);
  if (urlMatch) {
    try {
      const host = new URL(urlMatch[1]).hostname.replace(/^(www|api)\./, "");
      return `API request to ${host}`;
    } catch {
      // fall through
    }
  }

  const trimmed = cmd.trim();
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + "...";
}

export function humanizeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  modules: string[],
): HumanizedToolCall {
  const verb = VERB_MAP[toolName] ?? toolName;

  if (toolName === "Bash") {
    const command = (args.command as string) ?? "";
    const bashLabel = summarizeBashCommand(command);
    return { verb: bashLabel ? "Ran" : verb, moduleName: null, fileName: null, fallbackLabel: bashLabel };
  }

  if (toolName === "Glob") {
    const pattern = (args.pattern as string) ?? "";
    return { verb, moduleName: extractModuleFromGlob(pattern, modules), fileName: null, fallbackLabel: null };
  }

  const pathKey = PATH_ARG_MAP[toolName];
  if (pathKey) {
    const rawPath = (args[pathKey] as string) ?? "";
    const moduleName = extractModuleName(rawPath, modules);
    const basename = rawPath.split("/").pop() ?? null;
    const fileName = basename || null;
    const fallbackLabel = !moduleName && rawPath
      ? basename
      : null;
    return { verb, moduleName, fileName, fallbackLabel };
  }

  return { verb, moduleName: null, fileName: null, fallbackLabel: null };
}
