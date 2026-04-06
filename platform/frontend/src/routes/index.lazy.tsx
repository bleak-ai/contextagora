import { createLazyFileRoute } from "@tanstack/react-router";
import { Chat } from "../components/Chat";

export const Route = createLazyFileRoute("/")({
  component: Chat,
});
