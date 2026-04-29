"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { type Message } from "@/components/chat-message"

interface ChatSidebarProps {
  activeId: string | null
  messages: Message[]
  onSelect: (id: string) => void
  onNew: () => void
}

export function ChatSidebar({ activeId, messages, onSelect, onNew }: ChatSidebarProps) {
  const [search, setSearch] = useState("")
  const filteredMessages = messages.filter((msg) =>
    msg.content.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <aside className="w-64 flex flex-col border-r border-border bg-sidebar h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary-foreground"
            >
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M15 13v2" />
              <path d="M9 13v2" />
            </svg>
          </div>
          <span className="font-semibold text-sm text-sidebar-foreground">
            BKG-AI
          </span>
        </div>
        <button
          onClick={onNew}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
          aria-label="Neuer Chat"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 bg-sidebar-accent rounded-lg px-3 py-2">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-sidebar-foreground/50 flex-shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="text"
            placeholder="Suchen..."
            className="bg-transparent text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/40 outline-none w-full"
          />
        </div>
      </div>

      {/* Verlauf */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        <p className="text-[10px] font-medium text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-1">
          Verlauf
        </p>
        {filteredMessages.length === 0 ? (
          <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
            Keine Anfragen gefunden.
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filteredMessages.map((msg) => (
              <li key={msg.id}>
                <button
                  onClick={() => onSelect(msg.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg transition-colors group",
                    activeId === msg.id
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "hover:bg-sidebar-accent/60 text-sidebar-foreground/70 hover:text-sidebar-foreground"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium truncate">{msg.content}</p>
                    <span className="text-[10px] text-sidebar-foreground/40 flex-shrink-0">
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-[11px] text-sidebar-foreground/50 truncate mt-0.5">
                    Anfrage anzeigen
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors group">
          <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-sidebar-foreground"
            >
              <circle cx="12" cy="8" r="5" />
              <path d="M20 21a8 8 0 0 0-16 0" />
            </svg>
          </div>
          <div className="flex-1 text-left overflow-hidden">
            <p className="text-xs font-medium text-sidebar-foreground truncate">
              Lokales Konto
            </p>
            <p className="text-[10px] text-sidebar-foreground/50 truncate">
              pc-90@bkg.local
            </p>
          </div>
         
        </button>
      </div>
    </aside>
  )
}
