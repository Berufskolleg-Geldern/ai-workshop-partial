# Workshop: Mock-Demo → Full-Modus wiederherstellen

## Ziel
Dieser Workshop zeigt Schritt für Schritt, wie der aktuelle Demo-Mock in `components/chat-interface.tsx` wieder in den vollen Full-Modus zurückgeführt wird. Der Fokus liegt auf der echten Modell-Ladung, der API-Anfrage und dem Streaming der KI-Antwort.

## Ablauf

### Schritt 1: Aktuelle Demo-Struktur prüfen
- Öffne `components/chat-interface.tsx`.
- Suche die Mock-Antworten:
  - `getMockResponse(message)`
  - `splitResponseChunks(text)`
  - der Abschnitt in `sendMessage()` mit `responseText = getMockResponse(trimmed)`

#### Demo-Code erkennen
```ts
const responseText = getMockResponse(trimmed);
const chunks = splitResponseChunks(responseText);
```

- Das ist die Stelle, die später wieder auf echten API-Aufruf umgestellt wird.

### Schritt 2: Den Full-Modus wiederherstellen: Model-Loading
- Im Full-Modus lädt die App beim Start verfügbare Modelle von `/api/ollama`.
- Das passiert in einem `useEffect`.

#### Full-Modus-Code für Modell-Load
```ts
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
```

- Aufgabe: Vergleiche diesen Code mit dem aktuellen Mock-Code und stelle sicher, dass `modelsError`, `availableModels` und `selectedModel` wieder verwendet werden.

### Schritt 3: Echte API-Anfrage statt Mock-Antwort
- Ersetze in `sendMessage()` den Demo-Branch durch echten Netzwerkcode.
- Das ist die zentrale Änderung vom Full-Modus.

#### Aktueller Demo-Abschnitt, der ersetzt werden muss
Suche diesen Block in `sendMessage()`:

```ts
const responseText = getMockResponse(trimmed);
const chunks = splitResponseChunks(responseText);
let renderedText = "";

chunks.forEach((chunk, index) => {
  const timeout = setTimeout(() => {
    renderedText = renderedText ? `${renderedText} ${chunk}` : chunk;
    updateAssistant({
      content: renderedText,
      thinking: index < chunks.length - 1 ? "Die KI schreibt..." : "",
    });

    if (index === chunks.length - 1) {
      activeAssistantIdRef.current = null;
      setIsTyping(false);
    }
  }, 300 + index * 220);

  typingTimeoutsRef.current.push(timeout);
});
```

- Diese gesamte Logik wird im Full-Modus durch einen echten `fetch`-Aufruf ersetzt.
- Entferne außerdem die lokalen Timer/`typingTimeoutsRef`-abhängigen Schritte in `sendMessage()`.

#### Full-Modus-Code für Anfrage
```ts
abortControllerRef.current?.abort();
const controller = new AbortController();
abortControllerRef.current = controller;

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
```

#### Was genau ersetzt wird
1. Entferne die Zeilen:
   - `const responseText = getMockResponse(trimmed);`
   - `const chunks = splitResponseChunks(responseText);`
   - den gesamten `chunks.forEach(...)`-Block
2. Füge stattdessen die `AbortController`-Initialisierung ein.
3. Füge den `await fetch(...)`-Block ein.

- Wichtig: Die Abbruch-Logik (`AbortController`) ist Teil des echten Full-Modus.

### Schritt 4: Streaming-Antwort lesen
- Im Full-Modus kommt die Antwort nicht als fertiger Text, sondern als Datenstrom.
- Die App muss den Stream lesen, den Inhalt zusammensetzen und den Assistenten schrittweise aktualisieren.

#### Was im Code passieren muss
1. `response.body.getReader()` aufrufen.
2. Mit `TextDecoder` den Datenstrom in Text umwandeln.
3. Den Text in Zeilen aufteilen und nur vollständige JSON-Events verarbeiten.
4. Für jede Zeile das Event parsen und entsprechend `thinking` oder `response` aktualisieren.
5. Am Ende den letzten Puffer verarbeiten und bei leerer Antwort eine Fallback-Nachricht setzen.

