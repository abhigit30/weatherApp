import { useEffect, useRef } from 'react'

function formatTime(date) {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageList({ messages, isStreaming }) {
  const containerRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages])

  return (
    <div ref={containerRef} className="chat-scroll">
      {messages.map((m, idx) => (
        <div key={idx} className={m.role === 'user' ? 'row right' : 'row left'}>
          <div className={m.role === 'user' ? 'bubble user' : 'bubble agent'}>
            <div className="content">{m.content}</div>
            <div className="meta">
              <span className="timestamp">{formatTime(m.timestamp)}</span>
            </div>
          </div>
        </div>
      ))}
      {isStreaming ? (
        <div className="row left">
          <div className="bubble agent">
            <div className="typing">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  )
}


