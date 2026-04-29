"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage, type Message } from "@/components/chat-message";
import { TypingIndicator } from "@/components/typing-indicator";
import { ChatSidebar } from "@/components/chat-sidebar";
import { cn } from "@/lib/utils";

const MOCK_RESPONSES = [
  "Das ist eine interessante Frage! Lass mich darüber nachdenken...\n\nIch würde sagen, es hängt stark vom Kontext ab. Generell gilt: Einfachheit gewinnt fast immer.",
  "Sehr gute Überlegung. Hier sind einige Punkte, die ich dazu habe:\n\n1. Der erste Schritt ist immer der schwerste\n2. Kontinuität schlägt Intensität\n3. Kleine Verbesserungen summieren sich",
  "Ja, das kenne ich gut! Viele Menschen stehen vor genau dieser Herausforderung. Mein Rat wäre, klein anzufangen und dann schrittweise auszubauen.",
  "Gute Frage! Ich würde empfehlen, zunächst die Grundlagen zu festigen, bevor du zu komplexeren Themen übergehst.",
  "Das ist tatsächlich ein häufiges Missverständnis. Die Wahrheit ist etwas differenzierter – es gibt Situationen, in denen beide Ansätze ihre Berechtigung haben.",
  "Interessant! Ich sehe das ähnlich wie du. Es lohnt sich, die verschiedenen Perspektiven abzuwägen.",
];

const INITIAL_MESSAGES: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    content: "",
    timestamp: new Date(Date.now() - 60000),
    thinking: "",
  },
];

