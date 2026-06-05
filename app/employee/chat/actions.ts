"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOptionalFeatureSetupMessage, isMissingSchemaRelationError } from "@/lib/supabase/errors";
import type { Database } from "@/lib/supabase/types";

type EmployeeChatThread = Database["public"]["Tables"]["employee_chat_threads"]["Row"];
type EmployeeChatMessage = Database["public"]["Tables"]["employee_chat_messages"]["Row"];
type EmployeeChatCall = Database["public"]["Tables"]["employee_chat_calls"]["Row"];
type EmployeeChatCallParticipant = Database["public"]["Tables"]["employee_chat_call_participants"]["Row"];

type ChatCallResult = {
  call: EmployeeChatCall;
  thread: EmployeeChatThread;
  participants: EmployeeChatCallParticipant[];
};

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

async function ensureActiveChatProfile(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: profile, error } = await supabase
    .from("employee_chat_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("account_status", "active")
    .maybeSingle();

  if (error) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat"));
    }

    throw new Error(error.message);
  }

  if (!profile) {
    throw new Error("Only active employees can use chat meetings.");
  }
}

async function getAccessibleThread(supabase: Awaited<ReturnType<typeof createClient>>, threadId: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: thread, error } = await supabase.from("employee_chat_threads").select("*").eq("id", threadId).maybeSingle();

  if (error) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat"));
    }

    throw new Error(error.message);
  }

  if (!thread) {
    throw new Error("Choose an accessible chat before starting a meeting.");
  }

  return thread as EmployeeChatThread;
}

async function getAccessibleCall(supabase: Awaited<ReturnType<typeof createClient>>, callId: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: call, error } = await supabase.from("employee_chat_calls").select("*").eq("id", callId).maybeSingle();

  if (error) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat meetings"));
    }

    throw new Error(error.message);
  }

  if (!call) {
    throw new Error("That meeting is not available.");
  }

  return call as EmployeeChatCall;
}

async function loadCallResult(
  supabase: Awaited<ReturnType<typeof createClient>>,
  call: EmployeeChatCall,
): Promise<ChatCallResult> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const thread = await getAccessibleThread(supabase, call.thread_id);
  const { data: participants, error } = await supabase
    .from("employee_chat_call_participants")
    .select("*")
    .eq("call_id", call.id)
    .order("created_at");

  if (error) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat meetings"));
    }

    throw new Error(error.message);
  }

  return {
    call,
    thread,
    participants: (participants ?? []) as EmployeeChatCallParticipant[],
  };
}

async function writeCallLogMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  threadId: string,
  senderUserId: string,
  body: string,
) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("employee_chat_messages").insert({
    thread_id: threadId,
    sender_user_id: senderUserId,
    body,
  });

  if (error && !isMissingSchemaRelationError(error)) {
    console.error("Could not write chat call log message.", error);
  }
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

