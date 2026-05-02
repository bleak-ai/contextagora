import { useMutation } from "@tanstack/react-query";
import {
  generateSocialText,
  type SocialTextKind,
  type SocialTextPayload,
} from "../api/socialText";
import type { SocialPostPayload } from "../api/socialPost";

/** On-demand text generator for an extracted social-post card. The mutation
 *  fires only when `mutate(card)` is called, so the card and the rewritten
 *  text are produced as two distinct user actions. */
export function useSocialText(kind: SocialTextKind) {
  return useMutation<SocialTextPayload, Error, SocialPostPayload>({
    mutationFn: (card: SocialPostPayload) => generateSocialText(kind, card),
  });
}
