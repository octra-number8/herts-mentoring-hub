/** The permission catalogue (mirrors public.permissions). */
export const PERMISSIONS = [
  "hub.access_management", "dashboard.view", "lodges.read", "lodges.write.all", "lodges.write.allocated", "lodges.export",
  "lodges.bulk", "allocations.manage", "members.read.basic", "members.read.detail.all", "members.read.detail.allocated",
  "members.write.all", "members.write.allocated", "members.export", "activity.read.all", "activity.read.allocated",
  "activity.write.all", "activity.write.allocated", "notes.team", "notes.leadership", "notes.restricted", "tasks.use",
  "tasks.manage_all", "cases.read.all", "cases.read.allocated", "cases.write.all", "cases.write.allocated",
  "cases.confidential.triage", "cases.confidential.submit", "team.use", "team.announce", "meetings.manage",
  "events.read.internal", "events.manage", "events.checkin", "docs.read.internal", "docs.read.leadership", "docs.manage",
  "docs.approve", "knowledge.manage", "learning.records.read", "academy.admin", "search.management", "academy.learn",
  "docs.read.mentors", "academy.author", "academy.review", "academy.publish", "comms.use", "comms.send.allocated",
  "comms.send.province", "comms.approve", "comms.templates", "imports.run", "imports.approve", "workflows.manage",
  "reports.read", "reports.export", "reports.membership", "reports.quarterly", "reports.quarterly.approve", "admin.users",
  "admin.roles", "admin.features", "admin.config", "admin.audit", "system.health", "lodge_portal.read",
  "lodge_portal.create", "lodge_portal.update", "lodge_portal.export",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
