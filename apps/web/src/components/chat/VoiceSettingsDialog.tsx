import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver'
import { useEffect, useState } from 'react'
import {
  loadVoiceSettings,
  playRexizoChime,
  saveVoiceSettings,
  speakRexizo,
  stopRexizoSpeech,
  VoicePersona,
  VoiceSettings,
} from '@/utils/speech'

interface Props {
  open: boolean
  onClose: () => void
  onSettingsChanged?: (settings: VoiceSettings) => void
}

export function VoiceSettingsDialog({ open, onClose, onSettingsChanged }: Props) {
  const [settings, setSettings] = useState<VoiceSettings>(loadVoiceSettings())
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const updateVoices = () => {
        setAvailableVoices(window.speechSynthesis.getVoices())
      }
      updateVoices()
      window.speechSynthesis.onvoiceschanged = updateVoices
    }
  }, [])

  useEffect(() => {
    if (open) {
      setSettings(loadVoiceSettings())
    }
  }, [open])

  const handlePersonaChange = (persona: VoicePersona) => {
    let next: VoiceSettings = { ...settings, persona }
    if (persona === 'nozomi') {
      next = { ...next, pitch: 1.35, rate: 1.05 }
    } else if (persona === 'rexizo') {
      next = { ...next, pitch: 0.95, rate: 1.02 }
    }
    setSettings(next)
    saveVoiceSettings(next)
    onSettingsChanged?.(next)
  }

  const handleSliderChange = (key: 'pitch' | 'rate', val: number) => {
    const next = { ...settings, [key]: val, persona: 'custom' as VoicePersona }
    setSettings(next)
    saveVoiceSettings(next)
    onSettingsChanged?.(next)
  }

  const handleContinuousToggle = (checked: boolean) => {
    const next = { ...settings, continuousMode: checked }
    setSettings(next)
    saveVoiceSettings(next)
    onSettingsChanged?.(next)
  }

  const handleVoiceURIChange = (voiceURI: string) => {
    const next = { ...settings, voiceURI, persona: 'custom' as VoicePersona }
    setSettings(next)
    saveVoiceSettings(next)
    onSettingsChanged?.(next)
  }

  const handleTestVoice = () => {
    stopRexizoSpeech()
    playRexizoChime(settings.persona)
    const sampleText =
      settings.persona === 'nozomi'
        ? 'Halo Sensei! Nozomi siap membantumu mengontrol semua sistem Arch Linux!'
        : 'At your service, Sir. All Arch Linux subsystems and security feeds are online.'
    speakRexizo(sampleText, settings)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          p: 1,
          bgcolor: '#ffffff',
          border: '1px solid rgba(0, 0, 0, 0.1)',
        },
      }}
    >
      <DialogTitle sx={{ pb: 1, px: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <RecordVoiceOverIcon sx={{ fontSize: 20, color: '#0d0d0d' }} />
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '16px', color: '#0d0d0d' }}>
          Kustomisasi Suara & Persona
        </Typography>
      </DialogTitle>
      <Divider sx={{ borderColor: 'rgba(0, 0, 0, 0.08)' }} />

      <DialogContent sx={{ px: 2, py: 2 }}>
        <Stack spacing={2.5}>
          {/* Persona Selection */}
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '13px', mb: 1, color: '#0d0d0d' }}>
              Pilih Karakter Suara:
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <Box
                onClick={() => handlePersonaChange('nozomi')}
                sx={{
                  p: 1.25,
                  borderRadius: '8px',
                  border: settings.persona === 'nozomi' ? '1.5px solid #0d0d0d' : '1px solid rgba(0,0,0,0.1)',
                  bgcolor: settings.persona === 'nozomi' ? '#f4f4f4' : '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: '#f9f9f9' },
                }}
              >
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#0d0d0d' }}>
                  🌸 Tachibana Nozomi
                </Typography>
                <Typography sx={{ fontSize: '11px', color: '#5d5d5d', mt: 0.5 }}>
                  Blue Archive (Ceria & Lucu)
                </Typography>
              </Box>

              <Box
                onClick={() => handlePersonaChange('rexizo')}
                sx={{
                  p: 1.25,
                  borderRadius: '8px',
                  border: settings.persona === 'rexizo' ? '1.5px solid #0d0d0d' : '1px solid rgba(0,0,0,0.1)',
                  bgcolor: settings.persona === 'rexizo' ? '#f4f4f4' : '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: '#f9f9f9' },
                }}
              >
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#0d0d0d' }}>
                  🎩 Rexizo Butler
                </Typography>
                <Typography sx={{ fontSize: '11px', color: '#5d5d5d', mt: 0.5 }}>
                  Iron Man / J.A.R.V.I.S.
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Continuous Voice Conversation Toggle */}
          <Box
            sx={{
              p: 1.5,
              borderRadius: '8px',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              bgcolor: settings.continuousMode ? '#fafafa' : '#ffffff',
            }}
          >
            <FormControlLabel
              control={
                <Switch
                  checked={settings.continuousMode}
                  onChange={(e) => handleContinuousToggle(e.target.checked)}
                  color="default"
                  size="small"
                />
              }
              label={
                <Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#0d0d0d' }}>
                    Percakapan Otomatis (Hands-Free)
                  </Typography>
                  <Typography sx={{ fontSize: '11px', color: '#5d5d5d', mt: 0.25 }}>
                    Mikrofon otomatis aktif kembali setelah asisten selesai bicara layaknya percakapan manusia sungguhan.
                  </Typography>
                </Box>
              }
              sx={{ m: 0, alignItems: 'flex-start' }}
            />
          </Box>

          {/* Sliders: Pitch & Rate */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 500, color: '#0d0d0d' }}>
                Tinggi Nada (Pitch): {settings.pitch.toFixed(2)}x
              </Typography>
              <Typography variant="caption" sx={{ color: '#8f8f8f', fontSize: '11px' }}>
                {settings.pitch > 1.2 ? 'Anime / Ceria' : 'Standar'}
              </Typography>
            </Box>
            <Slider
              value={settings.pitch}
              min={0.6}
              max={1.8}
              step={0.05}
              onChange={(_, val) => handleSliderChange('pitch', val as number)}
              sx={{ color: '#0d0d0d' }}
              size="small"
            />
          </Box>

          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 500, color: '#0d0d0d' }}>
                Kecepatan Bicara (Speed): {settings.rate.toFixed(2)}x
              </Typography>
            </Box>
            <Slider
              value={settings.rate}
              min={0.7}
              max={1.5}
              step={0.05}
              onChange={(_, val) => handleSliderChange('rate', val as number)}
              sx={{ color: '#0d0d0d' }}
              size="small"
            />
          </Box>

          {/* Voice Engine selection */}
          {availableVoices.length > 0 && (
            <FormControl fullWidth size="small">
              <InputLabel sx={{ fontSize: '12px' }}>Pilihan Voice Engine Browser</InputLabel>
              <Select
                value={settings.voiceURI}
                label="Pilihan Voice Engine Browser"
                onChange={(e) => handleVoiceURIChange(e.target.value)}
                sx={{ fontSize: '12px', borderRadius: '8px' }}
              >
                <MenuItem value="">
                  <em>Otomatis (Berdasarkan Persona)</em>
                </MenuItem>
                {availableVoices.map((v) => (
                  <MenuItem key={v.voiceURI} value={v.voiceURI} sx={{ fontSize: '12px' }}>
                    {v.name} ({v.lang})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Test Voice Button */}
          <Button
            variant="outlined"
            size="small"
            onClick={handleTestVoice}
            sx={{
              borderColor: 'rgba(0, 0, 0, 0.15)',
              color: '#0d0d0d',
              borderRadius: '8px',
              textTransform: 'none',
              fontSize: '13px',
              fontWeight: 500,
              '&:hover': {
                borderColor: '#0d0d0d',
                bgcolor: 'rgba(0, 0, 0, 0.04)',
              },
            }}
          >
            🔊 Uji Suara Sekarang
          </Button>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2, pb: 1 }}>
        <Button
          onClick={onClose}
          size="small"
          sx={{ color: '#0d0d0d', textTransform: 'none', fontSize: '13px', fontWeight: 500 }}
        >
          Selesai
        </Button>
      </DialogActions>
    </Dialog>
  )
}
