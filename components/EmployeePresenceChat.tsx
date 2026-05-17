"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, MessageCircle, Radio, Send, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { ensureDirectThread, markChatNotificationsRead, sendChatMessage } from "@/app/employee/chat/actions";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type EmployeeChatProfile = Database["public"]["Tables"]["employee_chat_profiles"]["Row"];
type EmployeeChatThread = Database["public"]["Tables"]["employee_chat_threads"]["Row"];
type EmployeeChatMessage = Database["public"]["Tables"]["employee_chat_messages"]["Row"];
type PortalNotification = Database["public"]["Tables"]["portal_notifications"]["Row"];

type EmployeePresenceChatProps = {
  currentUser: {
    id: string;
    displayName: string;
    email: string | null;
  };
  companyThread: EmployeeChatThread | null;
  initialProfiles: EmployeeChatProfile[];
  initialCompanyMessages: EmployeeChatMessage[];
  initialUnreadChatNotificationCount: number;
};

type PresencePayload = {
  user_id: string;
  display_name: string;
  email: string | null;
  online_at: string;
};

function getProfileName(profile: Pick<EmployeeChatProfile, "display_name" | "email" | "user_id"> | undefined) {
  return profile?.display_name || profile?.email || profile?.user_id.slice(0, 8) || "Employee";
}

