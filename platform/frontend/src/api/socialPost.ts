import { apiFetch } from "./client";

export type SocialPostPayload = {
  title: string;
  meta_bits?: string[];
  problem: {
    headline: string;
    meta: string;
  };
  steps: Array<{
    text: string;
    hint?: string;
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
};

export function generateSocialPost(
  sessionId: string,
): Promise<SocialPostPayload> {
  return apiFetch<SocialPostPayload>(
    `/sessions/${encodeURIComponent(sessionId)}/social-post`,
    { method: "POST" },
  );
}
