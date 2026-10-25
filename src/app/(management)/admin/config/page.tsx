import type { Metadata } from "next";
import { CustomFieldForm, DocumentCategoryDialog, SettingsForm, StatusDialog, SupportCategoryDialog } from "@/components/admin/config-forms";
import { Badge, mentoringStatusTone } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/dialog-form";
import { EmptyState, PageHeader, Panel, Tabs } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { label } from "@/lib/utils";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import {
  addCustomField, deleteDocumentCategory, deleteStatus, removeCustomField, saveDocumentCategory, saveSettings, saveStatus, saveSupportCategory, type CustomField,
} from "./actions";

export const metadata: Metadata = { title: "Configuration" };

const TABS = [
  { key: "statuses", label: "Mentoring statuses" }, { key: "support", label: "Support categories" }, { key: "documents", label: "Document categories" },
  { key: "settings", label: "Settings" }, { key: "fields", label: "Lodge fields" },
] as const;
const AUDIENCE: Record<string, string> = { learning: "Academy learners", mentors: "Mentors", internal: "Provincial team", leadership: "Leadership only" };
const TYPES: Record<string, string> = { text: "Text", number: "Number", date: "Date", yes_no: "Yes or no", choice: "Choice" };

export default async function ConfigPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission("admin.config");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "statuses";
  const db = await supabaseServer();

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/admin", label: "Administration" }]} title="Configuration" description="Lists and settings the Province can change without a developer." />
      <Tabs tabs={TABS.map((t) => ({ ...t, href: `/admin/config?tab=${t.key}` }))} current={tab} />
      {tab === "statuses" && <Statuses />}
      {tab === "support" && <Support />}
      {tab === "documents" && <Documents />}
      {tab === "settings" && <Settings />}
      {tab === "fields" && <Fields />}
    </>
  );

  async function Statuses() {
    const { data } = await db.from("mentoring_statuses").select("id, key, label, description, position, is_closed, active").order("position");
    return (
      <Panel title="Mentoring statuses" description="Operational positions for a Lodge, shown in this order. Never red, never a judgement." actions={<StatusDialog action={saveStatus} />} padded={false}>
        {data?.length ? (
          <Table className="rounded-none border-0" caption="Mentoring statuses">
            <THead><TH>Order</TH><TH>Status</TH><TH className="hidden md:table-cell">Description</TH><TH>State</TH><TH><span className="sr-only">Actions</span></TH></THead>
            <TBody>
              {data.map((s) => (
                <TR key={s.id}>
                  <TD className="tabular-nums text-muted">{s.position}</TD>
                  <TD><Badge tone={mentoringStatusTone(s.key)}>{s.label}</Badge><div className="mt-1 text-[12px] text-muted">{s.key}</div></TD>
                  <TD className="hidden text-[13px] md:table-cell">{s.description}</TD>
                  <TD className="text-[13px]">{s.active ? "Available" : "Inactive"}{s.is_closed && <div className="text-muted">Closed</div>}</TD>
                  <TD><div className="flex flex-wrap justify-end gap-1"><StatusDialog action={saveStatus} status={s} />
                    <ActionButton action={deleteStatus} fields={{ id: s.id }} variant="subtle" confirm={`Delete "${s.label}"? If Lodges use it, mark it inactive instead.`}>Delete</ActionButton></div></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No statuses configured" /></div>}
      </Panel>
    );
  }

  async function Support() {
    const { data } = await db.from("support_categories").select("id, key, label, description, default_due_days, position, active").order("position");
    return (
      <Panel title="Support categories" description="What people can ask for help with, and how quickly the team aims to respond." actions={<SupportCategoryDialog action={saveSupportCategory} />} padded={false}>
        {data?.length ? (
          <Table className="rounded-none border-0" caption="Support categories">
            <THead><TH>Order</TH><TH>Category</TH><TH className="hidden md:table-cell">Respond within</TH><TH>State</TH><TH><span className="sr-only">Actions</span></TH></THead>
            <TBody>
              {data.map((c) => (
                <TR key={c.id}>
                  <TD className="tabular-nums text-muted">{c.position}</TD>
                  <TD className="font-medium">{c.label}<div className="text-[13px] font-normal text-muted">{c.description}</div></TD>
                  <TD className="hidden md:table-cell">{c.default_due_days} days</TD>
                  <TD className="text-[13px]">{c.active ? "Available" : "Inactive"}</TD>
                  <TD><SupportCategoryDialog action={saveSupportCategory} category={c} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No support categories configured" /></div>}
      </Panel>
    );
  }

  async function Documents() {
    const { data } = await db.from("document_categories").select("id, key, name, default_classification, position").order("position");
    return (
      <Panel title="Document categories" description="How the library is organised and who documents are for by default." actions={<DocumentCategoryDialog action={saveDocumentCategory} />} padded={false}>
        {data?.length ? (
          <Table className="rounded-none border-0" caption="Document categories">
            <THead><TH>Order</TH><TH>Category</TH><TH className="hidden md:table-cell">Default audience</TH><TH><span className="sr-only">Actions</span></TH></THead>
            <TBody>
              {data.map((c) => (
                <TR key={c.id}>
                  <TD className="tabular-nums text-muted">{c.position}</TD>
                  <TD className="font-medium">{c.name}</TD>
                  <TD className="hidden md:table-cell">{AUDIENCE[c.default_classification] ?? label(c.default_classification)}</TD>
                  <TD><div className="flex flex-wrap justify-end gap-1"><DocumentCategoryDialog action={saveDocumentCategory} category={c} />
                    <ActionButton action={deleteDocumentCategory} fields={{ id: c.id }} variant="subtle" confirm={`Delete "${c.name}"?`}>Delete</ActionButton></div></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No document categories configured" /></div>}
      </Panel>
    );
  }

  async function Settings() {
    const { data } = await db.from("organisations").select("settings").single();
    return <Panel title="Province settings"><SettingsForm action={saveSettings} settings={(data?.settings ?? {}) as never} /></Panel>;
  }

  async function Fields() {
    const { data } = await db.from("organisations").select("settings").single();
    const fields = ((data?.settings as { custom_fields?: CustomField[] } | null)?.custom_fields ?? []);
    return (
      <Panel title="Lodge fields" description="Extra details recorded on every Lodge record." actions={<CustomFieldForm action={addCustomField} />} padded={false}>
        {fields.length ? (
          <Table className="rounded-none border-0" caption="Lodge fields">
            <THead><TH>Field</TH><TH>Type</TH><TH className="hidden md:table-cell">Help</TH><TH><span className="sr-only">Actions</span></TH></THead>
            <TBody>
              {fields.map((f) => (
                <TR key={f.key}>
                  <TD className="font-medium">{f.label}<div className="text-[12px] font-normal text-muted">{f.key}</div></TD>
                  <TD>{TYPES[f.type] ?? f.type}{f.options?.length ? <div className="text-[13px] text-muted">{f.options.join(", ")}</div> : null}</TD>
                  <TD className="hidden text-[13px] md:table-cell">{f.help}</TD>
                  <TD><ActionButton action={removeCustomField} fields={{ key: f.key }} variant="subtle" confirm={`Remove "${f.label}" from Lodge forms?`}>Remove</ActionButton></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No extra Lodge fields">Add a field when the Province needs to record something the standard Lodge record does not cover.</EmptyState></div>}
      </Panel>
    );
  }
}