function mergeMessage(messages: EmployeeChatMessage[], message: EmployeeChatMessage) {
  if (messages.some((item) => item.id === message.id)) {
    return messages;
  }

  return [...messages, message].sort((first, second) => first.created_at.localeCompare(second.created_at));
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function EmployeePresenceChat({
  currentUser,
  companyThread,
  initialProfiles,
  initialCompanyMessages,
  initialUnreadChatNotificationCount,
}: EmployeePresenceChatProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"company" | "direct">("company");
  const [selectedRecipientId, setSelectedRecipientId] = useState("");
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [directThreads, setDirectThreads] = useState<Record<string, EmployeeChatThread>>({});
  const [messagesByThread, setMessagesByThread] = useState<Record<string, EmployeeChatMessage[]>>(() =>
    companyThread ? { [companyThread.id]: initialCompanyMessages } : {},
  );
  const [draft, setDraft] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [loadingThreadId, setLoadingThreadId] = useState("");
  const [sending, setSending] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(initialUnreadChatNotificationCount);
  const [latestNotificationTitle, setLatestNotificationTitle] = useState("");
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const profileByUserId = useMemo(
    () => new Map(initialProfiles.map((profile) => [profile.user_id, profile])),
    [initialProfiles],
  );
  const currentUserProfile = profileByUserId.get(currentUser.id);
  const activeProfiles = useMemo(
    () =>
      initialProfiles
        .filter((profile) => profile.user_id !== currentUser.id && profile.account_status === "active")
        .sort((first, second) => {
          const firstOnline = onlineUserIds.has(first.user_id) ? 0 : 1;
          const secondOnline = onlineUserIds.has(second.user_id) ? 0 : 1;

          if (firstOnline !== secondOnline) {
            return firstOnline - secondOnline;
          }

          return getProfileName(first).localeCompare(getProfileName(second));
        }),
    [currentUser.id, initialProfiles, onlineUserIds],
  );

  const selectedRecipient = selectedRecipientId ? profileByUserId.get(selectedRecipientId) : null;
  const activeThread = activeTab === "company" ? companyThread : selectedRecipientId ? directThreads[selectedRecipientId] : null;
  const activeMessages = activeThread ? messagesByThread[activeThread.id] ?? [] : [];
  const onlineCount = [...onlineUserIds].filter((userId) => userId !== currentUser.id).length;
  const toggleBadgeCount = unreadChatCount > 0 ? unreadChatCount : onlineCount;

  const clearChatNotifications = useCallback((force = false) => {
    if (!force && unreadChatCount === 0 && !latestNotificationTitle) {
      return;
    }

    setUnreadChatCount(0);
    setLatestNotificationTitle("");
    void markChatNotificationsRead()
      .then(() => router.refresh())
      .catch((error) => {
        setStatusMessage(error instanceof Error ? error.message : "Could not update chat notifications.");
      });
  }, [latestNotificationTitle, router, unreadChatCount]);

  const markLastSeen = useCallback(() => {
    if (!supabase) {
      return;
    }

    void supabase.rpc("mark_employee_last_seen").then(({ error }) => {
      if (error) {
        console.error("Could not update employee last seen timestamp.", error);
      }
    });
  }, [supabase]);

  useEffect(() => {
    markLastSeen();

    const intervalId = window.setInterval(markLastSeen, 5 * 60 * 1000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markLastSeen();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [markLastSeen]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const presenceKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `${currentUser.id}-${crypto.randomUUID()}`
        : `${currentUser.id}-${Date.now()}`;
    const channel = supabase.channel("employee-presence", {
      config: {
        presence: {
          key: presenceKey,
        },
      },
    });
    const updatePresence = () => {
      const state = channel.presenceState() as Record<string, PresencePayload[]>;
      const nextOnlineUserIds = new Set<string>();

      Object.values(state).forEach((presences) => {
        presences.forEach((presence) => {
          if (presence.user_id) {
            nextOnlineUserIds.add(presence.user_id);
          }
        });
      });

      setOnlineUserIds(nextOnlineUserIds);
    };

    channel
      .on("presence", { event: "sync" }, updatePresence)
      .on("presence", { event: "join" }, updatePresence)
      .on("presence", { event: "leave" }, updatePresence)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: currentUser.id,
            display_name: getProfileName(currentUserProfile) || currentUser.displayName,
            email: currentUser.email,
            online_at: new Date().toISOString(),
          } satisfies PresencePayload);
        }
      });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [currentUser.displayName, currentUser.email, currentUser.id, currentUserProfile, supabase]);

  useEffect(() => {
    if (!open) {
      return;
    }

    clearChatNotifications();
  }, [clearChatNotifications, open]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel("employee-chat-message-stream")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "employee_chat_messages",
        },
        (payload) => {
          const message = payload.new as EmployeeChatMessage;

          setMessagesByThread((currentMessages) => ({
            ...currentMessages,
            [message.thread_id]: mergeMessage(currentMessages[message.thread_id] ?? [], message),
          }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`employee-chat-notifications-${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "portal_notifications",
          filter: `recipient_user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          const notification = payload.new as PortalNotification;

          if (notification.source_type !== "employee_chat_message" || notification.status !== "unread") {
            return;
          }

          if (open) {
            clearChatNotifications(true);
            return;
          }

          setUnreadChatCount((count) => count + 1);
          setLatestNotificationTitle(notification.title);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "portal_notifications",
          filter: `recipient_user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          const oldNotification = payload.old as Partial<PortalNotification>;
          const notification = payload.new as PortalNotification;

          if (notification.source_type !== "employee_chat_message") {
            return;
          }

          if (oldNotification.status === "unread" && notification.status !== "unread") {
            setUnreadChatCount((count) => Math.max(0, count - 1));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clearChatNotifications, currentUser.id, open, supabase]);

  useEffect(() => {
    if (open) {
      messageEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [activeMessages.length, open, activeThread?.id]);

  async function loadMessages(threadId: string) {
    if (!supabase || messagesByThread[threadId]) {
      return;
    }

    setLoadingThreadId(threadId);
    const { data, error } = await supabase
      .from("employee_chat_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(80);

    setLoadingThreadId("");

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setMessagesByThread((currentMessages) => ({
      ...currentMessages,
      [threadId]: [...(data ?? [])].reverse() as EmployeeChatMessage[],
    }));
  }

  async function openDirectThread(recipientUserId: string) {
    setActiveTab("direct");
    setSelectedRecipientId(recipientUserId);
    setStatusMessage("");

    if (directThreads[recipientUserId]) {
      await loadMessages(directThreads[recipientUserId].id);
      return;
    }

    setLoadingThreadId(recipientUserId);

    try {
      const thread = await ensureDirectThread(recipientUserId);
      setDirectThreads((currentThreads) => ({ ...currentThreads, [recipientUserId]: thread }));
      await loadMessages(thread.id);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not open chat.");
    } finally {
      setLoadingThreadId("");
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeThread || sending) {
      return;
    }

    setSending(true);
    setStatusMessage("");

    try {
      const message = await sendChatMessage(activeThread.id, draft);
      setDraft("");
      setMessagesByThread((currentMessages) => ({
        ...currentMessages,
        [message.thread_id]: mergeMessage(currentMessages[message.thread_id] ?? [], message),
      }));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  if (!supabase || !companyThread) {
    return null;
  }

  return (
    <div className={`employee-chat-shell${open ? " employee-chat-shell-open" : ""}`}>
      <button className="employee-chat-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-label="Open employee chat">
        <MessageCircle size={21} />
        {toggleBadgeCount > 0 ? (
          <span className={unreadChatCount > 0 ? "employee-chat-unread-count" : "employee-chat-online-count"}>
            {toggleBadgeCount > 99 ? "99+" : toggleBadgeCount}
          </span>
        ) : null}
      </button>
      {latestNotificationTitle && !open ? (
        <button
          className="employee-chat-toast"
          type="button"
          onClick={() => {
            setOpen(true);
            clearChatNotifications(true);
          }}
        >
          <Bell size={16} />
          <span>{latestNotificationTitle}</span>
        </button>
      ) : null}

      {open ? (
        <aside className="employee-chat-drawer" aria-label="Employee chat">
          <div className="employee-chat-header">
            <div>
              <span className="eyebrow">Team Chat</span>
              <h2>{activeTab === "company" ? "Company Room" : selectedRecipient ? getProfileName(selectedRecipient) : "Direct Messages"}</h2>
            </div>
            <button type="button" className="icon-button employee-chat-close" onClick={() => setOpen(false)} aria-label="Close employee chat">
              <X size={18} />
            </button>
          </div>

          <div className="employee-chat-tabs" role="tablist" aria-label="Chat views">
            <button
              className={activeTab === "company" ? "active" : undefined}
              type="button"
              onClick={() => {
                setActiveTab("company");
                setStatusMessage("");
              }}
            >
              <Users size={16} />
              Company
            </button>
            <button
              className={activeTab === "direct" ? "active" : undefined}
              type="button"
              onClick={() => {
                setActiveTab("direct");
                setStatusMessage("");
              }}
            >
              <MessageCircle size={16} />
              Direct
            </button>
          </div>

          <div className="employee-chat-body">
            <section className="employee-chat-people" aria-label="Active employees">
              <div className="employee-chat-people-head">
                <strong>{activeTab === "company" ? "Online now" : "Employees"}</strong>
                <span>{onlineCount}</span>
              </div>
              <div className="employee-chat-people-list">
                {activeProfiles.length === 0 ? (
                  <div className="employee-chat-empty">No active employees found.</div>
                ) : (
                  activeProfiles.map((profile) => {
                    const online = onlineUserIds.has(profile.user_id);
                    const selected = selectedRecipientId === profile.user_id && activeTab === "direct";

                    return (
                      <button
                        className={selected ? "employee-chat-person active" : "employee-chat-person"}
                        type="button"
                        key={profile.user_id}
                        onClick={() => void openDirectThread(profile.user_id)}
                      >
                        <span className={online ? "presence-dot presence-dot-online" : "presence-dot"} />
                        <span>
                          <strong>{getProfileName(profile)}</strong>
                          <small>{profile.team || profile.role.replace("_", " ")}</small>
                        </span>
                        {online ? <Radio size={14} /> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <section className="employee-chat-conversation" aria-label="Messages">
              <div className="employee-chat-thread-space">
                {statusMessage ? <div className="employee-chat-status">{statusMessage}</div> : null}
                {activeTab === "direct" && !selectedRecipient ? (
                  <div className="employee-chat-empty">Choose an employee.</div>
                ) : loadingThreadId === activeThread?.id || loadingThreadId === selectedRecipientId ? (
                  <div className="employee-chat-empty">Loading chat.</div>
                ) : activeMessages.length === 0 ? (
                  <div className="employee-chat-empty">No messages yet.</div>
                ) : (
                  <div className="employee-chat-message-list">
                    {activeMessages.map((message) => {
                      const mine = message.sender_user_id === currentUser.id;
                      const sender = message.sender_user_id ? profileByUserId.get(message.sender_user_id) : undefined;

                      return (
                        <article className={mine ? "employee-chat-message mine" : "employee-chat-message"} key={message.id}>
                          <div>
                            <strong>{mine ? "You" : getProfileName(sender)}</strong>
                            <span>{formatMessageTime(message.created_at)}</span>
                          </div>
                          <p>{message.body}</p>
                        </article>
                      );
                    })}
                    <div ref={messageEndRef} />
                  </div>
                )}
              </div>

              <form className="employee-chat-composer" onSubmit={handleSend}>
                <textarea
                  aria-label="Message"
                  disabled={!activeThread || sending}
                  maxLength={2000}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (!activeThread || sending || draft.trim().length === 0) {
                        return;
                      }

                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Message..."
                  value={draft}
                />
                <button className="button button-primary" disabled={!activeThread || sending || draft.trim().length === 0} type="submit" aria-label="Send message">
                  <Send size={17} />
                </button>
              </form>
            </section>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
