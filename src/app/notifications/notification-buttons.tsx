"use client";

import { ActionButton } from "@/components/ui/dialog-form";
import { markAllRead, markRead, markUnread, openNotification } from "./actions";

export function OpenButton({ id }: { id: string }) {
  return <ActionButton action={openNotification} fields={{ id }} variant="secondary">Open</ActionButton>;
}
export function ReadToggle({ id, read }: { id: string; read: boolean }) {
  return read
    ? <ActionButton action={markUnread} fields={{ id }} variant="subtle">Mark unread</ActionButton>
    : <ActionButton action={markRead} fields={{ id }} variant="subtle">Mark read</ActionButton>;
}
export function MarkAllRead() {
  return <ActionButton action={markAllRead} variant="secondary" size="md">Mark all as read</ActionButton>;
}
