import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { MobileAvatar } from "@/components/mobile/MobileAvatar";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { MobileNewChatSheet } from "@/components/mobile/MobileNewChatSheet";
import { formatRelativeTimestamp } from "@/lib/mobile-app";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { requireMobileTabSession } from "../session";

export const dynamic = "force-dynamic";

export default async function MobileChatListPage() {
  const session = await requireMobileTabSession("chat");
  const { supabase } = session;

  const [{ data: profiles, error: profilesError }, { data: threads, error: threadsError }] = await Promise.all([
    supabase.from("employee_chat_profiles").select("user_id, display_name, email, role").eq("account_status", "active"),
    // RLS scopes this to the company thread plus the caller's own direct threads.
    supabase.from("employee_chat_threads").select("*").order("updated_at", { ascending: false }),
  ]);

  if (
    (profilesError && !isMissingSchemaRelationError(profilesError)) ||
    (threadsError && !isMissingSchemaRelationError(threadsError))
  ) {
    console.error("Could not load mobile chat threads.", profilesError ?? threadsError);
  }

  const allProfiles = profiles ?? [];
  const allThreads = threads ?? [];
  const threadIds = allThreads.map((thread) => thread.id);

  const { data: recentMessages } = threadIds.length
    ? await supabase
        .from("employee_chat_messages")
        .select("thread_id, body, created_at, sender_user_id")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] };

  // Collapse to the newest message per thread; the query is already sorted.
  const lastMessageByThread = new Map<string, { body: string; created_at: string | null }>();
  for (const message of recentMessages ?? []) {
    if (!lastMessageByThread.has(message.thread_id)) {
      lastMessageByThread.set(message.thread_id, { body: message.body, created_at: message.created_at });
    }
  }

  const profileByUserId = new Map(allProfiles.map((profile) => [profile.user_id, profile]));

  function describeThread(thread: (typeof allThreads)[number]) {
    if (thread.thread_type === "company") {
      return { name: thread.title || "Company chat", isCompany: true, seed: thread.id };
    }

    const otherUserId =
      thread.participant_one_user_id === session.userId ? thread.participant_two_user_id : thread.participant_one_user_id;
    const other = otherUserId ? profileByUserId.get(otherUserId) : undefined;

    return {
      name: other?.display_name || other?.email || "Direct message",
      isCompany: false,
      seed: otherUserId ?? thread.id,
    };
  }

  const sortedThreads = [...allThreads].sort((left, right) => {
    if (left.thread_type !== right.thread_type) {
      return left.thread_type === "company" ? -1 : 1;
    }

    const leftAt = lastMessageByThread.get(left.id)?.created_at ?? left.updated_at ?? "";
    const rightAt = lastMessageByThread.get(right.id)?.created_at ?? right.updated_at ?? "";

    return rightAt.localeCompare(leftAt);
  });

  const existingDirectUserIds = new Set(
    allThreads
      .filter((thread) => thread.thread_type === "direct")
      .map((thread) =>
        thread.participant_one_user_id === session.userId ? thread.participant_two_user_id : thread.participant_one_user_id,
      )
      .filter(Boolean) as string[],
  );

  const availableColleagues = allProfiles
    .filter((profile) => profile.user_id !== session.userId && !existingDirectUserIds.has(profile.user_id))
    .map((profile) => ({
      userId: profile.user_id,
      name: profile.display_name || profile.email || "Employee",
      role: profile.role,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const now = new Date();

  return (
    <>
      <MobileHeader
        eyebrow="Chat"
        subtitle={`${allProfiles.length} active teammate${allProfiles.length === 1 ? "" : "s"}`}
        title="Conversations"
        action={<MobileNewChatSheet colleagues={availableColleagues} />}
      />

      {sortedThreads.length === 0 ? (
        <div className="m-empty">
          <Users aria-hidden="true" size={26} strokeWidth={1.7} />
          <p>No conversations yet.</p>
          <small>Start one with a teammate using the button above.</small>
        </div>
      ) : (
        <ul className="m-list m-list-cards">
          {sortedThreads.map((thread) => {
            const details = describeThread(thread);
            const last = lastMessageByThread.get(thread.id);

            return (
              <li key={thread.id}>
                <Link className="m-list-row" href={`/m/chat/${thread.id}`}>
                  <MobileAvatar
                    icon={details.isCompany ? <Users aria-hidden="true" size={18} strokeWidth={2.1} /> : undefined}
                    name={details.name}
                    seed={details.seed}
                  />
                  <span className="m-list-body">
                    <strong>{details.name}</strong>
                    <small className="m-truncate">{last?.body ?? "No messages yet"}</small>
                  </span>
                  <span className="m-list-meta">
                    <time>{formatRelativeTimestamp(last?.created_at, now)}</time>
                    <ChevronRight aria-hidden="true" size={16} strokeWidth={2.1} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
