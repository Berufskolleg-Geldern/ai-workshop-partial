import { NextResponse } from "next/server"

const OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
const OLLAMA_MODELS_URL = "http://127.0.0.1:11434/api/tags"
const MODEL_NAME = "gemma4:e2b"
const encoder = new TextEncoder()
const decoder = new TextDecoder()

type StreamEvent = {
  type: "thinking" | "response"
  text: string
}

function buildStreamEvent(type: StreamEvent["type"], text: string): StreamEvent {
  return { type, text }
}

function extractStreamEvent(event: unknown): StreamEvent | null {
  if (!event || typeof event !== "object") {
    return null
  }

  const data = event as Record<string, unknown>
  const message = data.message as Record<string, unknown> | undefined

  if (message) {
    const thinking = typeof message.thinking === "string" ? message.thinking : ""
    const content = typeof message.content === "string" ? message.content : ""

    if (thinking.length > 0) {
      return buildStreamEvent("thinking", thinking)
    }

    if (content.length > 0) {
      return buildStreamEvent("response", content)
    }
  }

  if (typeof data.text === "string" && data.text.length > 0) {
    return buildStreamEvent("response", data.text)
  }

  if (typeof data.response === "string" && data.response.length > 0) {
    return buildStreamEvent("response", data.response)
  }

  if (Array.isArray(data.choices)) {
    const text = data.choices
      .map((choice) => {
        if (typeof choice !== "object" || choice === null) {
          return ""
        }
        const choiceObj = choice as Record<string, unknown>
        if (typeof choiceObj.text === "string") {
          return choiceObj.text
        }
        if (
          typeof choiceObj.message === "object" &&
          choiceObj.message !== null &&
          typeof (choiceObj.message as Record<string, unknown>).content === "string"
        ) {
          return (choiceObj.message as Record<string, unknown>).content
        }
        return ""
      })
      .join("")

    if (text.length > 0) {
      return buildStreamEvent("response", text)
    }
  }

  return null
}

function parseEventLine(line: string): StreamEvent | null {
  const trimmed = line.replace(/^data:\s*/i, "").trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed)
    return extractStreamEvent(parsed)
  } catch {
    return null
  }
}

export async function GET() {
  let models: string[] = [MODEL_NAME]
  let modelsError: string | null = null

  try {
    const response = await fetch(OLLAMA_MODELS_URL, {
      method: "GET",
    })

    if (response.ok) {
      const data = await response.json().catch(() => null)
      const extractedModels: string[] = []

      if (Array.isArray(data)) {
        extractedModels.push(
          ...data
            .map((item) => {
              if (typeof item === "string") {
                return item
              }
              if (typeof item === "object" && item !== null) {
                const modelItem = item as Record<string, unknown>
                return (
                  (typeof modelItem.name === "string" && modelItem.name) ||
                  (typeof modelItem.model === "string" && modelItem.model) ||
                  undefined
                )
              }
              return undefined
            })
            .filter((value): value is string => typeof value === "string")
        )
      } else if (data && typeof data === "object") {
        const modelsCandidate = (data as Record<string, unknown>).models
        if (Array.isArray(modelsCandidate)) {
          extractedModels.push(
            ...modelsCandidate
              .map((item) => {
                if (typeof item === "string") {
                  return item
                }
                if (typeof item === "object" && item !== null) {
                  const modelItem = item as Record<string, unknown>
                  return (
                    (typeof modelItem.name === "string" && modelItem.name) ||
                    (typeof modelItem.model === "string" && modelItem.model) ||
                    undefined
                  )
                }
                return undefined
              })
              .filter((value): value is string => typeof value === "string")
          )
        }
      }

      if (extractedModels.length > 0) {
        models = extractedModels
      }
    } else {
      const errorText = await response.text().catch(() => "")
      modelsError =
        errorText || response.statusText ||
        "Ollama hat beim Abrufen der Modelle einen Fehler zurückgegeben."
    }
  } catch (error) {
    modelsError =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Verbinden mit Ollama."
  }

  return NextResponse.json({ models, error: modelsError })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const message = typeof body?.message === "string" ? body.message.trim() : ""
  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : MODEL_NAME

  if (!message) {
    return NextResponse.json(
      { error: "Keine Nachricht empfangen. Bitte sende eine gültige Anfrage." },
      { status: 400 }
    )
  }

  const payload = {
    model,
    messages: [{ role: "user", content: message }],
  }

  let response: Response
  try {
    response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unbekannter Fehler beim Verbinden mit Ollama."
    return NextResponse.json(
      { error: `Ollama-Verbindung fehlgeschlagen: ${message}` },
      { status: 502 }
    )
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    return NextResponse.json(
      { error: errorText || response.statusText || "Ollama hat einen Fehler zurückgegeben." },
      { status: response.status }
    )
  }

  const remoteBody = response.body
  if (!remoteBody) {
    const json = await response.json().catch(() => null)
    const fallbackText =
      typeof json?.text === "string"
        ? json.text
        : typeof json?.message === "string"
        ? json.message
        : "Keine Antwort erhalten."
    return NextResponse.json({ text: fallbackText })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = remoteBody.getReader()
      let buffer = ""
      let lastText = ""

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            const event = parseEventLine(line)
            if (!event) {
              continue
            }
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
          }
        }

        if (buffer.trim()) {
          const event = parseEventLine(buffer)
          if (event) {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
          }
        }
      } catch (error) {
        controller.error(error)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
