"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { lifecycleStages } from "@/lib/company-data";
import { mobileAppTabs, mobileIdeaDefaultLane, mobileLeadActivityTypes } from "@/lib/mobile-app";
import { parkingLotPriorities } from "@/lib/parking-lots";
import { getOptionalFeatureSetupMessage, isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { requireClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { canAccessMobileTab, type MobileAppTabKey } from "@/lib/mobile-app";
import { hasFullPortalVisibility } from "@/lib/user-management";

type BrainstormingParkingLotCard = Database["public"]["Tables"]["brainstorming_parking_lot_cards"]["Row"];
type CompanySalesActivity = Database["public"]["Tables"]["company_sales_activities"]["Row"];
type EmployeeChatMessage = Database["public"]["Tables"]["employee_chat_messages"]["Row"];

/**
 * Every mobile action re-derives the caller's role and module grants from the
 * database. The middleware gate on /m is a routing convenience, not the
 * security boundary — a server action can be invoked directly, so the check has
 * to happen here too.
 */
async function requireMobileTab(tabKey: MobileAppTabKey) {
  const supabase = await requireClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to use the mobile app.");
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .eq("account_status", "active")
    .maybeSingle();

  if (!role) {
    throw new Error("Your account does not have portal access.");
  }

  const { data: moduleAccess } = hasFullPortalVisibility(role.role, role.account_status)
    ? { data: [] }
    : await supabase.from("portal_user_module_access").select("module_key").eq("user_id", user.id);

  const moduleKeys = (moduleAccess ?? []).map((access) => access.module_key);
  const tab = mobileAppTabs.find((candidate) => candidate.key === tabKey);

  if (!tab || !canAccessMobileTab(tab, role.role, role.account_status, moduleKeys)) {
    throw new Error("You do not have access to that part of the mobile app.");
  }

  return { supabase, user, role };
}

export async function sendMobileChatMessage(threadId: string, body: string): Promise<EmployeeChatMessage> {
  const { supabase, user } = await requireMobileTab("chat");
  const cleanThreadId = threadId.trim();
  const cleanBody = body.trim();

  if (!cleanThreadId) {
    throw new Error("Choose a conversation before sending.");
  }

  if (!cleanBody) {
    throw new Error("Type a message before sending.");
  }

  if (cleanBody.length > 2000) {
    throw new Error("Messages must be 2,000 characters or less.");
  }

  // RLS decides whether this thread is readable by the caller; a thread id the
  // user is not a participant in fails here rather than leaking membership.
  const { data, error } = await supabase
    .from("employee_chat_messages")
    .insert({ thread_id: cleanThreadId, sender_user_id: user.id, body: cleanBody })
    .select("*")
    .single();

  if (error || !data) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat"));
    }

    throw new Error(error?.message ?? "Could not send message.");
  }

  revalidatePath("/m/chat");
  revalidatePath(`/m/chat/${cleanThreadId}`);

  return data as EmployeeChatMessage;
}

