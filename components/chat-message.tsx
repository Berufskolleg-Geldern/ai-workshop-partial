"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  thinking?: string
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderMarkdown(value: string) {
  let html = escapeHtml(value)

  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    return `<pre class="rounded-xl bg-slate-800 p-3 text-xs overflow-x-auto"><code>${escapeHtml(code)}</code></pre>`
  })

  html = html.replace(/`([^`]+)`/g, (_, code) => {
    return `<code class="rounded px-1 bg-muted/80 text-muted-foreground">${escapeHtml(code)}</code>`
  })

  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>")
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")
  html = html.replace(/_(.+?)_/g, "<em>$1</em>")
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>")
  html = html.replace(/^[-*+]\s+(.+)$/gm, "<li>$1</li>")
  html = html.replace(/(<li>[\s\S]+?<\/li>)(?!(?:[\s\S]*?<li>))/g, (list) => {
    return `<ul>${list}</ul>`
  })
  html = html.replace(/\n{2,}/g, "</p><p>")
  html = `<p>${html}</p>`
  html = html.replace(/<p>\s*<\/p>/g, "")
  html = html.replace(/\n/g, "<br />")
  return html
}

interface ChatMessageProps {
  message: Message
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [isOpen, setIsOpen] = useState(true)
  const isUser = message.role === "user"

  return (
    <div
      className={cn(
        "flex gap-3 w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      
      <div
        id={`msg-${message.id}`}
        className={cn(
          "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "text-foreground rounded-bl-sm"
        )}
      >
  
        {message.thinking ? (
          <div className="mb-3  rounded-2xl border border-border px-3 py-2 text-sm italic text-muted-foreground">
            <button
              type="button"
              onClick={() => setIsOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 text-left text-sm font-medium text-muted-foreground"
            >
              <span>Thinking Process</span>
              <span>{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="mt-2 text-muted-foreground italic">
                <div
                  className="markdown prose max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(message.thinking),
                  }}
                />
              </div>
            )}
          </div>
        ) : null}


        <div
          className="markdown prose max-w-none whitespace-pre-wrap"
          dangerouslySetInnerHTML={{
            __html:
              message.role === "assistant"
                ? renderMarkdown(message.content || "")
                : escapeHtml(message.content),
          }}
        />


        <p
          className={cn(
            "text-[10px] mt-1 select-none",
            isUser ? "text-primary-foreground/60" : "text-muted-foreground"
          )}
        >
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-secondary-foreground"
          >
            <circle cx="12" cy="8" r="5" />
            <path d="M20 21a8 8 0 0 0-16 0" />
          </svg>
        </div>
      )}
    </div>
  )
}
