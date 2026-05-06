"use client";

import type { UIMessage } from "ai";

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

export function MessageResponse({ children }: { children: string }) {
  const lines = children.split(/\n+/).filter((line) => line.trim().length > 0);

  return (
    <div className="ai-message-response">
      {lines.length === 0 ? null : lines.map((line, index) => {
        const cleanLine = line.trim();

        if (cleanLine.startsWith("#")) {
          return <strong key={`${cleanLine}-${index}`}>{renderInlineMarkdown(cleanLine.replace(/^#+\s*/, ""))}</strong>;
        }

        if (/^[-*]\s+/.test(cleanLine)) {
          return <p key={`${cleanLine}-${index}`}>• {renderInlineMarkdown(cleanLine.replace(/^[-*]\s+/, ""))}</p>;
        }

        return <p key={`${cleanLine}-${index}`}>{renderInlineMarkdown(cleanLine)}</p>;
      })}
    </div>
  );
}

function getMessageText(message: UIMessage) {
  return (message.parts ?? [])
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }

      if (part.type.startsWith("tool-")) {
        const toolPart = part as unknown as { type: string; state?: string };
        return `Tool: ${toolPart.type.replace("tool-", "")}${toolPart.state ? ` (${toolPart.state})` : ""}`;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export function Message({ message }: { message: UIMessage }) {
  const text = getMessageText(message);

  if (!text) {
    return null;
  }

  return (
    <article className={`ai-chat-message ai-chat-message-${message.role}`}>
      <MessageResponse>{text}</MessageResponse>
    </article>
  );
}
