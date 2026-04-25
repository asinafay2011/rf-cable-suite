import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, Loader2, Trash2, Minimize2 } from 'lucide-react'

const MODEL_DEFAULT = 'claude-sonnet-4-6'

export default function FloatingAgent({
  accent = '#c97b3f',
  accentBright = '#e89357',
  label = '◆ AGENT',
  systemPrompt,
  starters = [],
  roleDescription = 'Domain expert.',
  topics = [],
  placeholder = 'Ask anything…',
  model = MODEL_DEFAULT,
  fontFamily = '"Bricolage Grotesque", system-ui, sans-serif',
  maxTokens = 2048,
  storageKey,
}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(() => {
    if (!storageKey) return []
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamText, open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages))
    } catch {}
  }, [messages, storageKey])

  const send = async (textOverride) => {
    const text = (textOverride ?? input).trim()
    if (!text || loading) return
    setInput('')
    setError(null)
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setLoading(true)
    setStreamText('')

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      })

      if (!res.ok || !res.body) {
        let detail = ''
        try { const j = await res.json(); detail = j?.error?.message || j?.error || '' } catch {}
        throw new Error(detail || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistant = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const chunk of events) {
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr) continue
            try {
              const ev = JSON.parse(jsonStr)
              if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
                assistant += ev.delta.text
                setStreamText(assistant)
              }
            } catch {}
          }
        }
      }

      setMessages([...next, { role: 'assistant', content: assistant }])
      setStreamText('')
    } catch (err) {
      setError(err.message || 'Request failed')
      setMessages(next)
      setStreamText('')
    } finally {
      setLoading(false)
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const clear = () => {
    setMessages([])
    setStreamText('')
    setError(null)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[90] flex items-center gap-2 px-4 py-3 rounded-full text-[#0a0d0f] shadow-2xl transition-colors border"
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          background: accent,
          borderColor: accentBright,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = accentBright)}
        onMouseLeave={(e) => (e.currentTarget.style.background = accent)}
        aria-label="Open chat"
      >
        <MessageSquare size={16} strokeWidth={2.5} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">Ask</span>
        {messages.length > 0 && (
          <span className="text-[10px] bg-[#0a0d0f]/30 px-1.5 py-0.5 rounded">{messages.length}</span>
        )}
      </button>
    )
  }

  return (
    <div
      className="fixed bottom-4 left-4 z-[90] flex flex-col w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-2rem)] bg-[#0a0d0f] border border-[#252e33] rounded-md shadow-2xl backdrop-blur-md overflow-hidden"
      style={{ fontFamily }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#252e33] bg-[#12171a]">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: '#5eead4', boxShadow: '0 0 8px #5eead4' }}
          />
          <span
            className="text-[11px] uppercase tracking-[0.2em] font-semibold"
            style={{ color: accent, fontFamily: '"JetBrains Mono", monospace' }}
          >
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clear}
              className="p-1.5 text-[#6b7479] hover:text-[#fbbf24] hover:bg-[#1f1610] rounded transition-colors"
              title="Clear conversation"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 text-[#6b7479] hover:text-[#fbbf24] hover:bg-[#1f1610] rounded transition-colors"
            title="Minimize"
          >
            <Minimize2 size={13} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-[13px] leading-relaxed"
      >
        {messages.length === 0 && !loading && (
          <div className="space-y-3">
            <div className="text-[#a7b0b6] text-[12px] leading-relaxed">
              {roleDescription}
              {topics.length > 0 && (
                <>
                  {' '}Ask about{' '}
                  {topics.map((t, i) => (
                    <span key={t}>
                      <span style={{ color: accent }}>{t}</span>
                      {i < topics.length - 2 ? ', ' : i === topics.length - 2 ? ', or ' : ''}
                    </span>
                  ))}
                  .
                </>
              )}
            </div>
            <div className="space-y-1.5">
              {starters.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left px-2.5 py-2 text-[12px] text-[#a7b0b6] bg-[#12171a] hover:bg-[#171d20] hover:text-[#fbbf24] border border-[#252e33] hover:border-[#384249] rounded transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <Message key={i} role={m.role} content={m.content} accent={accent} />
        ))}

        {streamText && <Message role="assistant" content={streamText} accent={accent} streaming />}

        {loading && !streamText && (
          <div className="flex items-center gap-2 text-[#6b7479] text-[12px]">
            <Loader2 size={12} className="animate-spin" />
            <span>thinking…</span>
          </div>
        )}

        {error && (
          <div className="text-[12px] text-[#f87171] bg-[#2a1010] border border-[#7a2020] rounded px-2.5 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-[#252e33] bg-[#0a0d0f] p-2 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder}
          className="flex-1 resize-none bg-[#12171a] border border-[#252e33] focus:outline-none rounded px-2.5 py-2 text-[13px] text-[#f0ebe2] placeholder:text-[#6b7479] max-h-[120px]"
          style={{ fontFamily: 'inherit' }}
          onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
          onBlur={(e) => (e.currentTarget.style.borderColor = '')}
          disabled={loading}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          className="shrink-0 px-3 py-2 disabled:bg-[#252e33] disabled:text-[#6b7479] disabled:cursor-not-allowed text-[#0a0d0f] rounded transition-colors flex items-center gap-1"
          style={{ background: loading || !input.trim() ? undefined : accent }}
          onMouseEnter={(e) => {
            if (!loading && input.trim()) e.currentTarget.style.background = accentBright
          }}
          onMouseLeave={(e) => {
            if (!loading && input.trim()) e.currentTarget.style.background = accent
          }}
          title="Send (Enter)"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  )
}

function Message({ role, content, streaming, accent }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] px-3 py-2 rounded text-[13px] leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-[#2a1d14] border border-[#3d2a1c] text-[#fbbf24]'
            : 'bg-[#12171a] border border-[#252e33] text-[#f0ebe2]'
        }`}
      >
        {content}
        {streaming && (
          <span
            className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse"
            style={{ background: accent }}
          />
        )}
      </div>
    </div>
  )
}
