"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOptionalFeatureSetupMessage, isMissingSchemaRelationError } from "@/lib/supabase/errors";
import type { Database } from "@/lib/supabase/types";

type EmployeeChatThread = Database["public"]["Tables"]["employee_chat_threads"]["Row"];
type EmployeeChatMessage = Database["public"]["Tables"]["employee_chat_messages"]["Row"];

function sortParticipantIds(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId].sort() as [string, string];
}

async function getAuthenticatedChatClient() {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to use chat.");
  }

  return { supabase, user };
}

async function findDirectThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  participantOneUserId: string,
  participantTwoUserId: string,
) {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("employee_chat_threads")
    .select("*")
    .eq("thread_type", "direct")
    .eq("participant_one_user_id", participantOneUserId)
    .eq("participant_two_user_id", participantTwoUserId)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat"));
    }

    throw new Error(error.message);
  }

  return data as EmployeeChatThread | null;
}

export async function ensureDirectThread(recipientUserId: string): Promise<EmployeeChatThread> {
  const { supabase, user } = await getAuthenticatedChatClient();
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

  if (recipientError) {
    if (isMissingSchemaRelationError(recipientError)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat"));
    }

    throw new Error(recipientError.message);
  }

  if (!recipient) {
    throw new Error("That employee is not available for chat.");
  }

  const [participantOneUserId, participantTwoUserId] = sortParticipantIds(user.id, cleanRecipientUserId);
  const existingThread = await findDirectThread(supabase, participantOneUserId, participantTwoUserId);

  if (existingThread) {
    return existingThread;
  }

  const { data: createdThread, error: createError } = await supabase
    .from("employee_chat_threads")
    .insert({
      thread_type: "direct",
      participant_one_user_id: participantOneUserId,
      participant_two_user_id: participantTwoUserId,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (!createError && createdThread) {
    return createdThread as EmployeeChatThread;
  }

  if (isMissingSchemaRelationError(createError)) {
    throw new Error(getOptionalFeatureSetupMessage("Employee chat"));
  }

  if (createError?.code === "23505") {
    const racedThread = await findDirectThread(supabase, participantOneUserId, participantTwoUserId);

    if (racedThread) {
      return racedThread;
    }
  }

  throw new Error(createError?.message ?? "Could not create a direct message thread.");
}

export async function sendChatMessage(threadId: string, body: string): Promise<EmployeeChatMessage> {
  const { supabase, user } = await getAuthenticatedChatClient();
  const cleanThreadId = threadId.trim();
  const cleanBody = body.trim();

  if (!cleanThreadId) {
    throw new Error("Choose a chat before sending.");
  }

  if (!cleanBody) {
    throw new Error("Type a message before sending.");
  }

  if (cleanBody.length > 2000) {
    throw new Error("Messages must be 2,000 characters or less.");
  }

  const { data, error } = await supabase
    .from("employee_chat_messages")
    .insert({
      thread_id: cleanThreadId,
      sender_user_id: user.id,
      body: cleanBody,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat"));
    }

    throw new Error(error?.message ?? "Could not send message.");
  }

  return data as EmployeeChatMessage;
}

export async function markChatNotificationsRead() {
  const { supabase, user } = await getAuthenticatedChatClient();
  const readAt = new Date().toISOString();

  const { error } = await supabase
    .from("portal_notifications")
    .update({ status: "read", read_at: readAt })
    .eq("recipient_user_id", user.id)
    .eq("status", "unread")
    .eq("source_type", "employee_chat_message");

  if (error) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat notifications"));
    }

    throw new Error(error.message);
  }

  revalidatePath("/employee");
  revalidatePath("/employee/ai");
}
