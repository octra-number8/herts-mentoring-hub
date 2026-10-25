import { Alert } from "@/components/ui/layout";

/**
 * Confirmation shown after an action that replaces its own button (publish, book,
 * open check-in...). The action redirects with ?done=<key>, so the message survives
 * the button disappearing.
 */
export function DoneNotice({ done, messages }: { done?: string; messages: Record<string, string> }) {
  const text = done ? messages[done] : undefined;
  if (!text) return null;
  return <div className="mb-4"><Alert tone="success">{text}</Alert></div>;
}
