import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import TuneIcon from '@mui/icons-material/Tune'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useChatHistory, useSendMessage } from '@/api/queries'
import { ChatMessage } from '@/types'
import {
  displayToolName,
  getGroundingChip,
  getToolName,
  mapErrorCode,
  mapToolStatus,
} from '@/utils/contract'
import {
  createSpeechRecognizer,
  getUnlockedAudioContext,
  loadVoiceSettings,
  playRexizoChime,
  speakRexizo,
  stopRexizoSpeech,
  VoiceSettings,
} from '@/utils/speech'
import { VoiceSettingsDialog } from './VoiceSettingsDialog'

function newId() {
  return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function ChatPanel() {
  const conversationId = 'conv_default'
  const { data, isLoading, isError, refetch } = useChatHistory(conversationId)
  const send = useSendMessage(conversationId)
  const [input, setInput] = useState('')
  const [clientId, setClientId] = useState(newId())
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(loadVoiceSettings())
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [lastFailedText, setLastFailedText] = useState('')
  const recognizerRef = useRef<ReturnType<typeof createSpeechRecognizer> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data, send.isPending])

  const lastSpokenIdRef = useRef<string | null>(null)

  const handleSendWithText = useCallback(
    async (textToSend: string) => {
      const text = textToSend.trim()
      if (!text || send.isPending) return
      getUnlockedAudioContext()
      setInput('')
      setLastFailedText(text)
      stopRexizoSpeech()
      setSpeakingId(null)
      try {
        const res = await send.mutateAsync({ message: text, client_message_id: clientId })
        setClientId(newId())
        setLastFailedText('')
        if (res?.reply && voiceEnabled) {
          const msgId = res.message_id || res.reply
          lastSpokenIdRef.current = msgId
          playRexizoChime(voiceSettings.persona)
          setSpeakingId(msgId)
          speakRexizo(res.reply, voiceSettings, () => {
            setSpeakingId(null)
            if (voiceSettings.continuousMode) {
              setTimeout(() => {
                playRexizoChime(voiceSettings.persona)
                setIsListening(true)
                recognizerRef.current?.start()
              }, 400)
            }
          })
        }
      } catch {
        setInput(text)
      }
    },
    [clientId, send, voiceEnabled, voiceSettings]
  )

  useEffect(() => {
    recognizerRef.current = createSpeechRecognizer(
      (transcript) => {
        setIsListening(false)
        setVoiceError(null)
        const cleaned = transcript.trim()
        if (cleaned) {
          setInput(cleaned)
          setTimeout(() => {
            handleSendWithText(cleaned)
          }, 150)
        }
      },
      () => {
        setIsListening(false)
      },
      (err: string) => {
        setIsListening(false)
        if (err === 'not-allowed') {
          setVoiceError('Izin mikrofon diblokir. Klik ikon gembok/setelan di address bar dan izinkan Mikrofon.')
        } else if (err === 'audio-capture') {
          setVoiceError('Perangkat mikrofon tidak ditemukan di sistem Arch Linux.')
        } else if (err === 'no-speech') {
          setVoiceError('Suara tidak terdengar jelas. Silakan bicara lebih dekat ke mikrofon.')
        } else if (err !== 'aborted') {
          setVoiceError(`Gagal memproses input suara (${err}). Pastikan mikrofon aktif.`)
        }
      }
    )
    return () => {
      recognizerRef.current?.stop()
      stopRexizoSpeech()
    }
  }, [voiceSettings.continuousMode, handleSendWithText])

  const messages = data?.messages ?? []

  const handleSend = () => handleSendWithText(input)

  const handleToggleMic = () => {
    if (!recognizerRef.current?.isSupported) {
      alert('Fitur pengenalan suara (Speech Recognition) tidak didukung pada browser ini.')
      return
    }
    if (isListening) {
      recognizerRef.current.stop()
      setIsListening(false)
    } else {
      playRexizoChime(voiceSettings.persona)
      setIsListening(true)
      recognizerRef.current.start()
    }
  }

  const handleToggleVoice = () => {
    if (!voiceEnabled) {
      playRexizoChime(voiceSettings.persona)
      setVoiceEnabled(true)
    } else {
      stopRexizoSpeech()
      setSpeakingId(null)
      setVoiceEnabled(false)
    }
  }

  const handleSpeakMessage = (id: string, text: string) => {
    if (speakingId === id) {
      stopRexizoSpeech()
      setSpeakingId(null)
    } else {
      stopRexizoSpeech()
      playRexizoChime(voiceSettings.persona)
      setSpeakingId(id)
      speakRexizo(text, voiceSettings, () => setSpeakingId(null))
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#ffffff' }}>
      {/* Voice Settings Dialog */}
      <VoiceSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSettingsChanged={(updated) => setVoiceSettings(updated)}
      />

      {/* Header */}
      <Box
        sx={{
          height: 52,
          px: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body1" sx={{ fontWeight: 600, color: '#0d0d0d', fontSize: '15px' }}>
            {voiceSettings.persona === 'nozomi' ? '🌸 Nozomi' : 'R.E.X.I.Z.O.'}
          </Typography>
          <Chip
            label={
              voiceSettings.persona === 'nozomi'
                ? 'Sensei Mode'
                : voiceSettings.persona === 'rexizo'
                  ? 'Butler Mode'
                  : 'Kustom'
            }
            size="small"
            onClick={() => setSettingsOpen(true)}
            sx={{
              height: '18px',
              fontSize: '10px',
              bgcolor: voiceSettings.persona === 'nozomi' ? '#ffebee' : '#f4f4f4',
              color: voiceSettings.persona === 'nozomi' ? '#c2185b' : '#5d5d5d',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          />
          {voiceSettings.continuousMode && (
            <Chip
              label="Hands-Free"
              size="small"
              sx={{
                height: '18px',
                fontSize: '10px',
                bgcolor: '#e8f5e9',
                color: '#2e7d32',
                borderRadius: '4px',
              }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="Pengaturan Suara & Karakter (Nozomi / Butler / Hands-Free)">
            <IconButton
              size="small"
              onClick={() => setSettingsOpen(true)}
              sx={{
                p: '4px',
                borderRadius: '6px',
                color: '#5d5d5d',
                '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.05)' },
              }}
            >
              <TuneIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={voiceEnabled ? 'Matikan suara respons' : 'Aktifkan suara respons (TTS)'}>
            <IconButton
              size="small"
              onClick={handleToggleVoice}
              sx={{
                p: '4px',
                borderRadius: '6px',
                bgcolor: voiceEnabled ? '#0d0d0d' : 'transparent',
                color: voiceEnabled ? '#ffffff' : '#5d5d5d',
                '&:hover': {
                  bgcolor: voiceEnabled ? '#000000' : 'rgba(0, 0, 0, 0.05)',
                },
              }}
            >
              {voiceEnabled ? <VolumeUpIcon sx={{ fontSize: 17 }} /> : <VolumeOffIcon sx={{ fontSize: 17 }} />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Message Feed */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        {isLoading && (
          <Typography sx={{ color: '#8f8f8f', fontSize: '14px', textAlign: 'center', my: 2 }}>
            Memuat riwayat...
          </Typography>
        )}

        {isError && (
          <Box
            sx={{
              p: 2,
              mb: 2,
              borderRadius: '10px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              bgcolor: '#f9f9f9',
            }}
          >
            <Typography sx={{ color: '#0d0d0d', fontSize: '14px', fontWeight: 500, mb: 1 }}>
              Riwayat tidak dapat dimuat
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => refetch()}
              sx={{ borderColor: 'rgba(0, 0, 0, 0.15)', color: '#0d0d0d' }}
            >
              Muat ulang
            </Button>
          </Box>
        )}

        {!isLoading && messages.length === 0 && (
          <Stack spacing={1.5} sx={{ my: 3, maxWidth: 390, mx: 'auto', textAlign: 'center' }}>
            <Typography sx={{ color: '#0d0d0d', fontWeight: 600, fontSize: '16px' }}>
              {voiceSettings.persona === 'nozomi' ? '🌸 Halo Sensei! Ada yang bisa kubantu?' : 'At your service, Sir.'}
            </Typography>
            <Typography sx={{ color: '#8f8f8f', fontSize: '13px', mb: 1 }}>
              Bisa diajak ngobrol santai layaknya manusia atau diperintah mengontrol aplikasi & sistem Arch Linux:
            </Typography>
            {[
              voiceSettings.persona === 'nozomi' ? '🌸 Halo Nozomi! Sedang apa kamu sekarang?' : 'Halo Rexizo, apa kabar hari ini?',
              'Buka aplikasi Firefox dan Discord',
              'Naikkan volume suara 10%',
              'Ambil screenshot layar sekarang',
              'Laporkan status diagnostik sistem saat ini',
            ].map((q) => (
              <Box
                key={q}
                onClick={() => setInput(q)}
                sx={{
                  p: 1.25,
                  borderRadius: '10px',
                  border: '1px solid rgba(0, 0, 0, 0.1)',
                  bgcolor: '#f9f9f9',
                  color: '#0d0d0d',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease',
                  '&:hover': {
                    bgcolor: 'rgba(0, 0, 0, 0.05)',
                  },
                }}
              >
                {q}
              </Box>
            ))}
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
                  <Box key={m.id} sx={{ alignSelf: 'flex-start', ml: 0.5 }}>
                    <Chip
                      label={`· ${displayToolName(m.tool_name)}`}
                      size="small"
                      variant="outlined"
                      sx={{
                        borderRadius: 0,
                        fontSize: '11px',
                        height: '20px',
                        borderColor: 'rgba(0, 0, 0, 0.1)',
                        color: '#5d5d5d',
                        bgcolor: '#f9f9f9',
                      }}
                    />
                  </Box>
                )
              }
              if (m.role === 'user') {
                return (
                  <Paper
                    key={m.id}
                    sx={{
                      alignSelf: 'flex-end',
                      p: 1.5,
                      maxWidth: '85%',
                      bgcolor: '#f4f4f4',
                      color: '#0d0d0d',
                      borderRadius: '10px',
                      border: '1px solid rgba(0, 0, 0, 0.06)',
                    }}
                  >
                    <Typography variant="body2" sx={{ fontSize: '14px', lineHeight: 1.5 }}>
                      {m.content}
                    </Typography>
                  </Paper>
                )
              }
              // Assistant message
              return (
                <Paper
                  key={m.id}
                  sx={{
                    alignSelf: 'flex-start',
                    p: 1.5,
                    maxWidth: '90%',
                    bgcolor: '#ffffff',
                    border: '1px solid rgba(0, 0, 0, 0.08)',
                    borderRadius: '10px',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{ whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: 1.5, color: '#0d0d0d' }}
                    >
                      {m.content}
                    </Typography>
                    <Tooltip title="Dengarkan suara Rexizo">
                      <IconButton
                        size="small"
                        onClick={() => handleSpeakMessage(m.id, m.content)}
                        sx={{
                          p: '3px',
                          color: speakingId === m.id ? '#0d0d0d' : '#8f8f8f',
                          opacity: speakingId === m.id ? 1 : 0.6,
                          '&:hover': { opacity: 1 },
                        }}
                      >
                        <VolumeUpIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Paper>
              )
            })}

          {send.isPending && (
            <Paper
              sx={{
                alignSelf: 'flex-start',
                p: 1.25,
                bgcolor: '#f9f9f9',
                borderRadius: '10px',
                border: '1px solid rgba(0, 0, 0, 0.08)',
              }}
            >
              <Typography variant="caption" sx={{ color: '#8f8f8f', fontSize: '13px' }}>
                Rexizo sedang memproses data...
              </Typography>
            </Paper>
          )}

          {send.isError && (() => {
            const info = mapErrorCode((send.error as any)?.code)
            return (
              <Paper
                sx={{
                  alignSelf: 'flex-start',
                  p: 1.5,
                  borderRadius: '10px',
                  border: '1px solid rgba(0, 0, 0, 0.15)',
                  bgcolor: '#f9f9f9',
                }}
              >
                <Typography variant="body2" sx={{ color: '#0d0d0d', fontWeight: 500 }}>
                  {(send.error as any)?.message || 'Terjadi kesalahan'}
                </Typography>
                {info.retryable ? (
                  <Button
                    size="small"
                    variant="outlined"
                    sx={{ mt: 1, borderColor: 'rgba(0, 0, 0, 0.15)', color: '#0d0d0d' }}
                    onClick={() => handleSendWithText(input || lastFailedText)}
                  >
                    Coba lagi
                  </Button>
                ) : (
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#8f8f8f' }}>
                    Sistem pemantauan kamera tetap berjalan normal.
                  </Typography>
                )}
              </Paper>
            )
          })()}

          {send.data && (
            <Box sx={{ alignSelf: 'flex-start', maxWidth: '90%', width: '100%' }}>
              <Paper
                sx={{
                  p: 1.5,
                  mb: 1,
                  borderRadius: '10px',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  bgcolor: '#ffffff',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                  <Typography
                    variant="body2"
                    sx={{ whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: 1.5, color: '#0d0d0d' }}
                  >
                    {send.data.reply}
                  </Typography>
                  <Tooltip title="Dengarkan suara Rexizo">
                    <IconButton
                      size="small"
                      onClick={() => handleSpeakMessage(send.data.message_id || 'latest', send.data.reply)}
                      sx={{
                        p: '3px',
                        color: speakingId === (send.data.message_id || 'latest') ? '#0d0d0d' : '#8f8f8f',
                        opacity: speakingId === (send.data.message_id || 'latest') ? 1 : 0.6,
                        '&:hover': { opacity: 1 },
                      }}
                    >
                      <VolumeUpIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                {(() => {
                  const chip = getGroundingChip(send.data.meta)
                  if (!chip) return null
                  return (
                    <Chip
                      label={chip.label}
                      size="small"
                      sx={{
                        mt: 1,
                        borderRadius: 0,
                        fontSize: '11px',
                        height: '20px',
                        bgcolor: '#f9f9f9',
                        color: '#5d5d5d',
                        borderColor: 'rgba(0, 0, 0, 0.1)',
                      }}
                    />
                  )
                })()}
              </Paper>

              {(send.data.tools_executed || []).map((te, idx) => {
                const tname = getToolName(te)
                const st = mapToolStatus(te.status)
                return (
                  <Paper
                    key={idx}
                    sx={{
                      p: 1.5,
                      mb: 1,
                      borderRadius: '10px',
                      border: '1px solid rgba(0, 0, 0, 0.1)',
                      bgcolor: '#ffffff',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '13px', color: '#0d0d0d' }}>
                        {displayToolName(tname)}
                      </Typography>
                      <Chip
                        label={st.label}
                        size="small"
                        sx={{
                          borderRadius: 0,
                          fontSize: '11px',
                          height: '18px',
                          bgcolor: '#f9f9f9',
                          color: '#5d5d5d',
                          borderColor: 'rgba(0, 0, 0, 0.1)',
                        }}
                      />
                      {te.duration_ms !== undefined && (
                        <Typography variant="caption" sx={{ color: '#8f8f8f', fontSize: '11px' }}>
                          {te.duration_ms} ms
                        </Typography>
                      )}
                    </Box>
                    {te.parameters && Object.keys(te.parameters).length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" sx={{ color: '#8f8f8f', fontSize: '11px' }}>
                          Parameter
                        </Typography>
                        <Box
                          component="pre"
                          sx={{
                            m: 0,
                            p: 1,
                            fontSize: 11,
                            overflowX: 'auto',
                            bgcolor: '#f9f9f9',
                            borderRadius: '6px',
                            border: '1px solid rgba(0, 0, 0, 0.08)',
                            color: '#0d0d0d',
                          }}
                        >
                          {JSON.stringify(te.parameters, null, 2)}
                        </Box>
                      </Box>
                    )}
                    {te.result_summary && (
                      <Typography variant="body2" sx={{ mt: 1, fontSize: '13px', color: '#5d5d5d' }}>
                        {te.result_summary}
                      </Typography>
                    )}
                    {te.error && (
                      <Typography variant="body2" sx={{ mt: 1, fontSize: '13px', color: '#0d0d0d' }}>
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

      {/* Input Box — styled with Voice & Send Controls */}
      <Divider sx={{ borderColor: 'rgba(0, 0, 0, 0.1)' }} />
      <Box sx={{ p: 2, bgcolor: '#ffffff' }}>
        {voiceError && (
          <Alert
            severity="warning"
            onClose={() => setVoiceError(null)}
            sx={{ mb: 1.5, fontSize: '12px', py: 0.25 }}
          >
            {voiceError}
          </Alert>
        )}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            borderRadius: '10px',
            border: isListening ? '1.5px solid #d32f2f' : '1px solid rgba(0, 0, 0, 0.15)',
            bgcolor: '#ffffff',
            px: 1.5,
            py: 0.5,
            transition: 'border-color 0.15s ease',
            '&:focus-within': {
              borderColor: '#0d0d0d',
            },
          }}
        >
          <TextField
            variant="standard"
            placeholder={
              isListening
                ? 'Mendengarkan suara Anda...'
                : voiceSettings.persona === 'nozomi'
                  ? 'Ketik atau bicara ke Nozomi…'
                  : 'Bicara atau ketik perintah ke Rexizo…'
            }
            value={input}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            inputProps={{ maxLength: 2000 }}
            InputProps={{
              disableUnderline: true,
              sx: { fontSize: '14px', color: '#0d0d0d' },
            }}
            fullWidth
          />
          <Tooltip title={isListening ? 'Berhenti mendengarkan' : 'Bicara ke Rexizo (Voice Input)'}>
            <IconButton
              size="small"
              onClick={handleToggleMic}
              sx={{
                color: isListening ? '#d32f2f' : '#5d5d5d',
                bgcolor: isListening ? 'rgba(211, 47, 47, 0.1)' : 'transparent',
                p: '6px',
                borderRadius: '8px',
                ml: 0.5,
                '&:hover': {
                  bgcolor: isListening ? 'rgba(211, 47, 47, 0.2)' : 'rgba(0, 0, 0, 0.05)',
                },
              }}
            >
              {isListening ? <MicOffIcon sx={{ fontSize: 18 }} /> : <MicIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
          <IconButton
            size="small"
            onClick={handleSend}
            disabled={!input.trim() || send.isPending}
            sx={{
              bgcolor: input.trim() ? '#0d0d0d' : 'rgba(0, 0, 0, 0.05)',
              color: input.trim() ? '#ffffff' : '#8f8f8f',
              p: '6px',
              borderRadius: '8px',
              ml: 0.5,
              '&:hover': {
                bgcolor: input.trim() ? '#000000' : 'rgba(0, 0, 0, 0.05)',
              },
              '&.Mui-disabled': {
                bgcolor: 'rgba(0, 0, 0, 0.04)',
                color: '#8f8f8f',
              },
            }}
          >
            <ArrowUpwardIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}