export async function startChatCall(threadId: string): Promise<ChatCallResult> {
  const { supabase, user } = await getAuthenticatedChatClient();
  const cleanThreadId = threadId.trim();

  if (!cleanThreadId) {
    throw new Error("Choose a chat before starting a meeting.");
  }

  await ensureActiveChatProfile(supabase, user.id);
  const thread = await getAccessibleThread(supabase, cleanThreadId);

  const { data: call, error: callError } = await supabase
    .from("employee_chat_calls")
    .insert({
      thread_id: thread.id,
      created_by: user.id,
      status: "active",
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (callError || !call) {
    if (isMissingSchemaRelationError(callError)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat meetings"));
    }

    throw new Error(callError?.message ?? "Could not start the meeting.");
  }

  const participantRows: Database["public"]["Tables"]["employee_chat_call_participants"]["Insert"][] = [
    {
      call_id: call.id,
      user_id: user.id,
      status: "joined",
      joined_at: new Date().toISOString(),
      audio_enabled: true,
      video_enabled: true,
      screen_sharing: false,
    },
  ];

  if (thread.thread_type === "direct") {
    const recipientUserId = thread.participant_one_user_id === user.id ? thread.participant_two_user_id : thread.participant_one_user_id;

    if (recipientUserId) {
      participantRows.push({
        call_id: call.id,
        user_id: recipientUserId,
        status: "invited",
        audio_enabled: true,
        video_enabled: true,
        screen_sharing: false,
      });
    }
  }

  const { error: participantError } = await supabase.from("employee_chat_call_participants").insert(participantRows);

  if (participantError) {
    if (isMissingSchemaRelationError(participantError)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat meetings"));
    }

    throw new Error(participantError.message);
  }

  await writeCallLogMessage(supabase, thread.id, user.id, "Started a meeting call.");
  revalidatePath("/employee");

  return loadCallResult(supabase, call as EmployeeChatCall);
}

export async function joinChatCall(callId: string): Promise<ChatCallResult> {
  const { supabase, user } = await getAuthenticatedChatClient();
  const cleanCallId = callId.trim();

  if (!cleanCallId) {
    throw new Error("Choose a meeting to join.");
  }

  await ensureActiveChatProfile(supabase, user.id);
  const call = await getAccessibleCall(supabase, cleanCallId);

  if (call.status !== "active") {
    throw new Error("That meeting has already ended.");
  }

  const { error } = await supabase.from("employee_chat_call_participants").upsert(
    {
      call_id: call.id,
      user_id: user.id,
      status: "joined",
      joined_at: new Date().toISOString(),
      left_at: null,
      audio_enabled: true,
      video_enabled: true,
      screen_sharing: false,
    },
    { onConflict: "call_id,user_id" },
  );

  if (error) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat meetings"));
    }

    throw new Error(error.message);
  }

  revalidatePath("/employee");
  return loadCallResult(supabase, call);
}

export async function leaveChatCall(callId: string): Promise<void> {
  const { supabase, user } = await getAuthenticatedChatClient();
  const call = await getAccessibleCall(supabase, callId.trim());

  const { error } = await supabase
    .from("employee_chat_call_participants")
    .update({
      status: "left",
      left_at: new Date().toISOString(),
      audio_enabled: false,
      video_enabled: false,
      screen_sharing: false,
    })
    .eq("call_id", call.id)
    .eq("user_id", user.id);

  if (error) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat meetings"));
    }

    throw new Error(error.message);
  }
}

export async function declineChatCall(callId: string): Promise<void> {
  const { supabase, user } = await getAuthenticatedChatClient();
  const call = await getAccessibleCall(supabase, callId.trim());
  const thread = await getAccessibleThread(supabase, call.thread_id);

  const { error } = await supabase.from("employee_chat_call_participants").upsert(
    {
      call_id: call.id,
      user_id: user.id,
      status: "declined",
      left_at: new Date().toISOString(),
      audio_enabled: false,
      video_enabled: false,
      screen_sharing: false,
    },
    { onConflict: "call_id,user_id" },
  );

  if (error) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat meetings"));
    }

    throw new Error(error.message);
  }

  if (thread.thread_type === "direct") {
    const endedAt = new Date().toISOString();
    const { error: callError } = await supabase
      .from("employee_chat_calls")
      .update({ status: "declined", ended_at: endedAt })
      .eq("id", call.id);

    if (callError && !isMissingSchemaRelationError(callError)) {
      throw new Error(callError.message);
    }

    await writeCallLogMessage(supabase, thread.id, user.id, "Declined the meeting call.");
  }

  revalidatePath("/employee");
}

export async function endChatCall(callId: string): Promise<void> {
  const { supabase, user } = await getAuthenticatedChatClient();
  const call = await getAccessibleCall(supabase, callId.trim());
  const endedAt = new Date().toISOString();

  const { error } = await supabase
    .from("employee_chat_calls")
    .update({ status: "ended", ended_at: endedAt })
    .eq("id", call.id);

  if (error) {
    if (isMissingSchemaRelationError(error)) {
      throw new Error(getOptionalFeatureSetupMessage("Employee chat meetings"));
    }

    throw new Error(error.message);
  }

  await supabase
    .from("employee_chat_call_participants")
    .update({
      status: "left",
      left_at: endedAt,
      audio_enabled: false,
      video_enabled: false,
      screen_sharing: false,
    })
    .eq("call_id", call.id)
    .eq("status", "joined");

  await writeCallLogMessage(supabase, call.thread_id, user.id, "Ended the meeting call.");
  revalidatePath("/employee");
}
