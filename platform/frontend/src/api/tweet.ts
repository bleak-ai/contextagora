import { apiFetch } from "./client";
import type { SocialPostPayload } from "./socialPost";

export type TweetPayload = {
  text: string;
};

export function generateTweet(card: SocialPostPayload): Promise<TweetPayload> {
  return apiFetch<TweetPayload>("/tweet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ card }),
  });
}