export async function startMobileDirectThread(recipientUserId: string): Promise<string> {
  const { supabase, user } = await requireMobileTab("chat");
  const cleanRecipientUserId = recipientUserId.trim();

  if (!cleanRecipientUserId || cleanRecipientUserId === user.id) {
    throw new Error("Choose another active employee to message.");
  }

  const { data: recipient, error: recipientError } = await supabase
    .from("employee_chat_profiles")
    .select("user_id")
    .eq("user_id", cleanRecipientUserId)
    .eq("account_status", "active")
    .maybeSingle();

  if (recipientError && !isMissingSchemaRelationError(recipientError)) {
    throw new Error(recipientError.message);
  }

  if (!recipient) {
    throw new Error("That employee is not available for chat.");
  }

  // employee_chat_threads stores the pair pre-sorted so the unique index can
  // collapse both directions of a DM onto one row.
  const [participantOneUserId, participantTwoUserId] = [user.id, cleanRecipientUserId].sort();

  const { data: existing } = await supabase
    .from("employee_chat_threads")
    .select("id")
    .eq("thread_type", "direct")
    .eq("participant_one_user_id", participantOneUserId)
    .eq("participant_two_user_id", participantTwoUserId)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from("employee_chat_threads")
    .insert({
      thread_type: "direct",
      participant_one_user_id: participantOneUserId,
      participant_two_user_id: participantTwoUserId,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (created) {
    revalidatePath("/m/chat");
    return created.id;
  }

  if (createError?.code === "23505") {
    const { data: raced } = await supabase
      .from("employee_chat_threads")
      .select("id")
      .eq("thread_type", "direct")
      .eq("participant_one_user_id", participantOneUserId)
      .eq("participant_two_user_id", participantTwoUserId)
      .maybeSingle();

    if (raced) {
      return raced.id;
    }
  }

  throw new Error(createError?.message ?? "Could not open that conversation.");
}

export async function submitMobileIdea(input: {
  categoryId: string;
  title: string;
  description: string;
  priority: string;
}): Promise<BrainstormingParkingLotCard> {
  const { supabase, user, role } = await requireMobileTab("ideas");
  const title = input.title.trim();
  const description = input.description.trim();
  const categoryId = input.categoryId.trim();

  if (!title) {
    throw new Error("Give the idea a title.");
  }

  if (title.length > 200) {
    throw new Error("Titles must be 200 characters or less.");
  }

  if (description.length > 4000) {
    throw new Error("Descriptions must be 4,000 characters or less.");
  }

  if (!categoryId) {
    throw new Error("Choose a category for the idea.");
  }

  const priority = (parkingLotPriorities as readonly string[]).includes(input.priority) ? input.priority : "Medium";

  // Ideas captured on a phone land in the parking lot so the desktop board stays
  // the single place where work is actually prioritised.
  const { data, error } = await supabase
    .from("brainstorming_parking_lot_cards")
    .insert({
      category_id: categoryId,
      title,
      description,
      lane: mobileIdeaDefaultLane,
      priority,
      sort_order: 0,
      created_by_user_id: user.id,
      updated_by_user_id: user.id,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Brainstorming parking lots"));
    }

    throw new Error(error?.message ?? "Could not submit the idea.");
  }

  await recordAuditEvent({
    event_type: "mobile.idea.submitted",
    event_category: "data",
    actor_id: user.id,
    actor_role: role.role,
    resource_type: "brainstorming_parking_lot_cards",
    resource_id: data.id,
    summary: `Idea submitted from the mobile app: ${title}`,
    after_state: { title, lane: mobileIdeaDefaultLane, priority },
  });

  revalidatePath("/m/ideas");
  revalidatePath("/m");
  revalidatePath("/employee/parking-lots");

  return data as BrainstormingParkingLotCard;
}

export async function updateMobileLeadStage(clientId: string, lifecycleStage: string): Promise<void> {
  const { supabase, user, role } = await requireMobileTab("leads");
  const cleanClientId = clientId.trim();

  if (!cleanClientId) {
    throw new Error("Choose a lead to update.");
  }

  if (!(lifecycleStages as readonly string[]).includes(lifecycleStage)) {
    throw new Error("That is not a valid pipeline stage.");
  }

  const { data: before, error: beforeError } = await supabase
    .from("company_clients")
    .select("id, name, lifecycle_stage")
    .eq("id", cleanClientId)
    .maybeSingle();

  if (beforeError && !isMissingSchemaRelationError(beforeError)) {
    throw new Error(beforeError.message);
  }

  if (!before) {
    throw new Error("That lead is not available.");
  }

  if (before.lifecycle_stage === lifecycleStage) {
    return;
  }

  const { error } = await supabase
    .from("company_clients")
    .update({ lifecycle_stage: lifecycleStage, stage_changed_at: new Date().toISOString() })
    .eq("id", cleanClientId);

  if (error) {
    throw new Error(error.message);
  }

  // A stage change without a trail is invisible to whoever picks the lead up
  // next, so it is always written to the activity log too.
  const { error: activityError } = await supabase.from("company_sales_activities").insert({
    client_id: cleanClientId,
    activity_type: "Stage Change",
    title: `Stage moved to ${lifecycleStage}`,
    notes: `Updated from the mobile app (was ${before.lifecycle_stage}).`,
    activity_date: new Date().toISOString().slice(0, 10),
    owner: user.email ?? null,
  });

  if (activityError && !isMissingSchemaRelationError(activityError)) {
    console.error("Could not log the mobile lead stage change.", activityError);
  }

  await recordAuditEvent({
    event_type: "mobile.lead.stage_changed",
    event_category: "data",
    actor_id: user.id,
    actor_role: role.role,
    resource_type: "company_clients",
    resource_id: cleanClientId,
    summary: `${before.name} moved to ${lifecycleStage} from the mobile app`,
    before_state: { lifecycle_stage: before.lifecycle_stage },
    after_state: { lifecycle_stage: lifecycleStage },
  });

  revalidatePath("/m/leads");
  revalidatePath(`/m/leads/${cleanClientId}`);
  revalidatePath("/m");
  revalidatePath("/employee/sales");
  revalidatePath(`/employee/clients/${cleanClientId}`);
}

export async function logMobileLeadActivity(input: {
  clientId: string;
  activityType: string;
  title: string;
  notes: string;
  outcome: string;
}): Promise<CompanySalesActivity> {
  const { supabase, user, role } = await requireMobileTab("leads");
  const clientId = input.clientId.trim();
  const title = input.title.trim();
  const notes = input.notes.trim();
  const outcome = input.outcome.trim();

  if (!clientId) {
    throw new Error("Choose a lead to update.");
  }

  if (!title) {
    throw new Error("Give the update a short title.");
  }

  if (title.length > 200) {
    throw new Error("Titles must be 200 characters or less.");
  }

  if (notes.length > 4000) {
    throw new Error("Notes must be 4,000 characters or less.");
  }

  const activityType = (mobileLeadActivityTypes as readonly string[]).includes(input.activityType)
    ? input.activityType
    : "Note";

  const { data, error } = await supabase
    .from("company_sales_activities")
    .insert({
      client_id: clientId,
      activity_type: activityType,
      title,
      notes: notes || null,
      outcome: outcome || null,
      activity_date: new Date().toISOString().slice(0, 10),
      owner: user.email ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Sales activities"));
    }

    throw new Error(error?.message ?? "Could not save the update.");
  }

  await recordAuditEvent({
    event_type: "mobile.lead.activity_logged",
    event_category: "data",
    actor_id: user.id,
    actor_role: role.role,
    resource_type: "company_sales_activities",
    resource_id: data.id,
    summary: `${activityType} logged from the mobile app: ${title}`,
    after_state: { activity_type: activityType, title },
  });

  revalidatePath("/m/leads");
  revalidatePath(`/m/leads/${clientId}`);
  revalidatePath("/m");
  revalidatePath(`/employee/clients/${clientId}`);

  return data as CompanySalesActivity;
}
