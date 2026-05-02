import { apiFetch } from "./client";
import type { SocialPostPayload } from "./socialPost";

export type SocialTextKind = "tweet" | "linkedin";

export type SocialTextPayload = {
  text: string;
};

export function generateSocialText(
  kind: SocialTextKind,
  card: SocialPostPayload,
): Promise<SocialTextPayload> {
  return apiFetch<SocialTextPayload>(`/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ card }),
  });
}
