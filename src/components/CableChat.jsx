import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Loader2, Trash2, Minimize2 } from 'lucide-react'

const SYSTEM_PROMPT = `You are a senior cable manufacturing engineer embedded in the High-Speed Cable Manufacturing curriculum (CABLE.LAB).

Domain focus:
- Coaxial cable construction (RG-58, RG-174, RG-213, LMR-400, Heliax, semi-rigid, phase-stable)
- Twisted-pair design: pair lay (8–17 mm typical), intra-pair skew, differential impedance (90 Ω / 100 Ω)
- 4-pair bundle geometry, cross-spline / X-filler, NEXT, FEXT, ANEXT
- Shielding: foil + braid, optical coverage K = (2F − F²)·100% per SCTE 51, transfer impedance Zt
- Z₀ formula: 138 / √εᵣ · log10(D/d) for coax; differential pair from Wadell
- Manufacturing flow: conductor draw → bunch → insulation extrusion → twisting → cabling → shielding → jacketing → testing
- Materials: Cu (1.68e-8 Ω·m), TC, SPC, NPC, PTFE/FEP/PFA/PE, foamed PE, ePTFE
- Test: TDR, return loss, IL, eye diagram, BER, hipot
- AWG ↔ mm conversions; Glenair Series 963 reference

Style:
- Concise, technically precise. Default to 2–4 short paragraphs unless asked for depth.
- Show formulas in ASCII (Z = 138/√εᵣ·log(D/d)). Use markdown sparingly.
- When asked "why", give the physics intuition before the formula.
- If the user references a specific tool/tab in the app (Z₀ Calc, TDR Sim, Braid, Atten, Eye, Cost, Lay Design), tie the answer to what that tab computes.
- No memory disclaimer — answer with what you know.
- If outside cable/RF/manufacturing scope, say so briefly and redirect.`

const STARTERS = [
  'Why does pair lay length matter for NEXT?',
  'Walk me through LMR-400 manufacturing',
  'How does braid coverage affect Zt?',
  'Difference between Z₀ and impedance matching?',
]

const MODEL = 'claude-sonnet-4-6'

export default function CableChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
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
          model: MODEL,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
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
        className="fixed bottom-4 left-4 z-[90] flex items-center gap-2 px-4 py-3 rounded-full bg-[#c97b3f] hover:bg-[#e89357] text-[#0a0d0f] shadow-2xl transition-colors border border-[#e89357]"
        style={{ fontFamily: '"JetBrains Mono", monospace' }}
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
      style={{ fontFamily: '"Bricolage Grotesque", system-ui, sans-serif' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#252e33] bg-[#12171a]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#5eead4] shadow-[0_0_8px_#5eead4]" />
          <span
            className="text-[11px] uppercase tracking-[0.2em] text-[#c97b3f] font-semibold"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            ◆ CABLE.LAB · AGENT
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

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-[13px] leading-relaxed"
      >
        {messages.length === 0 && !loading && (
          <div className="space-y-3">
            <div className="text-[#a7b0b6] text-[12px] leading-relaxed">
              Senior cable manufacturing engineer. Ask about{' '}
              <span className="text-[#c97b3f]">Z₀ formulas</span>,{' '}
              <span className="text-[#c97b3f]">braid coverage</span>,{' '}
              <span className="text-[#c97b3f]">pair lay</span>,{' '}
              <span className="text-[#c97b3f]">TDR</span>, manufacturing flow, or any tab in this app.
            </div>
            <div className="space-y-1.5">
              {STARTERS.map((s) => (
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
          <Message key={i} role={m.role} content={m.content} />
        ))}

        {streamText && <Message role="assistant" content={streamText} streaming />}

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

      {/* Input */}
      <div className="border-t border-[#252e33] bg-[#0a0d0f] p-2 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask about cable design, manufacturing, formulas…"
          className="flex-1 resize-none bg-[#12171a] border border-[#252e33] focus:border-[#c97b3f] focus:outline-none rounded px-2.5 py-2 text-[13px] text-[#f0ebe2] placeholder:text-[#6b7479] max-h-[120px]"
          style={{ fontFamily: 'inherit' }}
          disabled={loading}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          className="shrink-0 px-3 py-2 bg-[#c97b3f] hover:bg-[#e89357] disabled:bg-[#252e33] disabled:text-[#6b7479] disabled:cursor-not-allowed text-[#0a0d0f] rounded transition-colors flex items-center gap-1"
          title="Send (Enter)"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  )
}

function Message({ role, content, streaming }) {
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
        {streaming && <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-[#c97b3f] animate-pulse" />}
      </div>
    </div>
  )
}
