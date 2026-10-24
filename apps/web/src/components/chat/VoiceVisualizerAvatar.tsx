import { Box, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import CloseIcon from '@mui/icons-material/Close'
import { useEffect, useRef, useState } from 'react'
import {
  getVoiceVisualizerMetrics,
  stopRexizoSpeech,
  VoicePersona,
} from '@/utils/speech'

interface Props {
  persona: VoicePersona
  isSpeaking: boolean
  isListening: boolean
  voiceEnabled: boolean
  onToggleVoice?: () => void
  onCloseStage?: () => void
  mode?: 'compact' | 'stage'
}

export function VoiceVisualizerAvatar({
  persona,
  isSpeaking,
  isListening,
  voiceEnabled,
  onToggleVoice,
  onCloseStage,
  mode = 'stage',
}: Props) {
  const [level, setLevel] = useState(0)
  const [bars, setBars] = useState<number[]>(new Array(16).fill(0))
  const [blink, setBlink] = useState(false)
  const reqRef = useRef<number | null>(null)

  // Natural idle eye blinking interval
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const scheduleBlink = () => {
      timer = setTimeout(() => {
        setBlink(true)
        setTimeout(() => setBlink(false), 140)
        scheduleBlink()
      }, 2600 + Math.random() * 2400)
    }
    scheduleBlink()
    return () => clearTimeout(timer)
  }, [])

  // 60fps real-time audio visualization loop
  useEffect(() => {
    let active = true
    const update = () => {
      if (!active) return
      const metrics = getVoiceVisualizerMetrics()
      const rawLevel = isSpeaking || isListening ? metrics.volume : 0
      setLevel((prev) => prev * 0.65 + rawLevel * 0.35)

      const targetBars = Array.from(metrics.frequencies).slice(0, 16)
      setBars((prev) =>
        prev.map((val, idx) => {
          const target = (targetBars[idx] || 0) / 255.0
          return val * 0.55 + target * 0.45
        })
      )
      reqRef.current = requestAnimationFrame(update)
    }
    reqRef.current = requestAnimationFrame(update)
    return () => {
      active = false
      if (reqRef.current) cancelAnimationFrame(reqRef.current)
    }
  }, [isSpeaking, isListening])

  const mouthOpen = Math.min(1.0, level * 2.2)
  const haloScale = 1.0 + level * 0.3
  const isNozomi = persona === 'nozomi'

  if (mode === 'compact') {
    return (
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 0.5,
          borderRadius: '20px',
          bgcolor: isNozomi
            ? isSpeaking
              ? '#fce4ec'
              : '#fff0f5'
            : isSpeaking
              ? '#e0f7fa'
              : '#f5f5f5',
          border: isNozomi ? '1px solid #f8bbd0' : '1px solid #cfd8dc',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Compact Character Head */}
        <Box sx={{ position: 'relative', width: 26, height: 26 }}>
          {isNozomi ? (
            <svg viewBox="0 0 100 100" width="26" height="26">
              {/* Blue Archive Halo */}
              <ellipse
                cx="50"
                cy="14"
                rx={18 * haloScale}
                ry={6 * haloScale}
                fill="none"
                stroke="#ff4081"
                strokeWidth="4"
                strokeDasharray="8 4"
                style={{
                  transformOrigin: '50% 14%',
                  opacity: isSpeaking ? 0.95 : 0.6,
                }}
              />
              {/* Face */}
              <circle cx="50" cy="55" r="34" fill="#fff5eb" />
              {/* Hair */}
              <path
                d="M 16 55 C 16 26 84 26 84 55 C 80 44 65 38 50 38 C 35 38 20 44 16 55 Z"
                fill="#ff80ab"
              />
              {/* Hair strands */}
              <path d="M 16 55 Q 12 72 22 80 Q 20 62 26 52" fill="#ff4081" />
              <path d="M 84 55 Q 88 72 78 80 Q 80 62 74 52" fill="#ff4081" />
              {/* Eyes */}
              {blink ? (
                <>
                  <line x1="36" y1="53" x2="44" y2="53" stroke="#d81b60" strokeWidth="3" strokeLinecap="round" />
                  <line x1="56" y1="53" x2="64" y2="53" stroke="#d81b60" strokeWidth="3" strokeLinecap="round" />
                </>
              ) : (
                <>
                  <ellipse cx="40" cy="53" rx="3.5" ry="4.5" fill="#c2185b" />
                  <ellipse cx="60" cy="53" rx="3.5" ry="4.5" fill="#c2185b" />
                  <circle cx="41.5" cy="51" r="1.5" fill="#ffffff" />
                  <circle cx="61.5" cy="51" r="1.5" fill="#ffffff" />
                </>
              )}
              {/* Mouth with real-time lip-sync */}
              {isSpeaking && mouthOpen > 0.08 ? (
                <ellipse cx="50" cy={68 + mouthOpen * 3} rx={3 + mouthOpen * 4} ry={2 + mouthOpen * 6} fill="#d81b60" />
              ) : (
                <path d="M 46 68 Q 50 71 54 68" stroke="#d81b60" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              )}
            </svg>
          ) : (
            // Butler Arc Reactor Icon
            <svg viewBox="0 0 100 100" width="26" height="26">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#00e5ff" strokeWidth="4" opacity="0.4" />
              <circle
                cx="50"
                cy="50"
                r={24 * (0.8 + level * 0.4)}
                fill="#00e5ff"
                opacity={isSpeaking ? 0.8 : 0.3}
              />
              <circle cx="50" cy="50" r="12" fill="#ffffff" opacity={isSpeaking ? 0.95 : 0.6} />
            </svg>
          )}
        </Box>

        {/* 5 Compact Equalizer Bars */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '2px', height: 16 }}>
          {[0, 2, 4, 6, 8].map((i) => {
            const h = isSpeaking || isListening ? Math.max(3, (bars[i] || 0) * 16) : 3
            return (
              <Box
                key={i}
                sx={{
                  width: '3px',
                  height: `${h}px`,
                  borderRadius: '2px',
                  bgcolor: isNozomi ? '#ff4081' : '#00b0ff',
                  transition: 'height 0.08s ease',
                }}
              />
            )
          })}
        </Box>
      </Box>
    )
  }

  // Stage Mode (Full interactive audio reactive character card)
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: '12px',
        bgcolor: isNozomi ? '#fffafc' : '#f8fafd',
        border: isNozomi ? '1px solid #f8bbd0' : '1px solid #b2ebf2',
        boxShadow: isSpeaking
          ? isNozomi
            ? '0 4px 16px rgba(255, 64, 129, 0.12)'
            : '0 4px 16px rgba(0, 229, 255, 0.12)'
          : 'none',
        transition: 'box-shadow 0.25s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Main Reactive Character Avatar */}
          <Box
            sx={{
              position: 'relative',
              width: 58,
              height: 58,
              borderRadius: '50%',
              bgcolor: isNozomi ? '#ffebee' : '#e0f7fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isSpeaking
                ? isNozomi
                  ? `0 0 ${12 + level * 20}px rgba(255, 64, 129, 0.45)`
                  : `0 0 ${12 + level * 20}px rgba(0, 229, 255, 0.45)`
                : 'none',
              transition: 'box-shadow 0.1s ease',
            }}
          >
            {isNozomi ? (
              <svg viewBox="0 0 100 100" width="54" height="54">
                <defs>
                  <filter id="haloGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Blue Archive Halo */}
                <g filter="url(#haloGlow)">
                  <ellipse
                    cx="50"
                    cy="14"
                    rx={19 * haloScale}
                    ry={6.5 * haloScale}
                    fill="none"
                    stroke="#ff4081"
                    strokeWidth="4"
                    strokeDasharray="9 3"
                    style={{
                      transformOrigin: '50% 14%',
                      opacity: isSpeaking ? 0.95 : 0.65,
                    }}
                  />
                  {/* Halo Sparkle Star */}
                  <polygon
                    points="50,4 52,11 59,13 52,15 50,22 48,15 41,13 48,11"
                    fill="#ff80ab"
                    opacity={isSpeaking ? 0.95 : 0.5}
                  />
                </g>

                {/* Anime Face */}
                <circle cx="50" cy="55" r="34" fill="#fff5eb" />

                {/* Cheeks Blush */}
                <circle cx="33" cy="62" r="4.5" fill="#ffcdd2" opacity="0.75" />
                <circle cx="67" cy="62" r="4.5" fill="#ffcdd2" opacity="0.75" />

                {/* Hair */}
                <path
                  d="M 16 55 C 16 26 84 26 84 55 C 80 44 65 38 50 38 C 35 38 20 44 16 55 Z"
                  fill="#ff80ab"
                />
                {/* Hair Bows / Twintails */}
                <path d="M 16 55 Q 10 74 22 84 Q 18 64 26 52" fill="#ff4081" />
                <path d="M 84 55 Q 90 74 78 84 Q 82 64 74 52" fill="#ff4081" />

                {/* Anime Expressive Eyes with natural blink */}
                {blink ? (
                  <>
                    <path d="M 34 54 Q 40 50 46 54" stroke="#c2185b" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <path d="M 54 54 Q 60 50 66 54" stroke="#c2185b" strokeWidth="3" fill="none" strokeLinecap="round" />
                  </>
                ) : (
                  <>
                    <ellipse cx="40" cy="53" rx="4.5" ry="6" fill="#c2185b" />
                    <ellipse cx="60" cy="53" rx="4.5" ry="6" fill="#c2185b" />
                    <circle cx="42" cy="50.5" r="2" fill="#ffffff" />
                    <circle cx="62" cy="50.5" r="2" fill="#ffffff" />
                    <circle cx="38" cy="55.5" r="1.2" fill="#ffffff" opacity="0.8" />
                    <circle cx="58" cy="55.5" r="1.2" fill="#ffffff" opacity="0.8" />
                  </>
                )}

                {/* Mouth with real-time lip-sync flapping */}
                {isSpeaking && mouthOpen > 0.08 ? (
                  <ellipse
                    cx="50"
                    cy={68 + mouthOpen * 4}
                    rx={3.5 + mouthOpen * 5.5}
                    ry={2.5 + mouthOpen * 7.5}
                    fill="#d81b60"
                  />
                ) : (
                  <path
                    d="M 45 68 Q 50 72 55 68"
                    stroke="#d81b60"
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            ) : (
              // R.E.X.I.Z.O. Butler Hologram Reactor
              <svg viewBox="0 0 100 100" width="54" height="54">
                <circle cx="50" cy="50" r="44" fill="none" stroke="#00e5ff" strokeWidth="2.5" opacity="0.3" />
                <circle
                  cx="50"
                  cy="50"
                  r={32 * (0.8 + level * 0.35)}
                  fill="none"
                  stroke="#00e5ff"
                  strokeWidth="3.5"
                  strokeDasharray="16 8"
                  opacity={isSpeaking ? 0.9 : 0.5}
                />
                <circle
                  cx="50"
                  cy="50"
                  r={18 * (0.85 + level * 0.45)}
                  fill="#00e5ff"
                  opacity={isSpeaking ? 0.8 : 0.4}
                />
                <circle cx="50" cy="50" r="8" fill="#ffffff" opacity={isSpeaking ? 0.95 : 0.6} />
              </svg>
            )}
          </Box>

          {/* Character Label & Status */}
          <Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography sx={{ fontWeight: 600, fontSize: '14px', color: '#0d0d0d' }}>
                {isNozomi ? '🌸 Tachibana Nozomi' : '🎩 R.E.X.I.Z.O.'}
              </Typography>
              <Chip
                label={
                  isSpeaking
                    ? 'Bicara'
                    : isListening
                      ? 'Mendengarkan'
                      : 'Siaga'
                }
                size="small"
                sx={{
                  height: 18,
                  fontSize: '10px',
                  bgcolor: isSpeaking
                    ? isNozomi
                      ? '#f8bbd0'
                      : '#b2ebf2'
                    : isListening
                      ? '#ffcdd2'
                      : '#f5f5f5',
                  color: isSpeaking
                    ? isNozomi
                      ? '#880e4f'
                      : '#006064'
                    : isListening
                      ? '#b71c1c'
                      : '#616161',
                  fontWeight: 600,
                  borderRadius: '4px',
                }}
              />
            </Stack>
            <Typography variant="caption" sx={{ color: '#757575', fontSize: '11px', display: 'block', mt: 0.25 }}>
              {isSpeaking
                ? isNozomi
                  ? 'Nozomi sedang berbicara ke Sensei...'
                  : 'Sintesis audio vokal butler aktif'
                : isListening
                  ? 'Mikrofon aktif: katakan perintah Anda...'
                  : isNozomi
                    ? 'Siap melayari Sensei di sistem Arch Linux'
                    : 'System standby at your service, Sir.'}
            </Typography>
          </Box>
        </Box>

        {/* Action Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {isSpeaking && (
            <Tooltip title="Hentikan suara">
              <IconButton
                size="small"
                onClick={stopRexizoSpeech}
                sx={{ p: '4px', color: '#c2185b', bgcolor: 'rgba(255, 64, 129, 0.1)' }}
              >
                <VolumeOffIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          {onToggleVoice && (
            <Tooltip title={voiceEnabled ? 'Suara respons aktif' : 'Suara respons mati'}>
              <IconButton size="small" onClick={onToggleVoice} sx={{ p: '4px', color: '#757575' }}>
                {voiceEnabled ? <VolumeUpIcon sx={{ fontSize: 16 }} /> : <VolumeOffIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
          )}
          {onCloseStage && (
            <Tooltip title="Tutup stage visualizer">
              <IconButton size="small" onClick={onCloseStage} sx={{ p: '4px', color: '#757575' }}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* 16-Band Dynamic Audio Spectrum Waveform */}
      <Box
        sx={{
          mt: 1.25,
          pt: 1,
          borderTop: isNozomi ? '1px dashed #fce4ec' : '1px dashed #e0f7fa',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          height: 24,
          px: 0.5,
          gap: '3px',
        }}
      >
        {bars.map((b, idx) => {
          const h = Math.max(3, b * 22)
          return (
            <Box
              key={idx}
              sx={{
                flex: 1,
                height: `${h}px`,
                borderRadius: '2px',
                bgcolor: isListening
                  ? '#e91e63'
                  : isNozomi
                    ? idx % 2 === 0
                      ? '#ff4081'
                      : '#b388ff'
                    : idx % 2 === 0
                      ? '#00e5ff'
                      : '#00b0ff',
                opacity: isSpeaking || isListening ? 0.9 : 0.25,
                transition: 'height 0.08s ease, opacity 0.2s ease',
              }}
            />
          )
        })}
      </Box>
    </Box>
  )
}
