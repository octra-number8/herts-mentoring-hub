import { Alert } from "@/components/ui/layout";

/**
 * Success notice after an action that redirects (for example a status change,
 * where the button that was pressed no longer exists on the refreshed page).
 */
export function DoneNotice({ done, messages }: { done?: string; messages: Record<string, string> }) {
  const text = done ? messages[done] : undefined;
  return text ? <div className="mb-4"><Alert tone="success">{text}</Alert></div> : null;
}
