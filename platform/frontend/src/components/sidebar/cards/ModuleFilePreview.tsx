import { useQuery } from "@tanstack/react-query";
import { fetchModuleFile } from "../../../api/modules";
import { FilePreviewModal } from "../FilePreviewModal";

interface ModuleFilePreviewProps {
  moduleName: string;
  path: string;
  onClose: () => void;
}

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif"];

function isImagePath(p: string): boolean {
  const lower = p.toLowerCase();
  return IMAGE_EXTS.some((ext) => lower.endsWith(ext));
}

export function ModuleFilePreview({
  moduleName,
  path,
  onClose,
}: ModuleFilePreviewProps) {
  const isImage = isImagePath(path);
  const previewUrl = `/api/files/preview?path=${encodeURIComponent(`${moduleName}/${path}`)}`;

  const { data, isLoading, error } = useQuery({
    queryKey: ["module-file", moduleName, path],
    queryFn: () => fetchModuleFile(moduleName, path),
    staleTime: 30_000,
    enabled: !isImage,
  });

  const title = (
    <>
      <span className="text-text-muted">{moduleName}/</span>
      {path}
    </>
  );

  if (isImage) {
    return (
      <FilePreviewModal
        title={title}
        content={null}
        imageSrc={previewUrl}
        onClose={onClose}
      />
    );
  }

  return (
    <FilePreviewModal
      title={title}
      content={data?.content ?? null}
      isLoading={isLoading}
      error={!!error}
      runnable={{ moduleName, path }}
      downloadHref={previewUrl}
      onClose={onClose}
    />
  );
}
