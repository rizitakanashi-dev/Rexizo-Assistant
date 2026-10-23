/**
 * Rexizo Audio & Speech Synthesis / Recognition Engine
 * Mendukung kustomisasi suara anime Tachibana Nozomi (Blue Archive),
 * J.A.R.V.I.S. butler, custom Web Speech API, dan continuous voice conversation.
 */

export type VoicePersona = 'nozomi' | 'rexizo' | 'custom'

export interface VoiceSettings {
  persona: VoicePersona
  voiceURI: string
  pitch: number
  rate: number
  volume: number
  continuousMode: boolean
  customTtsUrl?: string
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  persona: 'nozomi',
  voiceURI: '',
  pitch: 1.35,
  rate: 1.05,
  volume: 1.0,
  continuousMode: false,
}

export function loadVoiceSettings(): VoiceSettings {
  if (typeof window === 'undefined') return DEFAULT_VOICE_SETTINGS
  try {
    const raw = localStorage.getItem('rexizo_voice_settings')
    if (raw) return { ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(raw) }
  } catch {
    // fallback
  }
  return DEFAULT_VOICE_SETTINGS
}

export function saveVoiceSettings(settings: VoiceSettings) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('rexizo_voice_settings', JSON.stringify(settings))
  } catch {
    // ignore
  }
}

// Web Audio API Sound Chimes
export function playRexizoChime(persona: VoicePersona = 'nozomi') {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const now = ctx.currentTime

    if (persona === 'nozomi') {
      // 🌸 Sparkle Anime Chime (G5 -> C6 -> E6 harmonic triad)
      const notes = [783.99, 1046.5, 1318.51]
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, now + idx * 0.06)
        gain.gain.setValueAtTime(0.001, now)
        gain.gain.setValueAtTime(0.04, now + idx * 0.06)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.35)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + idx * 0.06)
        osc.stop(now + idx * 0.06 + 0.36)
      })
    } else {
      // 🎩 Holographic Butler HUD Chime (D5 -> A5)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(587.33, now)
      gain1.gain.setValueAtTime(0.04, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(880, now + 0.08)
      gain2.gain.setValueAtTime(0.001, now)
      gain2.gain.setValueAtTime(0.05, now + 0.08)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)

      osc1.start(now)
      osc1.stop(now + 0.26)
      osc2.start(now + 0.08)
      osc2.stop(now + 0.36)
    }
  } catch {
    // Ignore audio context autoplay restriction
  }
}

// Text-to-Speech Engine
export function speakRexizo(
  text: string,
  options?: Partial<VoiceSettings>,
  onEnd?: () => void
) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.()
    return
  }

  try {
    window.speechSynthesis.cancel()

    // Clean text for speech
    const cleanText = text
      .replace(/[*_#`~>]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .trim()

    if (!cleanText) {
      onEnd?.()
      return
    }

    const currentSettings = { ...loadVoiceSettings(), ...options }
    const utterance = new SpeechSynthesisUtterance(cleanText)
    const voices = window.speechSynthesis.getVoices()

    let selectedVoice: SpeechSynthesisVoice | undefined

    if (currentSettings.voiceURI) {
      selectedVoice = voices.find((v) => v.voiceURI === currentSettings.voiceURI)
    }

    if (!selectedVoice) {
      if (currentSettings.persona === 'nozomi') {
        // Tachibana Nozomi prefers Japanese anime-friendly voices or high clear female voice
        const jaVoice = voices.find(
          (v) =>
            v.lang.startsWith('ja') ||
            v.name.includes('Japanese') ||
            v.name.includes('Kyoko') ||
            v.name.includes('Nanami') ||
            v.name.includes('Otoya')
        )
        const femaleVoice = voices.find(
          (v) =>
            (v.name.toLowerCase().includes('female') ||
              v.name.toLowerCase().includes('girl') ||
              v.name.toLowerCase().includes('samantha') ||
              v.name.toLowerCase().includes('victoria') ||
              v.name.toLowerCase().includes('zira')) &&
            !v.name.toLowerCase().includes('male')
        )
        const idVoice = voices.find((v) => v.lang.startsWith('id'))
        selectedVoice = jaVoice || femaleVoice || idVoice || voices[0]
      } else if (currentSettings.persona === 'rexizo') {
        // Rexizo butler voice
        const britishVoice = voices.find(
          (v) =>
            v.lang.includes('en-GB') ||
            v.name.toLowerCase().includes('british') ||
            v.name.toLowerCase().includes('uk english') ||
            v.name.toLowerCase().includes('daniel')
        )
        const idVoice = voices.find((v) => v.lang.includes('id'))
        selectedVoice = britishVoice || idVoice || voices[0]
      } else {
        selectedVoice = voices[0]
      }
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice
    }

    // Set pitch & rate based on persona
    if (currentSettings.persona === 'nozomi') {
      utterance.pitch = currentSettings.pitch ?? 1.35
      utterance.rate = currentSettings.rate ?? 1.05
    } else if (currentSettings.persona === 'rexizo') {
      utterance.pitch = currentSettings.pitch ?? 0.95
      utterance.rate = currentSettings.rate ?? 1.02
    } else {
      utterance.pitch = currentSettings.pitch ?? 1.0
      utterance.rate = currentSettings.rate ?? 1.0
    }

    utterance.volume = currentSettings.volume ?? 1.0

    utterance.onend = () => onEnd?.()
    utterance.onerror = () => onEnd?.()

    window.speechSynthesis.speak(utterance)
  } catch {
    onEnd?.()
  }
}

export function stopRexizoSpeech() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

export const playJarvisChime = playRexizoChime
export const speakJarvis = speakRexizo
export const stopJarvisSpeech = stopRexizoSpeech

// Speech Recognition (Voice Input)
export interface SpeechRecognitionController {
  start: () => void
  stop: () => void
  isSupported: boolean
}

export function createSpeechRecognizer(
  onResult: (text: string) => void,
  onEnd: () => void,
  onError?: (error: unknown) => void
): SpeechRecognitionController {
  if (typeof window === 'undefined') {
    return { start: () => {}, stop: () => {}, isSupported: false }
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  if (!SpeechRecognition) {
    return { start: () => {}, stop: () => {}, isSupported: false }
  }

  const recognition = new SpeechRecognition()
  recognition.continuous = false
  recognition.interimResults = false
  recognition.lang = navigator.language || 'id-ID'

  recognition.onresult = (event: any) => {
    const transcript = event.results[0]?.[0]?.transcript || ''
    if (transcript) {
      onResult(transcript)
    }
  }

  recognition.onend = () => {
    onEnd()
  }

  recognition.onerror = (err: any) => {
    onError?.(err)
    onEnd()
  }

  return {
    start: () => {
      try {
        recognition.start()
      } catch {
        // already active
      }
    },
    stop: () => {
      try {
        recognition.stop()
      } catch {
        // already stopped
      }
    },
    isSupported: true,
  }
}
