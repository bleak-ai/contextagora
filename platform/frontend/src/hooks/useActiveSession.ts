import { useCallback } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";

export function useActiveSessionId(): string | null {
  const params = useParams({ strict: false }) as { sessionId?: string };
  return params.sessionId ?? null;
}

export function useNavigateToSession() {
  const navigate = useNavigate();
  return useCallback(
    (id: string | null) => {
      if (id) {
        navigate({ to: "/sessions/$sessionId", params: { sessionId: id } });
      } else {
        navigate({ to: "/" });
      }
    },
    [navigate],
  );
}
