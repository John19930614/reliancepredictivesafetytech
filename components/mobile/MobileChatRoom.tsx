"use client";

import { Loader2, SendHorizontal, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { sendMobileChatMessage } from "@/app/m/actions";
import { formatRelativeTimestamp } from "@/lib/mobile-app";
import { createClient } from "@/lib/supabase/client";
import { MobileAvatar } from "./MobileAvatar";
import { MobileHeader } from "./MobileHeader";

type ChatMessage = {
  id: string;
  body: string;
  createdAt: string | null;
  senderUserId: string | null;
  senderName: string;
};

type MobileChatRoomProps = {
  threadId: string;
  title: string;
  isCompanyThread: boolean;
  currentUserId: string;
  initialMessages: ChatMessage[];
};

export function MobileChatRoom({
  threadId,
  title,
  isCompanyThread,
  currentUserId,
  initialMessages,
}: MobileChatRoomProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  useEffect(() => {
    scrollToBottom("auto");
  }, [scrollToBottom]);

  // Live tail of the thread. Names are not in the payload, so an unknown sender
  // shows as "Teammate" until the next full page load fills the profile in.
  useEffect(() => {
    const supabase = createClient();

    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`mobile-chat-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "employee_chat_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as { id: string; body: string; created_at: string | null; sender_user_id: string | null };

          setMessages((current) => {
            if (current.some((message) => message.id === row.id)) {
              return current;
            }

            return [
              ...current,
              {
                id: row.id,
                body: row.body,
                createdAt: row.created_at,
                senderUserId: row.sender_user_id,
                senderName: row.sender_user_id === currentUserId ? "You" : "Teammate",
              },
            ];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, threadId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  function autosize(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  }

  function submit() {
    const body = draft.trim();

    if (!body || isPending) {
      return;
    }

    setError(null);
    setDraft("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    startTransition(async () => {
      try {
        const saved = await sendMobileChatMessage(threadId, body);
        setMessages((current) =>
          current.some((message) => message.id === saved.id)
            ? current
            : [
                ...current,
                {
                  id: saved.id,
                  body: saved.body,
                  createdAt: saved.created_at,
                  senderUserId: saved.sender_user_id,
                  senderName: "You",
                },
              ],
        );
      } catch (cause) {
        setDraft(body);
        setError(cause instanceof Error ? cause.message : "Could not send that message.");
      }
    });
  }

  const now = new Date();

  return (
    <div className="m-chatroom">
      <MobileHeader
        backHref="/m/chat"
        backLabel="Conversations"
        title={title}
        action={
          <MobileAvatar
            icon={isCompanyThread ? <Users aria-hidden="true" size={18} strokeWidth={2.1} /> : undefined}
            name={title}
            seed={threadId}
          />
        }
      />

      <div className="m-messages">
        {messages.length === 0 ? (
          <div className="m-empty">
            <SendHorizontal aria-hidden="true" size={24} strokeWidth={1.7} />
            <p>No messages yet.</p>
            <small>Say hello to get the thread started.</small>
          </div>
        ) : (
          messages.map((message, index) => {
            const isMine = message.senderUserId === currentUserId;
            const previous = messages[index - 1];
            const showSender = !isMine && (!previous || previous.senderUserId !== message.senderUserId);

            return (
              <div className={`m-bubble-row${isMine ? " is-mine" : ""}`} key={message.id}>
                {showSender && isCompanyThread ? <span className="m-bubble-sender">{message.senderName}</span> : null}
                <div className="m-bubble">
                  <p>{message.body}</p>
                  <time>{formatRelativeTimestamp(message.createdAt, now)}</time>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error ? <p className="m-error m-composer-error">{error}</p> : null}

      <form
        className="m-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          maxLength={2000}
          onChange={(event) => {
            setDraft(event.target.value);
            autosize(event.target);
          }}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter adds a line, matching the desktop chat.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Message"
          ref={textareaRef}
          rows={1}
          value={draft}
        />
        <button aria-label="Send message" className="m-send" disabled={!draft.trim() || isPending} type="submit">
          {isPending ? (
            <Loader2 aria-hidden="true" className="spin" size={18} strokeWidth={2.3} />
          ) : (
            <SendHorizontal aria-hidden="true" size={18} strokeWidth={2.3} />
          )}
        </button>
      </form>
    </div>
  );
}
