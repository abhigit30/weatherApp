import { useState } from 'react'

export default function MessageInput({ onSend, disabled }) {
  const [value, setValue] = useState('')

  function handleSend() {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="input-wrap">
      <textarea
        className="input"
        placeholder="Type your message..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={1}
      />
      <button className="send" onClick={handleSend} disabled={disabled || !value.trim()}>
        Send
      </button>
    </div>
  )
}


