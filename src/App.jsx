import { useEffect, useMemo, useRef, useState } from 'react'
import MessageList from './components/MessageList'
import MessageInput from './components/MessageInput'
import './App.css'

function App() {
  const [threads, setThreads] = useState(() => {
    const stored = localStorage.getItem('threads')
    return stored ? JSON.parse(stored) : { default: [] }
  })
  const [currentThreadId, setCurrentThreadId] = useState(() => {
    return localStorage.getItem('threadId') || ''
  })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem('apiEndpoint') || '')
  const messages = threads[currentThreadId] || []
  const controllerRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('threads', JSON.stringify(threads))
  }, [threads])

  useEffect(() => {
    localStorage.setItem('threadId', currentThreadId)
  }, [currentThreadId])

  useEffect(() => {
    if (endpoint) localStorage.setItem('apiEndpoint', endpoint)
  }, [endpoint])

  const hasMessages = useMemo(() => messages.length > 0, [messages])

  function updateThread(updater) {
    setThreads((prev) => {
      const next = { ...prev }
      next[currentThreadId] = updater(prev[currentThreadId] || [])
      return next
    })
  }

  async function handleSend(text) {
    setError('')
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() }
    updateThread((prev) => [...prev, userMsg])

    const assistantMsg = { role: 'agent', content: '', timestamp: new Date().toISOString(), streaming: true }
    updateThread((prev) => [...prev, assistantMsg])

    const body = {
      messages: [{ role: 'user', content: text }],
      runId: 'weatherAgent',
      maxRetries: 2,
      maxSteps: 5,
      temperature: 0.5,
      topP: 1,
      runtimeContext: {},
      threadId: currentThreadId,
      resourceId: 'weatherAgent',
    }

    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8,fr;q=0.7',
      'Connection': 'keep-alive',
      'Content-Type': 'application/json',
      'x-mastra-dev-playground': 'true',
    }

    const url = endpoint || '../api/weather' 

    setSending(true)
    const abortController = new AbortController()
    controllerRef.current = abortController
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: abortController.signal,
      })

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`)
      }

      // Handle streaming text response: parse evented tokens and only render assistant text
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let done = false
      let buffer = ''

      const appendAssistant = (delta) => {
        if (!delta) return
        updateThread((prev) => {
          const next = [...prev]
          const lastIndex = next.length - 1
          const last = next[lastIndex]
          if (last && last.role !== 'user') {
            next[lastIndex] = { ...last, content: (last.content || '') + delta }
          }
          return next
        })
      }

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          buffer += decoder.decode(value, { stream: true })
          // Process line-delimited events (SSE/NDJSON-like)
          let newlineIndex
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const rawLine = buffer.slice(0, newlineIndex)
            buffer = buffer.slice(newlineIndex + 1)
            const line = rawLine.trim()
            if (!line) continue

            // Match key:value lines like 0:"text", f:{...}, a:{...}
            const match = line.match(/^([a-z0-9]+):\s*(.*)$/i)
            if (match) {
              const key = match[1]
              const rest = match[2]
              if (key === '0') {
                // Assistant text token; try to JSON-parse the string for proper decoding
                let textPart = ''
                try {
                  textPart = JSON.parse(rest)
                } catch {
                  // Fallback: remove optional leading/trailing quotes
                  textPart = rest.replace(/^"|"$/g, '')
                }
                appendAssistant(textPart)
              } else {
                // Ignore non-text events (f: frame, 9: tool call, a: tool result, e/d: end/meta)
              }
            } else {
              // Fallback: if line has no prefix, treat it as raw assistant delta
              appendAssistant(line)
            }
          }
        }
      }

      
      if (buffer.trim()) {
        const tail = buffer.trim()
        const match = tail.match(/^([a-z0-9]+):\s*(.*)$/i)
        if (match && match[1] === '0') {
          let textPart = ''
          try {
            textPart = JSON.parse(match[2])
          } catch {
            textPart = match[2].replace(/^"|"$/g, '')
          }
          appendAssistant(textPart)
        } else if (!match) {
          appendAssistant(tail)
        }
      }

      // mark finished streaming
      updateThread((prev) => {
        const next = [...prev]
        const lastIndex = next.length - 1
        if (next[lastIndex]) {
          next[lastIndex] = { ...next[lastIndex], streaming: false, timestamp: new Date().toISOString() }
        }
        return next
      })
    } catch (e) {
      setError(e.message || 'Request failed')
      
      updateThread((prev) => {
        const next = [...prev]
        const lastIndex = next.length - 1
        if (next[lastIndex] && next[lastIndex].role !== 'user') {
          next[lastIndex] = { role: 'agent', content: `Error: ${e.message || 'Failed to fetch'}`, timestamp: new Date().toISOString() }
        } else {
          next.push({ role: 'agent', content: `Error: ${e.message || 'Failed to fetch'}`, timestamp: new Date().toISOString() })
        }
        return next
      })
    } finally {
      setSending(false)
      controllerRef.current = null
    }
  }

  function handleClear() {
    updateThread(() => [])
    setError('')
  }

  function handleNewThread() {
    const id = prompt('Enter new threadId:', currentThreadId || '')
    if (!id) return
    if (!threads[id]) {
      setThreads((prev) => ({ ...prev, [id]: [] }))
    }
    setCurrentThreadId(id)
  }

  function handleAbort() {
    if (controllerRef.current) controllerRef.current.abort()
  }

  return (
    <div className="chat-root">
      <header className="chat-header">
        <div className="title">Weather Agent</div>
        <div className="actions">
          <button onClick={handleClear} disabled={!hasMessages}>Clear</button>
          <button onClick={handleAbort} disabled={!sending}>Stop</button>
        </div>
      </header>
      <main className="chat-main">
        {hasMessages ? (
          <MessageList messages={messages} isStreaming={sending} />
        ) : (
          <div className="empty">Start the conversation to get the latest weather.</div>
        )}
        {error ? <div className="error">{error}</div> : null}
      </main>
      <footer className="chat-footer">
        <MessageInput onSend={handleSend} disabled={sending || !currentThreadId} />
      </footer>
    </div>
  )
}

export default App
