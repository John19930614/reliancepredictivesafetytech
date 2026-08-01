"use client";

import { Loader2, PenSquare, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { startMobileDirectThread } from "@/app/m/actions";
import { formatPortalRole } from "@/lib/user-management";
import { MobileAvatar } from "./MobileAvatar";

type Colleague = { userId: string; name: string; role: string };

export function MobileNewChatSheet({ colleagues }: { colleagues: Colleague[] }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return colleagues;
    }

    return colleagues.filter((colleague) => colleague.name.toLowerCase().includes(needle));
  }, [colleagues, query]);

  function close() {
    setIsOpen(false);
    setQuery("");
    setError(null);
  }

  function openConversation(userId: string) {
    setError(null);
    setPendingUserId(userId);

    startTransition(async () => {
      try {
        const threadId = await startMobileDirectThread(userId);
        close();
        router.push(`/m/chat/${threadId}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not open that conversation.");
      } finally {
        setPendingUserId(null);
      }
    });
  }

  return (
    <>
      <button aria-label="New conversation" className="m-icon-button" onClick={() => setIsOpen(true)} type="button">
        <PenSquare aria-hidden="true" size={18} strokeWidth={2.1} />
      </button>

      {isOpen ? (
        <div className="m-sheet-backdrop" onClick={close} role="presentation">
          <div
            aria-label="Start a new conversation"
            aria-modal="true"
            className="m-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="m-sheet-grip" />
            <div className="m-sheet-head">
              <h2>New conversation</h2>
              <button aria-label="Close" className="m-icon-button" onClick={close} type="button">
                <X aria-hidden="true" size={18} strokeWidth={2.1} />
              </button>
            </div>

            <label className="m-search">
              <Search aria-hidden="true" size={16} strokeWidth={2.1} />
              <input
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search teammates"
                type="search"
                value={query}
              />
            </label>

            {error ? <p className="m-error">{error}</p> : null}

            {filtered.length === 0 ? (
              <p className="m-sheet-empty">
                {colleagues.length === 0 ? "You already have a thread with everyone." : "No teammates match that search."}
              </p>
            ) : (
              <ul className="m-list m-sheet-list">
                {filtered.map((colleague) => (
                  <li key={colleague.userId}>
                    <button
                      className="m-list-row"
                      disabled={isPending}
                      onClick={() => openConversation(colleague.userId)}
                      type="button"
                    >
                      <MobileAvatar name={colleague.name} seed={colleague.userId} />
                      <span className="m-list-body">
                        <strong>{colleague.name}</strong>
                        <small>{formatPortalRole(colleague.role)}</small>
                      </span>
                      {pendingUserId === colleague.userId ? (
                        <Loader2 aria-hidden="true" className="spin m-list-arrow" size={16} strokeWidth={2.1} />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
