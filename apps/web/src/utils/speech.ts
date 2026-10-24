/**
 * Rexizo Audio & Speech Synthesis / Recognition Engine
 * Mendukung kustomisasi suara anime Tachibana Nozomi (Blue Archive),
 * J.A.R.V.I.S. butler, Web Audio API bebas blokir autoplay,
 * serta Voice Input (MediaRecorder + Backend STT) yang 100% kompatibel di Brave & Arch Linux.
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

// Shared Web Audio API Context (tetap unlocked setelah interaksi pertama user)
let sharedAudioCtx: AudioContext | null = null
let currentBufferSource: AudioBufferSourceNode | null = null
let currentAudioInstance: HTMLAudioElement | null = null
let activeSpeechAbort: AbortController | null = null
let outputAnalyserNode: AnalyserNode | null = null
let inputAnalyserNode: AnalyserNode | null = null

export interface VoiceVisualizerMetrics {
  isSpeaking: boolean
  isListening: boolean
  volume: number // 0.0 sampai 1.0 (amplitudo suara dinamis)
  frequencies: Uint8Array // 16 pita frekuensi untuk bar waveform visualizer
}

const DEFAULT_METRICS: VoiceVisualizerMetrics = {
  isSpeaking: false,
  isListening: false,
  volume: 0,
  frequencies: new Uint8Array(16),
}

export function getVoiceVisualizerMetrics(): VoiceVisualizerMetrics {
  const isSpeaking = Boolean(currentBufferSource || currentAudioInstance)
  const isListening = Boolean(inputAnalyserNode)

  const activeAnalyser = isSpeaking ? outputAnalyserNode : inputAnalyserNode
  if (!activeAnalyser) {
    return { ...DEFAULT_METRICS, isSpeaking, isListening }
  }

  const freqArray = new Uint8Array(activeAnalyser.frequencyBinCount)
  activeAnalyser.getByteFrequencyData(freqArray)

  let sum = 0
  const sampleCount = Math.min(freqArray.length, 48)
  for (let i = 2; i < sampleCount; i++) {
    sum += freqArray[i]
  }
  const avg = sampleCount > 2 ? sum / (sampleCount - 2) : 0
  const normalizedVol = Math.min(1.0, Math.max(0.0, avg / 130.0))

  const bars = new Uint8Array(16)
  const step = Math.max(1, Math.floor(sampleCount / 16))
  for (let b = 0; b < 16; b++) {
    bars[b] = freqArray[b * step + 2] || 0
  }

  return {
    isSpeaking,
    isListening,
    volume: normalizedVol,
    frequencies: bars,
  }
}

export function getUnlockedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContextClass()
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {})
    }
    return sharedAudioCtx
  } catch {
    return null
  }
}

// Auto-unlock AudioContext pada klik atau ketikan pertama di halaman
if (typeof window !== 'undefined') {
  const unlockHandler = () => {
    const ctx = getUnlockedAudioContext()
    if (ctx && ctx.state === 'running') {
      window.removeEventListener('pointerdown', unlockHandler)
      window.removeEventListener('keydown', unlockHandler)
    }
  }
  window.addEventListener('pointerdown', unlockHandler, { passive: true })
  window.addEventListener('keydown', unlockHandler, { passive: true })
}

// Web Audio API Sound Chimes
export function playRexizoChime(persona: VoicePersona = 'nozomi') {
  try {
    const ctx = getUnlockedAudioContext()
    if (!ctx) return
    const now = ctx.currentTime

    if (persona === 'nozomi') {
      // Sparkle Anime Chime (G5 -> C6 -> E6 harmonic triad)
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
      // Holographic Butler HUD Chime (D5 -> A5)
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

function cleanTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#`~>]/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1FA00}-\u{1FAFF}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Text-to-Speech Engine (Menggunakan Web Audio API agar tidak pernah diblokir autoplay setelah delay LLM)
export function speakRexizo(
  text: string,
  options?: Partial<VoiceSettings>,
  onEnd?: () => void
) {
  if (typeof window === 'undefined') {
    onEnd?.()
    return
  }

  stopRexizoSpeech()

  const cleanText = cleanTextForSpeech(text)
  if (!cleanText) {
    onEnd?.()
    return
  }

  const currentSettings = { ...loadVoiceSettings(), ...options }

  // Gunakan backend Neural Audio TTS (Nozomi calibrated) secara default
  if (!currentSettings.voiceURI) {
    const abortCtrl = new AbortController()
    activeSpeechAbort = abortCtrl
    const params = new URLSearchParams({
      text: cleanText,
      persona: currentSettings.persona,
      pitch: String(currentSettings.pitch ?? 1.35),
      rate: String(currentSettings.rate ?? 1.05),
    })
    const ttsUrl = `/api/v1/chat/tts?${params.toString()}`

    ;(async () => {
      try {
        const res = await fetch(ttsUrl, { signal: abortCtrl.signal })
        if (!res.ok) throw new Error(`TTS HTTP ${res.status}`)
        const arrayBuf = await res.arrayBuffer()
        if (abortCtrl.signal.aborted || arrayBuf.byteLength < 64) {
          onEnd?.()
          return
        }

        // Putar melalui sharedAudioCtx (bebas blokir autoplay walau respons LLM > 5 detik)
        const ctx = getUnlockedAudioContext()
        if (ctx) {
          try {
            if (ctx.state === 'suspended') {
              await ctx.resume()
            }
            const audioBuffer = await ctx.decodeAudioData(arrayBuf.slice(0))
            if (abortCtrl.signal.aborted) {
              onEnd?.()
              return
            }
            const source = ctx.createBufferSource()
            const gainNode = ctx.createGain()
            gainNode.gain.value = Math.max(0.1, Math.min(2.0, currentSettings.volume ?? 1.0))
            if (!outputAnalyserNode || outputAnalyserNode.context !== ctx) {
              outputAnalyserNode = ctx.createAnalyser()
              outputAnalyserNode.fftSize = 256
              outputAnalyserNode.smoothingTimeConstant = 0.8
            }
            source.buffer = audioBuffer
            source.connect(gainNode)
            gainNode.connect(outputAnalyserNode)
            outputAnalyserNode.connect(ctx.destination)
            currentBufferSource = source
            source.onended = () => {
              if (currentBufferSource === source) {
                currentBufferSource = null
              }
              onEnd?.()
            }
            source.start(0)
            return
          } catch (decodeErr) {
            console.warn('WebAudio decode fallback ke HTML5 Audio:', decodeErr)
          }
        }

        // Fallback ke HTML5 Audio Blob
        const blob = new Blob([arrayBuf], { type: res.headers.get('content-type') || 'audio/mpeg' })
        const blobUrl = URL.createObjectURL(blob)
        const audio = new Audio(blobUrl)
        audio.volume = Math.max(0.1, Math.min(1.0, currentSettings.volume ?? 1.0))
        currentAudioInstance = audio
        const cleanup = () => {
          URL.revokeObjectURL(blobUrl)
          if (currentAudioInstance === audio) currentAudioInstance = null
        }
        audio.onended = () => {
          cleanup()
          onEnd?.()
        }
        audio.onerror = () => {
          cleanup()
          speakWithBrowserSynthesis(cleanText, currentSettings, onEnd)
        }
        await audio.play()
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return
        }
        console.warn('Backend TTS gagal, beralih ke browser speechSynthesis:', err)
        speakWithBrowserSynthesis(cleanText, currentSettings, onEnd)
      }
    })()
    return
  }

  speakWithBrowserSynthesis(cleanText, currentSettings, onEnd)
}

function speakWithBrowserSynthesis(
  cleanText: string,
  currentSettings: VoiceSettings,
  onEnd?: () => void
) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnd?.()
      return
    }
    const voices = window.speechSynthesis.getVoices()
    const utterance = new SpeechSynthesisUtterance(cleanText)

    let selectedVoice: SpeechSynthesisVoice | undefined
    if (currentSettings.voiceURI) {
      selectedVoice = voices.find((v) => v.voiceURI === currentSettings.voiceURI)
    }

    if (!selectedVoice) {
      if (currentSettings.persona === 'nozomi') {
        const jaVoice = voices.find(
          (v) =>
            v.lang.startsWith('ja') ||
            v.name.includes('Japanese') ||
            v.name.includes('Kyoko') ||
            v.name.includes('Nanami')
        )
        const idVoice = voices.find((v) => v.lang.startsWith('id'))
        selectedVoice = jaVoice || idVoice || voices[0]
      } else {
        const idVoice = voices.find((v) => v.lang.includes('id'))
        selectedVoice = idVoice || voices[0]
      }
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice
    }
    utterance.pitch = currentSettings.pitch ?? (currentSettings.persona === 'nozomi' ? 1.35 : 0.95)
    utterance.rate = currentSettings.rate ?? (currentSettings.persona === 'nozomi' ? 1.05 : 1.02)
    utterance.volume = currentSettings.volume ?? 1.0
    utterance.onend = () => onEnd?.()
    utterance.onerror = () => onEnd?.()

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume()
    }
    window.speechSynthesis.speak(utterance)
  } catch {
    onEnd?.()
  }
}

export function stopRexizoSpeech() {
  if (activeSpeechAbort) {
    try {
      activeSpeechAbort.abort()
    } catch {
      // ignore
    }
    activeSpeechAbort = null
  }
  if (currentBufferSource) {
    try {
      currentBufferSource.onended = null
      currentBufferSource.stop()
      currentBufferSource.disconnect()
    } catch {
      // ignore
    }
    currentBufferSource = null
  }
  if (currentAudioInstance) {
    try {
      currentAudioInstance.pause()
      currentAudioInstance.currentTime = 0
    } catch {
      // ignore
    }
    currentAudioInstance = null
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
  }
}

export const playJarvisChime = playRexizoChime
export const speakJarvis = speakRexizo
export const stopJarvisSpeech = stopRexizoSpeech

// Speech Recognition (Voice Input) — MediaRecorder + VAD + Backend STT (/api/v1/chat/stt)
// Bekerja 100% di Brave Browser, Chromium, dan Firefox di Arch Linux tanpa terputus otomatis.
export interface SpeechRecognitionController {
  start: () => void
  stop: () => void
  isSupported: boolean
}

export function createSpeechRecognizer(
  onResult: (text: string) => void,
  onEnd: () => void,
  onError?: (error: string) => void
): SpeechRecognitionController {
  if (typeof window === 'undefined') {
    return { start: () => {}, stop: () => {}, isSupported: false }
  }

  const hasMediaDevices = Boolean(
    navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'
  )
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  const isSupported = hasMediaDevices || Boolean(SpeechRecognition)
  if (!isSupported) {
    return { start: () => {}, stop: () => {}, isSupported: false }
  }

  let mediaRecorder: MediaRecorder | null = null
  let mediaStream: MediaStream | null = null
  let vadInterval: ReturnType<typeof setInterval> | null = null
  let maxDurationTimer: ReturnType<typeof setTimeout> | null = null
  let isRecording = false

  const cleanupMedia = () => {
    inputAnalyserNode = null
    if (vadInterval) {
      clearInterval(vadInterval)
      vadInterval = null
    }
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer)
      maxDurationTimer = null
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {
          // ignore
        }
      })
      mediaStream = null
    }
    mediaRecorder = null
    isRecording = false
  }

  const startMediaRecorderStt = async () => {
    if (isRecording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      mediaStream = stream
      isRecording = true

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg')
            ? 'audio/ogg'
            : ''

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRecorder = recorder
      const chunks: BlobPart[] = []

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunks.push(ev.data)
        }
      }

      recorder.onstop = async () => {
        cleanupMedia()
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
        if (blob.size < 200) {
          onEnd()
          return
        }
        try {
          const resp = await fetch('/api/v1/chat/stt?lang=id-ID', {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'application/octet-stream' },
            body: blob,
          })
          if (resp.ok) {
            const data = (await resp.json()) as { text?: string }
            const transcript = (data.text || '').trim()
            if (transcript) {
              onResult(transcript)
            } else {
              onError?.('no-speech')
            }
          } else {
            onError?.('stt-server-error')
          }
        } catch (err) {
          console.warn('Backend STT error:', err)
          onError?.('network')
        } finally {
          onEnd()
        }
      }

      recorder.start(200)

      // Deteksi keheningan otomatis (Voice Activity Detection) via Web Audio AnalyserNode
      const ctx = getUnlockedAudioContext()
      if (ctx) {
        try {
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 256
          analyser.smoothingTimeConstant = 0.75
          source.connect(analyser)
          inputAnalyserNode = analyser
          const dataArray = new Uint8Array(analyser.fftSize)
          let hasSpoken = false
          let lastSpeechTime = Date.now()
          const startedAt = Date.now()

          vadInterval = setInterval(() => {
            if (!isRecording || !mediaRecorder || mediaRecorder.state !== 'recording') return
            analyser.getByteTimeDomainData(dataArray)
            let sumSquares = 0
            for (let i = 0; i < dataArray.length; i++) {
              const norm = (dataArray[i] - 128) / 128
              sumSquares += norm * norm
            }
            const rms = Math.sqrt(sumSquares / dataArray.length)
            const now = Date.now()

            if (rms > 0.02) {
              hasSpoken = true
              lastSpeechTime = now
            } else if (hasSpoken && now - lastSpeechTime > 1600) {
              // Otomatis berhenti & transkripsi setelah 1.6 detik hening usai berbicara
              if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop()
              }
            } else if (!hasSpoken && now - startedAt > 8000) {
              // Otomatis berhenti jika 8 detik tidak ada suara sama sekali
              if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop()
              }
            }
          }, 100)
        } catch {
          // Abaikan jika analyser gagal
        }
      }

      // Batas maksimum 15 detik per rekaman kalimat
      maxDurationTimer = setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop()
        }
      }, 15000)
    } catch (err: any) {
      cleanupMedia()
      const name = err?.name || ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        onError?.('not-allowed')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        onError?.('audio-capture')
      } else {
        onError?.(err?.message || 'mic-error')
      }
      onEnd()
    }
  }

  return {
    start: () => {
      if (hasMediaDevices) {
        startMediaRecorderStt()
      }
    },
    stop: () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        try {
          mediaRecorder.stop()
        } catch {
          cleanupMedia()
          onEnd()
        }
      } else {
        cleanupMedia()
        onEnd()
      }
    },
    isSupported: true,
  }
}
