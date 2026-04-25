import { apiFetch } from "./client";

export type SocialPostPayload = {
  title: string;
  tagline?: string;
  meta_bits?: string[];
  problem: {
    headline: string;
    meta: string;
    sticker_face?: string;
    sticker_note?: string;
  };
  steps: Array<{
    text: string;
    hint?: string;
    note?: string;
    icon?: string;
  }>;
  outcome: {
    title: string;
    subtitle: string;
    file?: string;
    emoji?: string;
    punchline?: string;
  };
  services: string[];
  stats: { elapsed_seconds: number; prompt_count: number };
  session: { id: string; date_iso: string };
};

export function generateSocialPost(
  sessionId: string,
): Promise<SocialPostPayload> {
  return apiFetch<SocialPostPayload>(
    `/sessions/${encodeURIComponent(sessionId)}/social-post`,
    { method: "POST" },
  );
}
