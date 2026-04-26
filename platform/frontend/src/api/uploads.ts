import { apiUpload } from "./client";

export async function uploadTmpImage(blob: Blob): Promise<{ path: string }> {
  const file = new File([blob], "card.png", { type: "image/png" });
  return apiUpload<{ path: string }>("/uploads/tmp-image", file);
}
