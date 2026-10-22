import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import React, { useEffect, useRef, useState } from 'react'
import { useChatHistory, useSendMessage } from '@/api/queries'
import { ChatMessage } from '@/types'
import {
  displayToolName,
  getGroundingChip,
  getToolName,
  mapErrorCode,
  mapToolStatus,
} from '@/utils/contract'

function newId() {
  return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function ChatPanel() {
  const conversationId = 'conv_default'
  const { data, isLoading, isError, refetch } = useChatHistory(conversationId)
  const send = useSendMessage(conversationId)
  const [input, setInput] = useState('')
  const [clientId, setClientId] = useState(newId())
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data, send.isPending])

  const messages = data?.messages ?? []

  const handleSend = async () => {
    const text = input.trim()
    if (!text || send.isPending) return
    setInput('')
    try {
      await send.mutateAsync({ message: text, client_message_id: clientId })
      setClientId(newId())
    } catch (e: any) {
      // keep input? per rules we just show error via status; easier to restore
      setInput(text)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6">JARVIS</Typography>
        <Typography variant="caption" color="text.secondary">
          ● terhubung
        </Typography>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {isLoading && <Typography color="text.secondary">Memuat riwayat...</Typography>}
        {isError && (
          <Box>
            <Typography color="error">Riwayat tidak dapat dimuat</Typography>
            <Button size="small" onClick={() => refetch()}>
              Muat ulang
            </Button>
          </Box>
        )}
        {!isLoading && messages.length === 0 && (
          <Stack spacing={1}>
            <Typography color="text.secondary">Mulai percakapan</Typography>
            {['Apakah ada orang di depan pintu dalam 15 menit terakhir?', 'Tampilkan status sistem', 'Ada event terbaru?'].map(
              (q) => (
                <Chip key={q} label={q} onClick={() => setInput(q)} clickable size="small" />
              ),
            )}
          </Stack>
        )}
        <Stack spacing={2}>
          {messages
            .filter((m: ChatMessage) => {
              if (!send.data) return true
              if (send.data.message_id && m.id === send.data.message_id) return false
              return !(m.role === 'assistant' && m.content === send.data.reply)
            })
            .map((m: ChatMessage) => {
            if (m.role === 'system') return null
            if (m.role === 'tool') {
              return (
                <Box key={m.id} sx={{ alignSelf: 'flex-start', ml: 1 }}>
                  <Chip label={`· ${displayToolName(m.tool_name)}`} size="small" variant="outlined" />
                </Box>
              )
            }
            if (m.role === 'user') {
              return (
                <Paper key={m.id} sx={{ alignSelf: 'flex-end', p: 1.5, maxWidth: '85%', bgcolor: 'rgba(79,155,255,0.15)' }}>
                  <Typography variant="body2">{m.content}</Typography>
                </Paper>
              )
            }
            // assistant - we don't have full response in history; render content
            return (
              <Paper key={m.id} sx={{ alignSelf: 'flex-start', p: 1.5, maxWidth: '85%' }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {m.content}
                </Typography>
              </Paper>
            )
          })}
          {send.isPending && (
            <Paper sx={{ alignSelf: 'flex-start', p: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                Mengetik...
              </Typography>
            </Paper>
          )}
          {send.isError && (() => {
            const info = mapErrorCode((send.error as any)?.code)
            return (
              <Paper sx={{ alignSelf: 'flex-start', p: 1.5, border: '1px solid rgba(248,81,73,0.6)' }}>
                <Typography variant="body2" color="error">
                  {(send.error as any)?.message || 'Terjadi kesalahan'}
                </Typography>
                {info.retryable ? (
                  <Button size="small" sx={{ mt: 0.5 }} onClick={() => send.mutate({ message: input || '', client_message_id: clientId })}>
                    Coba lagi
                  </Button>
                ) : (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Sistem pemantauan kamera tetap berjalan normal.
                  </Typography>
                )}
              </Paper>
            )
          })()}
          {send.data && (
            <Box sx={{ alignSelf: 'flex-start', maxWidth: '85%', width: '100%' }}>
              <Paper sx={{ p: 1.5, mb: 1 }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {send.data.reply}
                </Typography>
                {(() => {
                  const chip = getGroundingChip(send.data.meta)
                  if (!chip) return null
                  return (
                    <Chip label={chip.label} size="small" color={chip.color} sx={{ mt: 1 }} />
                  )
                })()}
              </Paper>
              {(send.data.tools_executed || []).map((te, idx) => {
                const tname = getToolName(te)
                const st = mapToolStatus(te.status)
                return (
                  <Paper key={idx} sx={{ p: 1.5, mb: 1, border: '1px solid rgba(255,255,255,0.12)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2">{displayToolName(tname)}</Typography>
                      <Chip label={st.label} size="small" color={st.color} />
                      {te.duration_ms !== undefined && (
                        <Typography variant="caption" color="text.secondary">
                          {te.duration_ms} ms
                        </Typography>
                      )}
                    </Box>
                    {te.parameters && Object.keys(te.parameters).length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Parameter
                        </Typography>
                        <Box component="pre" sx={{ m: 0, fontSize: 12, overflowX: 'auto' }}>
                          {JSON.stringify(te.parameters, null, 2)}
                        </Box>
                      </Box>
                    )}
                    {te.result_summary && (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        {te.result_summary}
                      </Typography>
                    )}
                    {te.error && (
                      <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                        {te.error}
                      </Typography>
                    )}
                  </Paper>
                )
              })}
            </Box>
          )}
        </Stack>
        <div ref={bottomRef} />
      </Box>
      <Divider />
      <Box sx={{ p: 2, display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Ketik pertanyaan…"
          value={input}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          inputProps={{ maxLength: 2000 }}
        />
        <IconButton color="primary" onClick={handleSend} disabled={!input.trim() || send.isPending}>
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  )
}
