import { apiFetch } from "./client";
import type { SocialPostPayload } from "./socialPost";

export type LinkedinPayload = {
  text: string;
};

export function generateLinkedinPost(
  card: SocialPostPayload,
): Promise<LinkedinPayload> {
  return apiFetch<LinkedinPayload>("/linkedin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ card }),
  });
}
