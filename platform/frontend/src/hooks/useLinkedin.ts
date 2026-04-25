import { useMutation } from "@tanstack/react-query";
import { generateLinkedinPost, type LinkedinPayload } from "../api/linkedin";
import type { SocialPostPayload } from "../api/socialPost";

/** Generates the LinkedIn post text for a card on demand. Mirrors useTweet. */
export function useLinkedin() {
  return useMutation<LinkedinPayload, Error, SocialPostPayload>({
    mutationFn: (card: SocialPostPayload) => generateLinkedinPost(card),
  });
}
