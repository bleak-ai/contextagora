import { useQuery } from "@tanstack/react-query";
import { generateSocialPost, type SocialPostPayload } from "../api/socialPost";

/** Fetches (and caches) the social-post payload for a session.
 *  Disabled when sessionId is null — the caller passes null to keep it quiet. */
export function useSocialPost(sessionId: string | null) {
  return useQuery<SocialPostPayload, Error>({
    queryKey: ["social-post", sessionId],
    queryFn: () => generateSocialPost(sessionId!),
    enabled: sessionId !== null,
    // Session content is immutable after the fact. Keep the cache long.
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  });
}
