export type ShellPageId = "chat" | "workflow" | "agents" | "memory" | "knowledge" | "settings";

export type ShellNavigationItem = {
  id: ShellPageId;
  label: string;
};
