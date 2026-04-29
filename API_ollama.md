# API-Dokumentation: `/api/ollama`

Diese Dokumentation beschreibt die Next.js-API-Route `/api/ollama`, die in `app/api/ollama/route.ts` implementiert ist.

## Übersicht

Die API stellt zwei Methoden bereit:

- `GET /api/ollama`
  - Liefert verfügbare Ollama-Modelle zurück.
- `POST /api/ollama`
  - Sendet eine Chat-Anfrage an den lokalen Ollama-Server und gibt gestreamte Antworten zurück.

Der Service kommuniziert intern mit einem Ollama-Backend unter:

- Modelle: `http://127.0.0.1:11434/api/tags`
- Chat: `http://127.0.0.1:11434/api/chat`

Standardmodell: `gemma4:e2b`

---

## GET /api/ollama

### Beschreibung

Ruft verfügbare Ollama-Modelle vom lokalen Ollama-Server ab. Falls der Abruf fehlschlägt, bleibt das Standardmodell `gemma4:e2b` erhalten.

### Antwort

- `200 OK`

Beispiel:

```json
{
  "models": ["gemma4:e2b", "anderes-model"],
  "error": null
}
```

Falls ein Fehler auftritt, enthält das Feld `error` eine Fehlermeldung und `models` kann weiterhin das Standardmodell enthalten:

```json
{
  "models": ["gemma4:e2b"],
  "error": "Ollama hat beim Abrufen der Modelle einen Fehler zurückgegeben."
}
```

### Felder

- `models`: `string[]` – Liste der erkannten Modellnamen.
- `error`: `string | null` – Fehlernachricht, falls ein Problem beim Abruf aufgetreten ist.

---

## POST /api/ollama

### Beschreibung

Sendet eine Chat-Anfrage an Ollama und leitet den Response-Stream als Text-Stream weiter. Die API erwartet ein JSON-Objekt mit einer `message` und optional einem `model`.

### Anfrage

- Content-Type: `application/json`

Beispiel:

```json
{
  "message": "Hallo Ollama, erzähle mir etwas über KI.",
  "model": "gemma4:e2b"
}
```

### Validierung

- `message` muss eine nicht-leere Zeichenfolge sein.
- `model` ist optional. Wird kein gültiges Modell übergeben, wird das Standardmodell `gemma4:e2b` verwendet.

### Fehler

- `400 Bad Request`
  - Wenn `message` fehlt oder leer ist.

Beispiel:

```json
{
  "error": "Keine Nachricht empfangen. Bitte sende eine gültige Anfrage."
}
```

- `502 Bad Gateway`
  - Wenn die Verbindung zu Ollama fehlschlägt.

Beispiel:

```json
{
  "error": "Ollama-Verbindung fehlgeschlagen: <Fehlermeldung>"
}
```

- Weiterer Fehlerstatus, wenn der Ollama-Server selbst einen Fehler zurückliefert.

### Antwort

Die Route gibt einen gestreamten `text/plain`-Antwortkörper zurück. Jeder Stream-Event-Eintrag ist eine JSON-Zeile mit einem Objekt vom Typ `StreamEvent`:

```json
{ "type": "thinking", "text": "..." }
{ "type": "response", "text": "..." }
```

### Stream-Event-Felder

- `type`: `"thinking" | "response"`
  - `thinking`: Zwischentext, der den generativen Ablauf beschreibt.
  - `response`: Tatsächlich generierter Text aus Ollama.
- `text`: `string` – Der erkannte Textinhalt.

### Stream-Verarbeitung

Die API verarbeitet das rohe SSE-ähnliche Streaming-Format von Ollama und extrahiert aus jedem eingehenden Datenblock:

- `message.thinking`
- `message.content`
- `text`
- `response`
- `choices[].text`
- `choices[].message.content`

Dann wird jeder erkannte Event-Eintrag in eine eigene JSON-Zeile umgewandelt.

### Beispiel-Antwort (Text-Stream)

```text
{"type":"thinking","text":"Thinking..."}
{"type":"response","text":"Hallo! Ich bin ein KI-Modell."}
```

---

## Hinweise zur Implementierung

- Die API verwendet `NextResponse.json()` für JSON-Antworten bei `GET` und Fehlerfällen.
- Der `POST`-Handler erstellt einen `ReadableStream`, liest den Response-Body von Ollama zeilenweise und transformiert ihn in ein JSON-Lines-basiertes Streaming-Format.
- Die Route erwartet einen laufenden Ollama-Server unter `127.0.0.1:11434`.

---

## Dateipfad

- `app/api/ollama/route.ts`

---

## Beispiel-Clientnutzung

### Modelle abrufen

```js
const res = await fetch('/api/ollama')
const data = await res.json()
console.log(data.models)
```

### Chat-Anfrage senden

```js
const res = await fetch('/api/ollama', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hallo Ollama!', model: 'gemma4:e2b' }),
})

const reader = res.body.getReader()
const decoder = new TextDecoder()
let result = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  result += decoder.decode(value, { stream: true })
}

console.log(result)
```
