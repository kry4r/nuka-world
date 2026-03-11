export type ShellPageId = "chat" | "team" | "agents" | "memory" | "knowledge" | "settings";

export type ShellNavigationItem = {
  id: ShellPageId;
  label: string;
};
