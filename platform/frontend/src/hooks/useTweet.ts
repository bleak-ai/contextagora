import { useMutation } from "@tanstack/react-query";
import { generateTweet, type TweetPayload } from "../api/tweet";
import type { SocialPostPayload } from "../api/socialPost";

/** Generates the tweet text for an extracted social-post card on demand.
 *  The mutation only fires when the caller calls `mutate(card)` — wire
 *  it to a button so the card and the tweet are produced in two
 *  distinct user actions. */
export function useTweet() {
  return useMutation<TweetPayload, Error, SocialPostPayload>({
    mutationFn: (card: SocialPostPayload) => generateTweet(card),
  });
}
