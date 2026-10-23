/**
 * JARVIS Audio & Speech Synthesis / Recognition Utilities
 * Memberikan pengalaman suara interaktif khas J.A.R.V.I.S. (Iron Man)
 * langsung di peramban tanpa dependensi eksternal.
 */

// Web Audio API Sound Chime
export function playJarvisChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const now = ctx.currentTime

    // Oscillator 1 (D5 - 587.33 Hz)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(587.33, now)
    gain1.gain.setValueAtTime(0.04, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)

    // Oscillator 2 (A5 - 880 Hz harmonic)
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
  } catch {
    // Ignore audio context autoplay restriction or unsupported
  }
}

// Text-to-Speech (JARVIS Butler voice)
export function speakJarvis(text: string, onEnd?: () => void) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.()
    return
  }

  try {
    window.speechSynthesis.cancel()

    // Clean markdown/bullet points for smoother speech
    const cleanText = text
      .replace(/[*_#`~]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim()

    if (!cleanText) {
      onEnd?.()
      return
    }

    const utterance = new SpeechSynthesisUtterance(cleanText)
    const voices = window.speechSynthesis.getVoices()

    // Prefer British English voice for the authentic JARVIS tone if available
    const britishVoice = voices.find(
      (v) =>
        v.lang.includes('en-GB') ||
        v.name.toLowerCase().includes('british') ||
        v.name.toLowerCase().includes('uk english') ||
        v.name.toLowerCase().includes('daniel')
    )
    const indonesianVoice = voices.find((v) => v.lang.includes('id'))
    const englishVoice = voices.find((v) => v.lang.startsWith('en'))

    // Pick suitable voice based on text or availability
    const containsIndonesian = /\b(kamera|sistem|terdaftar|perangkat|aktif|laporkan|siang|pagi|malam|halo)\b/i.test(text)
    if (containsIndonesian && indonesianVoice) {
      utterance.voice = indonesianVoice
      utterance.rate = 1.0
      utterance.pitch = 0.95
    } else if (britishVoice) {
      utterance.voice = britishVoice
      utterance.rate = 1.02
      utterance.pitch = 0.95
    } else if (englishVoice) {
      utterance.voice = englishVoice
      utterance.rate = 1.02
      utterance.pitch = 0.95
    }

    utterance.onend = () => onEnd?.()
    utterance.onerror = () => onEnd?.()

    window.speechSynthesis.speak(utterance)
  } catch {
    onEnd?.()
  }
}

export function stopJarvisSpeech() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

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
        // already started
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
