"use client";

import { ActionButton } from "@/components/ui/dialog-form";
import { acknowledgeDocument } from "@/app/(management)/library/actions";

/** Records the reader's acknowledgement of one precise document version. */
export function AcknowledgeButton({ documentId, versionId }: { documentId: string; versionId: string }) {
  return <ActionButton action={acknowledgeDocument} fields={{ document_id: documentId, version_id: versionId }} variant="teal" size="md">I have read and understood this issue</ActionButton>;
}
