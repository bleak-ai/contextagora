import { useQuery } from "@tanstack/react-query";
import { fetchModuleFile } from "../../../api/modules";
import { FilePreviewModal } from "../FilePreviewModal";

interface ModuleFilePreviewProps {
  moduleName: string;
  path: string;
  onClose: () => void;
}

export function ModuleFilePreview({
  moduleName,
  path,
  onClose,
}: ModuleFilePreviewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["module-file", moduleName, path],
    queryFn: () => fetchModuleFile(moduleName, path),
    staleTime: 30_000,
  });

  return (
    <FilePreviewModal
      title={
        <>
          <span className="text-text-muted">{moduleName}/</span>
          {path}
        </>
      }
      content={data?.content ?? null}
      isLoading={isLoading}
      error={!!error}
      onClose={onClose}
    />
  );
}