const SUGGESTIONS = [
  "Erkläre mir maschinelles Lernen",
  "Hilf mir beim Planen",
  "Schreib einen Text für mich",
  "Was kannst du alles?",
];

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([
    "gemma4:e2b",
  ]);
  const [selectedModel, setSelectedModel] = useState("gemma4:e2b");
  const [modelsError, setModelsError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);

  const userMessages = messages.filter((msg) => msg.role === "user");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/ollama", {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorJson = await response.json().catch(() => null);
          throw new Error(
            errorJson?.error ||
              `Fehler beim Abrufen der Modelle: ${response.statusText}`,
          );
        }

        const data = await response.json().catch(() => null);
        const models = Array.isArray(data?.models) ? data.models : [];

        if (models.length > 0) {
          setAvailableModels(models);
          if (!models.includes(selectedModel)) {
            setSelectedModel(models[0]);
          }
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setModelsError(
            error instanceof Error
              ? error.message
              : "Modelle konnten nicht geladen werden.",
          );
        }
      });

    return () => controller.abort();
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userId = Date.now().toString();
      const assistantId = `assistant-${userId}`;
      activeAssistantIdRef.current = assistantId;

      const userMsg: Message = {
        id: userId,
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };

      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        thinking: "",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setIsTyping(true);

      const updateAssistant = (update: Partial<Message>) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId ? { ...msg, ...update } : msg,
          ),
        );
      };

      const mergeText = (previous: string, next: string) => {
        if (!next) return previous;
        if (next.startsWith(previous)) return next;
        if (previous.endsWith(next)) return previous;
        return previous + next;
      };

      try {
        const response = await fetch("/api/ollama", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: trimmed, model: selectedModel }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const errorText =
            errorData?.error ||
            `Fehler beim Abrufen der Antwort: ${response.status} ${response.statusText}`;

          updateAssistant({ content: `Fehler: ${errorText}` });
          return;
        }

        if (!response.body) {
          const json = await response.json().catch(() => null);
          const content = json?.text || "Keine Antwort erhalten.";
          updateAssistant({ content });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let thinkingText = "";
        let responseText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line) as {
                type: "thinking" | "response";
                text: string;
              };

              if (event.type === "thinking") {
                thinkingText = mergeText(thinkingText, event.text);
                updateAssistant({ thinking: thinkingText });
              }

              if (event.type === "response") {
                responseText = mergeText(responseText, event.text);
                updateAssistant({ content: responseText });
              }
            } catch {
              // ignore malformed lines
            }
          }
        }

        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer) as {
              type: "thinking" | "response";
              text: string;
            };
            if (event.type === "thinking") {
              thinkingText = mergeText(thinkingText, event.text);
              updateAssistant({ thinking: thinkingText });
            }
            if (event.type === "response") {
              responseText = mergeText(responseText, event.text);
              updateAssistant({ content: responseText });
            }
          } catch {
            // ignore malformed final buffer
          }
        }

        if (!responseText) {
          updateAssistant({ content: "Leere Antwort von Ollama." });
        }
      } catch (error) {
        const isAbortError =
          error instanceof DOMException && error.name === "AbortError";

        if (!isAbortError) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Unbekannter Fehler beim Senden der Anfrage.";

          updateAssistant({ content: `Verbindungsfehler: ${errorMessage}` });
        } else {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId && !msg.content
                ? { ...msg, content: "Abgebrochen." }
                : msg,
            ),
          );
        }
      } finally {
        abortControllerRef.current = null;
        activeAssistantIdRef.current = null;
        setIsTyping(false);
      }
    },
    [isTyping],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleSelectMessage = (id: string) => {
    setActiveMessageId(id);
    document.getElementById(`msg-${id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const handleStop = () => {
    const assistantId = activeAssistantIdRef.current;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeAssistantIdRef.current = null;
    setIsTyping(false);

    if (assistantId) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId ? { ...msg, content: "Abgebrochen." } : msg,
        ),
      );
    }
  };

  const handleNewChat = () => {
    setMessages(INITIAL_MESSAGES);
    setInput("");
    setActiveMessageId(null);
  };

  const isEmpty = messages.length === 1 && messages[0].id === "welcome";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out flex-shrink-0",
          sidebarOpen ? "w-64" : "w-0 overflow-hidden",
        )}
      >
        <ChatSidebar
          activeId={activeMessageId}
          messages={userMessages}
          onSelect={handleSelectMessage}
          onNew={handleNewChat}
        />
      </div>

      {/* Main chat area */}
      <main className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm flex-shrink-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Sidebar umschalten"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              Lokaler Chat
            </span>
            <div className="inline-flex flex-col gap-1 rounded-full border border-border bg-muted px-3 py-1.5">
              <div className="inline-flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
                  Lokal
                </span>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="min-w-[10rem] bg-transparent text-[11px] text-foreground outline-none"
                >
                  {availableModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
              {modelsError ? (
                <span className="text-[10px] text-destructive-500">
                  Modellliste konnte nicht geladen werden.
                </span>
              ) : null}
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
            {isEmpty && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#efefef] flex items-center justify-center">
                              <img src="https://www.berufskolleg-geldern.de/fileadmin/daten/bk_geldern/berufskolleg-geldern-logo.svg" style={{ width: "100%", height: "80%",  }} />

                </div>
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-foreground">
                    Womit kann ich helfen?
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Stelle eine Frage oder wähle einen Vorschlag.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full max-w-sm mt-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-left px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-sm text-foreground transition-colors leading-relaxed"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => {
              if (idx === 0) {
                return;
              }

              return (
                <div key={msg.id} id={`msg-${msg.id}`}>
                  <ChatMessage message={msg} />
                </div>
              );
            })}

            {isTyping && <TypingIndicator />}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-border bg-background/80 backdrop-blur-sm px-4 py-3 flex-shrink-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-2 bg-muted rounded-2xl px-4 py-2 border border-border focus-within:border-ring transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nachricht schreiben..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none py-1.5 leading-relaxed max-h-40"
                style={{ scrollbarWidth: "none" }}
              />
              {isTyping ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-destructive text-destructive-foreground hover:opacity-90 transition-all mb-0.5"
                  aria-label="Stopp"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isTyping}
                  className={cn(
                    "flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all mb-0.5",
                    input.trim() && !isTyping
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "bg-muted-foreground/20 text-muted-foreground cursor-not-allowed",
                  )}
                  aria-label="Senden"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
            <p className="text-center text-[10px] text-muted-foreground mt-2">
              Drucke{" "}
              <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">
                Enter
              </kbd>{" "}
              zum Senden &middot;{" "}
              <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">
                Shift+Enter
              </kbd>{" "}
              fur neue Zeile
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
