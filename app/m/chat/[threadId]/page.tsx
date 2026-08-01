import { notFound } from "next/navigation";
import { MobileChatRoom } from "@/components/mobile/MobileChatRoom";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { requireMobileTabSession } from "../../session";

export const dynamic = "force-dynamic";

export default async function MobileChatThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const session = await requireMobileTabSession("chat");
  const { supabase } = session;

  // RLS returns nothing for a thread the caller is not part of, so an
  // unauthorised id is indistinguishable from a missing one.
  const { data: thread, error: threadError } = await supabase
    .from("employee_chat_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();

  if (threadError && !isMissingSchemaRelationError(threadError)) {
    console.error("Could not load the mobile chat thread.", threadError);
  }

  if (!thread) {
    notFound();
  }

  const [{ data: profiles }, { data: messages }] = await Promise.all([
    supabase.from("employee_chat_profiles").select("user_id, display_name, email"),
    supabase
      .from("employee_chat_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const profileByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

  const otherUserId =
    thread.thread_type === "direct"
      ? thread.participant_one_user_id === session.userId
        ? thread.participant_two_user_id
        : thread.participant_one_user_id
      : null;
  const otherProfile = otherUserId ? profileByUserId.get(otherUserId) : undefined;

  const title =
    thread.thread_type === "company"
      ? thread.title || "Company chat"
      : otherProfile?.display_name || otherProfile?.email || "Direct message";

  return (
    <MobileChatRoom
      currentUserId={session.userId}
      isCompanyThread={thread.thread_type === "company"}
      initialMessages={[...(messages ?? [])].reverse().map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.created_at,
        senderUserId: message.sender_user_id,
        senderName:
          message.sender_user_id === session.userId
            ? "You"
            : profileByUserId.get(message.sender_user_id ?? "")?.display_name ||
              profileByUserId.get(message.sender_user_id ?? "")?.email ||
              "Teammate",
      }))}
      threadId={thread.id}
      title={title}
    />
  );
}
