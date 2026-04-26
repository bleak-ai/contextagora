import { toBlob } from "html-to-image";
import { uploadTmpImage } from "../../api/uploads";

export async function rasterize(node: HTMLElement): Promise<Blob> {
  const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true });
  if (!blob) throw new Error("rasterize failed");
  return blob;
}

export async function saveToTmp(node: HTMLElement): Promise<{ path: string }> {
  const blob = await rasterize(node);
  return uploadTmpImage(blob);
}

export async function downloadAsPng(node: HTMLElement, filename: string): Promise<void> {
  const blob = await rasterize(node);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
