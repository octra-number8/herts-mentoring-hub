import { expect, it } from "vitest";
import { as, count, user } from "../helpers";

it("a member's contact change request reaches the Provincial team and can be handled", async () => {
  const learner = await as("learner1");
  const { data: id, error } = await learner.rpc("account_request_contact_change", { p_details: "New mobile number: 07700 900123" });
  expect(error).toBeNull();
  expect(await count(await as("learner2"), "contact_change_requests")).toBe(0);
  expect(await count(await as("apgmen1"), "contact_change_requests")).toBe(0);
  const pgm = await as("pgm");
  const { data } = await pgm.from("contact_change_requests").update({ status: "done", handled_by: user("pgm").accountId, handled_at: new Date().toISOString() }).eq("id", id).select("status");
  expect(data?.[0]?.status).toBe("done");
});