#### Genauer Austausch: Hier muss ersetzt werden
- Suche in `sendMessage()` nach dem Demo-Block:

```ts
const responseText = getMockResponse(trimmed);
const chunks = splitResponseChunks(responseText);
let renderedText = "";

chunks.forEach((chunk, index) => {
  const timeout = setTimeout(() => {
    renderedText = renderedText ? `${renderedText} ${chunk}` : chunk;
    updateAssistant({
      content: renderedText,
      thinking: index < chunks.length - 1 ? "Die KI schreibt..." : "",
    });

    if (index === chunks.length - 1) {
      activeAssistantIdRef.current = null;
      setIsTyping(false);
    }
  }, 300 + index * 220);

  typingTimeoutsRef.current.push(timeout);
});
```

- Ersetze diesen gesamten Block durch den folgenden Full-Modus-Code:

```ts
if (!response.body) {
  updateAssistant({ content: "Fehler: Keine Antwort vom Server." });
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
      // ignoriere unvollständige oder fehlerhafte Zeilen
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
```

#### Hier genau endet der Austausch
- Entferne den Demo-Block inklusive `setTimeout(...)` und `typingTimeoutsRef.current.push(timeout)`.
- Belasse das Update der Nachrichtenzustände (`updateAssistant(...)`) unverändert, aber auf echten `responseText`-Stream umgestellt.

#### Warum das so funktioniert
- `buffer` sammelt eingehende Daten und sorgt dafür, dass nur ganze Zeilen geparst werden.
- `lines.pop()` lässt die letzte unvollständige Zeile für den nächsten Lesezyklus im Puffer zurück.
- `mergeText()` sorgt dafür, dass neue Textteile korrekt an vorhandene Antworten angehängt werden.
- `thinking` kann parallel zum eigentlichen Text in den Fortschritt eingeblendet werden.

#### Optionaler Vergleich mit Demo-Code
- Im Demo-Modus wird hier stattdessen `chunks.forEach(...)` verwendet.
- Der Full-Modus braucht keinen lokalen Timer mehr, sondern verarbeitet echte Streaming-Ereignisse.

### Schritt 5: Abbruch und Fehlerbehandlung
- Stelle sicher, dass `handleStop()` die echte Abort-Logik verwendet.

#### Full-Modus-Abbruch
```ts
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
```

- Aufgabe: Vergleiche das mit der Demo-Variante, die lokale Timer nutzt.
- Das echte Full-Modus-Verhalten benötigt die `AbortController`-Logik.

### Schritt 6: Testen und vergleichen
- Lade die App neu und teste:
  1. Modell-Liste lädt beim Start.
  2. Eine Anfrage wird an `/api/ollama` gesendet.
  3. Die Antwort kommt schrittweise über den Stream.
  4. Der Stopp-Button bricht die Anfrage ab.
- Vergleiche den aktuellen Demo-Code mit dem Full-Modus-Code aus der Git-Diff-Vorlage.

## Praktische Übung
- Arbeite in drei Teams:
  1. Ein Team liest die Demo-Mock-Funktionen aus.
  2. Ein Team restauriert den Modell-Load.
  3. Ein Team setzt den echten `POST /api/ollama`-Flow und das Streaming zurück.

- Am Ende zeigt jedes Team ihren wiederhergestellten Full-Modus-Teil.

## Fazit
- Dieser Workshop ist kein reiner Demo-Guide mehr: er führt die Gruppe gezielt zurück zum echten Full-Modus.
- `WORKSHOP.md` bleibt Schritt-für-Schritt und codezentriert.
- Der wichtigste Unterschied: Mock-Antworten vs. echte API-Streams mit Modell-Ladung.
