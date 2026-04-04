import { useState } from "react";

interface ModuleSecretsProps {
  moduleName: string;
  secrets: string[];
  secretsStatus: Record<string, string | null>;
  onChange: (secrets: string[]) => void;
  isPending?: boolean;
}

export function ModuleSecrets({
  moduleName,
  secrets,
  secretsStatus,
  onChange,
  isPending,
}: ModuleSecretsProps) {
  const [newSecret, setNewSecret] = useState("");

  const handleAdd = () => {
    const name = newSecret.trim().toUpperCase();
    if (name && !secrets.includes(name)) {
      onChange([...secrets, name]);
      setNewSecret("");
    }
  };

  const handleRemove = (name: string) => {
    onChange(secrets.filter((s) => s !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div>
      <span className="text-xs text-text-secondary">Secrets</span>
      <p className="text-[10px] text-text-muted mt-0.5 mb-1">
        Environment variables the agent can use at runtime via varlock. Add the variable name here, then set its value in Infisical.
      </p>
      <div className="mt-1 space-y-1">
        {secrets.map((name) => {
          const status = secretsStatus[name];
          const isSet = status !== undefined && status !== null;
          return (
            <div
              key={name}
              className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-bg-hover"
            >
              <div className="flex items-center gap-2">
                <span className={isSet ? "text-success text-xs" : "text-danger text-xs"}>
                  {isSet ? "\u2713" : "\u2717"}
                </span>
                <span className="text-sm text-text font-mono">{name}</span>
                {isSet && status && (
                  <span className="text-xs text-text-muted">{status}</span>
                )}
              </div>
              <button
                onClick={() => handleRemove(name)}
                disabled={isPending}
                className="text-xs text-danger/60 hover:text-danger"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          value={newSecret}
          onChange={(e) => setNewSecret(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="NEW_SECRET_KEY"
          className="flex-1 bg-bg-input border border-border rounded px-2 py-1.5 text-sm text-text font-mono outline-none focus:border-accent/40"
        />
        <button
          onClick={handleAdd}
          disabled={!newSecret.trim() || isPending}
          className="px-3 py-1.5 text-xs text-accent hover:text-accent-hover disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <p className="text-[10px] text-text-muted mt-1">
        Add values in Infisical at /{moduleName}
      </p>
    </div>
  );
}
