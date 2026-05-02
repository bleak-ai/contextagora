import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { fetchLegacyArchived } from "../../api/modules";

const STORAGE_KEY = "contextagora.legacy_archived_dismissed";

export function LegacyArchivedBanner() {
  const dismissed =
    typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
  const [visible, setVisible] = useState(!dismissed);
  const { data } = useQuery({
    queryKey: ["legacyArchived"],
    queryFn: fetchLegacyArchived,
    enabled: visible,
  });

  useEffect(() => {
    if (data && data.length === 0) {
      setVisible(false);
      localStorage.setItem(STORAGE_KEY, "1");
    }
  }, [data]);

  if (!visible || !data || data.length === 0) return null;

  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs">
      <div className="font-medium mb-1">Previously archived modules</div>
      <p className="text-neutral-700 mb-2">
        These modules were archived under the old system. They are still in the
        sidebar; delete the folder to remove them.
      </p>
      <ul className="list-disc ml-4 mb-2">
        {data.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <button
        className="text-amber-800 underline"
        onClick={() => {
          localStorage.setItem(STORAGE_KEY, "1");
          setVisible(false);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
