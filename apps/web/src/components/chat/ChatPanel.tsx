import {
  Alert,
  Box,
  Button,
  Chip,
  Fade,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import RefreshIcon from '@mui/icons-material/Refresh'
import SecurityIcon from '@mui/icons-material/Security'
import TuneIcon from '@mui/icons-material/Tune'
import VideocamIcon from '@mui/icons-material/Videocam'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import SmartToyIcon from '@mui/icons-material/SmartToy'
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
import { VoiceVisualizerAvatar } from './VoiceVisualizerAvatar'

function newId() {
  return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function ChatPanel() {
  const conversationId = 'conv_default'
  const { data, isLoading, isError, refetch } = useChatHistory(conversationId)
  const send = useSendMessage(conversationId)
  const [input, setInput] = useState('')
  const clientIdRef = useRef(newId())
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(loadVoiceSettings())
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showVisualizerStage, setShowVisualizerStage] = useState(true)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [lastFailedText, setLastFailedText] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
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
        const id = clientIdRef.current
        clientIdRef.current = newId()
        const res = await send.mutateAsync({ message: text, client_message_id: id })
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
    [send, voiceEnabled, voiceSettings]
  )

  const handleSendWithTextRef = useRef(handleSendWithText)
  handleSendWithTextRef.current = handleSendWithText

  useEffect(() => {
    return () => {
      stopRexizoSpeech()
    }
  }, [])

  useEffect(() => {
    recognizerRef.current = createSpeechRecognizer(
      (transcript) => {
        setIsListening(false)
        setVoiceError(null)
        const cleaned = transcript.trim()
        if (cleaned) {
          setInput(cleaned)
          setTimeout(() => {
            handleSendWithTextRef.current(cleaned)
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
    }
  }, [voiceSettings.continuousMode])

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

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const isNozomi = voiceSettings.persona === 'nozomi'

  const starterPrompts = [
    {
      title: 'Cek Feed Kamera Depan',
      icon: <VideocamIcon sx={{ fontSize: 18, color: isNozomi ? '#e91e63' : '#0288d1' }} />,
      desc: 'Analisis visual kondisi kamera depan dengan model AI Vision',
      prompt: 'Periksa rekaman kamera depan dan jelaskan kondisi visual saat ini.',
    },
    {
      title: 'Status Keamanan Sistem',
      icon: <SecurityIcon sx={{ fontSize: 18, color: '#2e7d32' }} />,
      desc: 'Cek log event CCTV dan deteksi aktivitas mencurigakan',
      prompt: 'Bagaimana status keamanan dan event deteksi CCTV hari ini?',
    },
    {
      title: 'Periksa Resource Server',
      icon: <AutoAwesomeIcon sx={{ fontSize: 18, color: '#ed6c02' }} />,
      desc: 'Cek penggunaan CPU, RAM, disk, dan worker surveillance',
      prompt: 'Tampilkan status penggunaan CPU, RAM, disk, dan worker sistem.',
    },
    {
      title: 'Webcam Snapshot Ruangan',
      icon: <SmartToyIcon sx={{ fontSize: 18, color: '#9c27b0' }} />,
      desc: 'Ambil snapshot webcam ruangan lokal & laporkan objek',
      prompt: 'Ambil snapshot webcam lokal (cam_device) dan analisis objek yang terlihat.',
    },
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#ffffff' }}>
      {/* Voice Settings Dialog */}
      <VoiceSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSettingsChanged={(updated) => setVoiceSettings(updated)}
      />

      {/* Modern AI Chat Top Header */}
      <Box
        sx={{
          height: 56,
          px: { xs: 2, md: 3 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          bgcolor: '#ffffff',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Character Badge */}
          <Box
            onClick={() => setSettingsOpen(true)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.25,
              py: 0.5,
              borderRadius: '20px',
              bgcolor: isNozomi ? '#fff0f5' : '#f0f9ff',
              border: isNozomi ? '1px solid #f8bbd0' : '1px solid #bae6fd',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              '&:hover': {
                bgcolor: isNozomi ? '#fce4ec' : '#e0f2fe',
              },
            }}
          >
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: isNozomi ? '#c2185b' : '#0369a1' }}>
              {isNozomi ? '🌸 Tachibana Nozomi' : '🎩 Butler R.E.X.I.Z.O.'}
            </Typography>
            <Chip
              label={isNozomi ? 'Sensei Mode' : 'Butler Mode'}
              size="small"
              sx={{
                height: '18px',
                fontSize: '10px',
                fontWeight: 600,
                bgcolor: isNozomi ? '#f48fb1' : '#7dd3fc',
                color: '#ffffff',
                borderRadius: '10px',
              }}
            />
          </Box>

          {voiceSettings.continuousMode && (
            <Chip
              label="Hands-Free"
              size="small"
              sx={{
                height: '20px',
                fontSize: '11px',
                bgcolor: '#e8f5e9',
                color: '#2e7d32',
                borderRadius: '10px',
                fontWeight: 600,
              }}
            />
          )}

          {/* Compact visualizer badge */}
          <Tooltip title={showVisualizerStage ? 'Sembunyikan stage avatar' : 'Tampilkan stage avatar'}>
            <Box
              onClick={() => setShowVisualizerStage((prev) => !prev)}
              sx={{ cursor: 'pointer', display: { xs: 'none', sm: 'block' } }}
            >
              <VoiceVisualizerAvatar
                mode="compact"
                persona={voiceSettings.persona}
                isSpeaking={Boolean(speakingId)}
                isListening={isListening}
                voiceEnabled={voiceEnabled}
              />
            </Box>
          </Tooltip>
        </Box>

        {/* Action Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Tooltip title="Muat Ulang Riwayat Chat">
            <IconButton
              size="small"
              onClick={() => refetch()}
              sx={{
                p: '6px',
                borderRadius: '8px',
                color: '#5d5d5d',
                '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.05)' },
              }}
            >
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Setelan Suara & Karakter">
            <IconButton
              size="small"
              onClick={() => setSettingsOpen(true)}
              sx={{
                p: '6px',
                borderRadius: '8px',
                color: '#5d5d5d',
                '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.05)' },
              }}
            >
              <TuneIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title={voiceEnabled ? 'Matikan suara asisten' : 'Aktifkan suara asisten (TTS)'}>
            <IconButton
              size="small"
              onClick={handleToggleVoice}
              sx={{
                p: '6px',
                borderRadius: '8px',
                bgcolor: voiceEnabled ? '#0d0d0d' : 'transparent',
                color: voiceEnabled ? '#ffffff' : '#5d5d5d',
                '&:hover': {
                  bgcolor: voiceEnabled ? '#222222' : 'rgba(0, 0, 0, 0.05)',
                },
              }}
            >
              {voiceEnabled ? <VolumeUpIcon sx={{ fontSize: 18 }} /> : <VolumeOffIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Main Chat Stream Container */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#fafafa',
        }}
      >
        <Box
          sx={{
            maxWidth: '840px',
            width: '100%',
            mx: 'auto',
            px: { xs: 2, sm: 3 },
            py: 3,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {isLoading && (
            <Typography sx={{ color: '#8f8f8f', fontSize: '14px', textAlign: 'center', my: 4 }}>
              Memuat percakapan...
            </Typography>
          )}

          {isError && (
            <Box
              sx={{
                p: 2,
                mb: 3,
                borderRadius: '12px',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                bgcolor: '#ffffff',
              }}
            >
              <Typography sx={{ color: '#0d0d0d', fontSize: '14px', fontWeight: 500, mb: 1 }}>
                Riwayat obrolan tidak dapat dimuat
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

          {/* AI Chat Empty State with Starter Prompts */}
          {!isLoading && messages.length === 0 && (
            <Box sx={{ my: 'auto', py: 4, textAlign: 'center' }}>
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  bgcolor: isNozomi ? '#fff0f5' : '#f0f9ff',
                  border: isNozomi ? '2px solid #f8bbd0' : '2px solid #bae6fd',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                }}
              >
                <Typography sx={{ fontSize: '32px' }}>
                  {isNozomi ? '🌸' : '🎩'}
                </Typography>
              </Box>

              <Typography variant="h5" sx={{ fontWeight: 700, color: '#0d0d0d', fontSize: '22px', mb: 1 }}>
                {isNozomi
                  ? 'Halo Sensei! Ada yang bisa Nozomi bantu hari ini? 🌸'
                  : 'At your service, Sir. Ready for directives.'}
              </Typography>

              <Typography variant="body2" sx={{ color: '#5d5d5d', maxWidth: 520, mx: 'auto', mb: 4, lineHeight: 1.6 }}>
                Asisten AI multimodal cerdas siap menganalisis feed CCTV secara visual, memonitor event keamanan, serta mengendalikan sistem Arch Linux melalui teks maupun suara.
              </Typography>

              {/* 4 Quick Starter Prompt Cards */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 1.5,
                  maxWidth: 680,
                  mx: 'auto',
                  textAlign: 'left',
                }}
              >
                {starterPrompts.map((item, idx) => (
                  <Box
                    key={idx}
                    onClick={() => handleSendWithText(item.prompt)}
                    sx={{
                      p: 2,
                      borderRadius: '12px',
                      border: '1px solid rgba(0, 0, 0, 0.08)',
                      bgcolor: '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                      '&:hover': {
                        bgcolor: '#ffffff',
                        borderColor: '#0d0d0d',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                        transform: 'translateY(-1px)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      {item.icon}
                      <Typography sx={{ fontWeight: 600, fontSize: '13.5px', color: '#0d0d0d' }}>
                        {item.title}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '12px', color: '#5d5d5d', lineHeight: 1.4 }}>
                      {item.desc}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* Message List */}
          <Stack spacing={2.5}>
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
                      <Chip
                        label={`Eksekusi: ${displayToolName(m.tool_name)}`}
                        size="small"
                        sx={{
                          borderRadius: '6px',
                          fontSize: '11px',
                          height: '22px',
                          bgcolor: '#ffffff',
                          color: '#5d5d5d',
                          border: '1px solid rgba(0, 0, 0, 0.1)',
                        }}
                      />
                    </Box>
                  )
                }

                if (m.role === 'user') {
                  return (
                    <Box key={m.id} sx={{ alignSelf: 'flex-end', maxWidth: '80%' }}>
                      <Box
                        sx={{
                          bgcolor: '#18181b',
                          color: '#ffffff',
                          borderRadius: '18px 18px 4px 18px',
                          px: 2.25,
                          py: 1.5,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        }}
                      >
                        <Typography sx={{ fontSize: '14.5px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                          {m.content}
                        </Typography>
                      </Box>
                    </Box>
                  )
                }

                // Assistant message
                return (
                  <Box key={m.id} sx={{ display: 'flex', gap: 1.5, alignSelf: 'flex-start', maxWidth: '92%' }}>
                    {/* Character Avatar icon */}
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        bgcolor: isNozomi ? '#fff0f5' : '#f0f9ff',
                        border: isNozomi ? '1px solid #f8bbd0' : '1px solid #bae6fd',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        mt: 0.5,
                      }}
                    >
                      <Typography sx={{ fontSize: '18px' }}>
                        {isNozomi ? '🌸' : '🎩'}
                      </Typography>
                    </Box>

                    {/* Message Card */}
                    <Box
                      sx={{
                        bgcolor: '#ffffff',
                        border: '1px solid rgba(0, 0, 0, 0.08)',
                        borderRadius: '18px 18px 18px 4px',
                        p: 2,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        flex: 1,
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '14.5px',
                          lineHeight: 1.6,
                          color: '#0d0d0d',
                          whiteSpace: 'pre-wrap',
                          mb: 1.5,
                        }}
                      >
                        {m.content}
                      </Typography>

                      {/* Action Bar */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pt: 0.5, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                        <Tooltip title={speakingId === m.id ? 'Hentikan suara' : 'Putar suara'}>
                          <IconButton
                            size="small"
                            onClick={() => handleSpeakMessage(m.id, m.content)}
                            sx={{
                              p: '4px',
                              borderRadius: '6px',
                              color: speakingId === m.id ? '#c2185b' : '#5d5d5d',
                              bgcolor: speakingId === m.id ? '#fce4ec' : 'transparent',
                              '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
                            }}
                          >
                            <VolumeUpIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title={copiedId === m.id ? 'Tersalin!' : 'Salin teks'}>
                          <IconButton
                            size="small"
                            onClick={() => handleCopyText(m.id, m.content)}
                            sx={{
                              p: '4px',
                              borderRadius: '6px',
                              color: copiedId === m.id ? '#2e7d32' : '#5d5d5d',
                              '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
                            }}
                          >
                            {copiedId === m.id ? <CheckIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  </Box>
                )
              })}

            {/* Live Streaming Response Card */}
            {send.isPending && (
              <Box sx={{ display: 'flex', gap: 1.5, alignSelf: 'flex-start' }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    bgcolor: isNozomi ? '#fff0f5' : '#f0f9ff',
                    border: isNozomi ? '1px solid #f8bbd0' : '1px solid #bae6fd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Typography sx={{ fontSize: '18px' }}>{isNozomi ? '🌸' : '🎩'}</Typography>
                </Box>
                <Box
                  sx={{
                    p: 2,
                    bgcolor: '#ffffff',
                    borderRadius: '18px 18px 18px 4px',
                    border: '1px solid rgba(0, 0, 0, 0.08)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <Typography sx={{ color: '#5d5d5d', fontSize: '13.5px', fontStyle: 'italic' }}>
                    {isNozomi ? 'Nozomi sedang berpikir dan memproses feed CCTV...' : 'Rexizo is analyzing the request...'}
                  </Typography>
                </Box>
              </Box>
            )}

            {send.isError && (() => {
              const info = mapErrorCode((send.error as any)?.code)
              return (
                <Paper
                  sx={{
                    alignSelf: 'flex-start',
                    p: 2,
                    borderRadius: '12px',
                    border: '1px solid rgba(211, 47, 47, 0.3)',
                    bgcolor: '#fffbfa',
                  }}
                >
                  <Typography variant="body2" sx={{ color: '#d32f2f', fontWeight: 600 }}>
                    {(send.error as any)?.message || 'Terjadi kesalahan sistem'}
                  </Typography>
                  {info.retryable ? (
                    <Button
                      size="small"
                      variant="outlined"
                      sx={{ mt: 1, borderColor: '#d32f2f', color: '#d32f2f' }}
                      onClick={() => handleSendWithText(input || lastFailedText)}
                    >
                      Coba lagi
                    </Button>
                  ) : (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#8f8f8f' }}>
                      Koneksi CCTV dan sistem pengawasan tetap berjalan stabil di latar belakang.
                    </Typography>
                  )}
                </Paper>
              )
            })()}

            {/* Just Sent Data with Tool Results */}
            {send.data && (
              <Box sx={{ display: 'flex', gap: 1.5, alignSelf: 'flex-start', maxWidth: '92%', width: '100%' }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    bgcolor: isNozomi ? '#fff0f5' : '#f0f9ff',
                    border: isNozomi ? '1px solid #f8bbd0' : '1px solid #bae6fd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    mt: 0.5,
                  }}
                >
                  <Typography sx={{ fontSize: '18px' }}>{isNozomi ? '🌸' : '🎩'}</Typography>
                </Box>

                <Box sx={{ flex: 1 }}>
                  <Paper
                    sx={{
                      p: 2,
                      mb: 1.5,
                      borderRadius: '18px 18px 18px 4px',
                      border: '1px solid rgba(0, 0, 0, 0.08)',
                      bgcolor: '#ffffff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    }}
                  >
                    <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: '14.5px', lineHeight: 1.6, color: '#0d0d0d', mb: 1.5 }}>
                      {send.data.reply}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 0.5, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Tooltip title="Putar suara">
                          <IconButton
                            size="small"
                            onClick={() => handleSpeakMessage(send.data?.message_id || 'latest', send.data?.reply || '')}
                            sx={{
                              p: '4px',
                              borderRadius: '6px',
                              color: speakingId === (send.data?.message_id || 'latest') ? '#c2185b' : '#5d5d5d',
                              bgcolor: speakingId === (send.data?.message_id || 'latest') ? '#fce4ec' : 'transparent',
                            }}
                          >
                            <VolumeUpIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Salin teks">
                          <IconButton
                            size="small"
                            onClick={() => handleCopyText(send.data?.message_id || 'latest', send.data?.reply || '')}
                            sx={{ p: '4px', borderRadius: '6px', color: '#5d5d5d' }}
                          >
                            {copiedId === (send.data?.message_id || 'latest') ? <CheckIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
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
                              borderRadius: '6px',
                              fontSize: '11px',
                              height: '20px',
                              bgcolor: '#f4f4f4',
                              color: '#5d5d5d',
                            }}
                          />
                        )
                      })()}
                    </Box>
                  </Paper>

                  {(send.data.tools_executed || []).map((te, idx) => {
                    const tname = getToolName(te)
                    const st = mapToolStatus(te.status)
                    return (
                      <Paper
                        key={idx}
                        sx={{
                          p: 1.5,
                          mb: 1.5,
                          borderRadius: '12px',
                          border: '1px solid rgba(0, 0, 0, 0.08)',
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
                              borderRadius: '4px',
                              fontSize: '11px',
                              height: '18px',
                              bgcolor: '#f4f4f4',
                              color: '#5d5d5d',
                            }}
                          />
                          {te.duration_ms !== undefined && (
                            <Typography variant="caption" sx={{ color: '#8f8f8f', fontSize: '11px' }}>
                              {te.duration_ms} ms
                            </Typography>
                          )}
                        </Box>
                        {te.result_summary && (
                          <Typography variant="body2" sx={{ mt: 1, fontSize: '13px', color: '#5d5d5d' }}>
                            {te.result_summary}
                          </Typography>
                        )}
                        {te.result && typeof te.result === 'object' && (te.result as any).snapshot_url && (
                          <Box sx={{ mt: 1.5, borderRadius: '10px', overflow: 'hidden', maxWidth: 420, border: '1px solid rgba(0, 0, 0, 0.1)' }}>
                            <Box
                              component="img"
                              src={(te.result as any).snapshot_url}
                              alt="CCTV Frame Snapshot"
                              sx={{ width: '100%', height: 'auto', display: 'block' }}
                            />
                          </Box>
                        )}
                      </Paper>
                    )
                  })}
                </Box>
              </Box>
            )}
          </Stack>
          <div ref={bottomRef} />
        </Box>
      </Box>

      {/* Floating Bottom Input Area & Visualizer Stage Container */}
      <Box sx={{ bgcolor: '#ffffff', borderTop: '1px solid rgba(0, 0, 0, 0.08)', p: { xs: 1.5, sm: 2 } }}>
        <Box sx={{ maxWidth: '840px', width: '100%', mx: 'auto' }}>
          {/* Real-time Voice Reactive Avatar & Spectrum Stage */}
          {showVisualizerStage && (
            <Fade in={showVisualizerStage}>
              <Box sx={{ mb: 1.5 }}>
                <VoiceVisualizerAvatar
                  mode="stage"
                  persona={voiceSettings.persona}
                  isSpeaking={Boolean(speakingId)}
                  isListening={isListening}
                  voiceEnabled={voiceEnabled}
                  onToggleVoice={handleToggleVoice}
                  onCloseStage={() => setShowVisualizerStage(false)}
                />
              </Box>
            </Fade>
          )}

          {voiceError && (
            <Alert
              severity="warning"
              onClose={() => setVoiceError(null)}
              sx={{ mb: 1.5, fontSize: '12px', py: 0.25 }}
            >
              {voiceError}
            </Alert>
          )}

          {/* Floating AI Prompt Box */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              borderRadius: '16px',
              border: isListening ? '1.5px solid #d32f2f' : '1px solid rgba(0, 0, 0, 0.15)',
              bgcolor: '#ffffff',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
              px: 2,
              py: 0.75,
              transition: 'all 0.2s ease',
              '&:focus-within': {
                borderColor: '#0d0d0d',
                boxShadow: '0 6px 24px rgba(0, 0, 0, 0.1)',
              },
            }}
          >
            <TextField
              variant="standard"
              multiline
              maxRows={5}
              placeholder={
                isListening
                  ? 'Mendengarkan suara Anda...'
                  : isNozomi
                    ? 'Ketik pertanyaan atau bicara ke Nozomi…'
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
                sx: { fontSize: '14.5px', color: '#0d0d0d', py: 0.5 },
              }}
              fullWidth
            />

            <Tooltip title={isListening ? 'Berhenti mendengarkan' : 'Bicara ke Asisten (Input Suara)'}>
              <IconButton
                size="small"
                onClick={handleToggleMic}
                sx={{
                  color: isListening ? '#d32f2f' : '#5d5d5d',
                  bgcolor: isListening ? 'rgba(211, 47, 47, 0.1)' : 'transparent',
                  p: '8px',
                  borderRadius: '10px',
                  ml: 0.75,
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    bgcolor: isListening ? 'rgba(211, 47, 47, 0.2)' : 'rgba(0, 0, 0, 0.05)',
                  },
                }}
              >
                {isListening ? <MicOffIcon sx={{ fontSize: 20 }} /> : <MicIcon sx={{ fontSize: 20 }} />}
              </IconButton>
            </Tooltip>

            <IconButton
              size="small"
              onClick={handleSend}
              disabled={!input.trim() || send.isPending}
              sx={{
                bgcolor: input.trim() ? '#0d0d0d' : 'rgba(0, 0, 0, 0.06)',
                color: input.trim() ? '#ffffff' : '#8f8f8f',
                p: '8px',
                borderRadius: '10px',
                ml: 0.75,
                transition: 'all 0.15s ease',
                '&:hover': {
                  bgcolor: input.trim() ? '#222222' : 'rgba(0, 0, 0, 0.06)',
                },
                '&.Mui-disabled': {
                  bgcolor: 'rgba(0, 0, 0, 0.04)',
                  color: '#b0b0b0',
                },
              }}
            >
              <ArrowUpwardIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>

          <Typography
            variant="caption"
            sx={{
              display: 'block',
              textAlign: 'center',
              mt: 1,
              color: '#8f8f8f',
              fontSize: '11.5px',
            }}
          >
            Tekan <b>Enter</b> untuk kirim, <b>Shift + Enter</b> untuk baris baru • Model AI Vision & Neural Speech Bebas Pulsa
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
