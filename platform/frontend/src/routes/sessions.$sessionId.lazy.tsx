import { createLazyFileRoute } from "@tanstack/react-router";
import { Chat } from "../components/Chat";

export const Route = createLazyFileRoute("/sessions/$sessionId")({
  component: Chat,
});
