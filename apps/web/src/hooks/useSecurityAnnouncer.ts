/**
 * Hook Security Announcer (Peringatan Suara & Desktop Otomatis untuk CCTV).
 * Mendengarkan WebSocket real-time event dan memicu pengumuman suara otomatis
 * sesuai persona karakter (Tachibana Nozomi / Butler R.E.X.I.Z.O.).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRealtimeEvents } from './useRealtimeEvents'
import { loadVoiceSettings, playRexizoChime, speakRexizo } from '@/utils/speech'
import { EventItem } from '@/types'

export interface SecurityAnnouncerSettings {
  enabled: boolean
  personOnly: boolean
  voiceAlert: boolean
  desktopAlert: boolean
}

export const DEFAULT_SECURITY_SETTINGS: SecurityAnnouncerSettings = {
  enabled: true,
  personOnly: false,
  voiceAlert: true,
  desktopAlert: true,
}

const SETTINGS_KEY = 'rexizo_security_announcer_settings'

export function loadSecuritySettings(): SecurityAnnouncerSettings {
  if (typeof window === 'undefined') return DEFAULT_SECURITY_SETTINGS
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SECURITY_SETTINGS, ...JSON.parse(raw) }
  } catch {
    // fallback
  }
  return DEFAULT_SECURITY_SETTINGS
}

export function saveSecuritySettings(settings: SecurityAnnouncerSettings) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

export interface SecurityAlert {
  id: string
  camera_id: string
  camera_name: string
  event_type: string
  is_person: boolean
  message: string
  timestamp: string
}

export function useSecurityAnnouncer() {
  const { latestEvent } = useRealtimeEvents()
  const [settings, setSettings] = useState<SecurityAnnouncerSettings>(loadSecuritySettings())
  const [activeAlert, setActiveAlert] = useState<SecurityAlert | null>(null)
  const lastSpokenRef = useRef<Record<string, number>>({})
  const processedEventIdsRef = useRef<Set<string>>(new Set())

  const updateSettings = useCallback((newSettings: Partial<SecurityAnnouncerSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings }
      saveSecuritySettings(updated)
      return updated
    })
  }, [])

  const triggerAlert = useCallback(
    (event: EventItem, isTest = false) => {
      const voiceSettings = loadVoiceSettings()
      const persona = voiceSettings.persona
      const isPerson =
        event.event_type === 'object_detected' ||
        Boolean(
          event.metadata &&
            (event.metadata.label === 'person' ||
              event.metadata.class_name === 'person' ||
              event.metadata.category === 'person')
        )

      if (settings.personOnly && !isPerson && !isTest) {
        return
      }

      // Format teks ucapan sesuai karakter aktif
      let announcement = ''
      if (persona === 'nozomi') {
        if (isPerson) {
          announcement = `Peringatan Sensei! Ada orang terdeteksi di ${event.camera_name}!`
        } else {
          announcement = `Sensei, ada gerakan mencurigakan terdeteksi di ${event.camera_name}!`
        }
      } else {
        if (isPerson) {
          announcement = `Security alert, Sir. An individual has been detected at ${event.camera_name}.`
        } else {
          announcement = `Sir, motion activity has been detected at ${event.camera_name}.`
        }
      }

      const alertData: SecurityAlert = {
        id: event.id || `alert_${Date.now()}`,
        camera_id: event.camera_id,
        camera_name: event.camera_name,
        event_type: event.event_type,
        is_person: isPerson,
        message: announcement,
        timestamp: event.timestamp || new Date().toISOString(),
      }

      setActiveAlert(alertData)

      // Suarakan jika voiceAlert aktif
      if (settings.voiceAlert) {
        playRexizoChime(persona)
        speakRexizo(announcement, voiceSettings)
      }

      // Browser Desktop Notification jika desktopAlert aktif
      if (settings.desktopAlert && typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          try {
            new Notification('Rexizo Security Alert', {
              body: announcement,
              icon: '/favicon.ico',
              tag: `cctv-${event.camera_id}`,
            })
          } catch {
            // ignore
          }
        }
      }
    },
    [settings]
  )

  // Otomatis tangani event baru dari WebSocket
  useEffect(() => {
    if (!latestEvent || !settings.enabled) return
    const eventId = latestEvent.id
    if (!eventId || processedEventIdsRef.current.has(eventId)) return
    processedEventIdsRef.current.add(eventId)

    // Jaga set agar tidak membesar tanpa batas
    if (processedEventIdsRef.current.size > 200) {
      processedEventIdsRef.current.clear()
      processedEventIdsRef.current.add(eventId)
    }

    // Periksa cooldown per kamera (25 detik)
    const now = Date.now()
    const lastSpoken = lastSpokenRef.current[latestEvent.camera_id] || 0
    if (now - lastSpoken < 25000) {
      return
    }
    lastSpokenRef.current[latestEvent.camera_id] = now

    triggerAlert(latestEvent)
  }, [latestEvent, settings.enabled, triggerAlert])

  const dismissAlert = useCallback(() => {
    setActiveAlert(null)
  }, [])

  const testAlert = useCallback(() => {
    const mockEvent: EventItem = {
      id: `mock_test_${Date.now()}`,
      camera_id: 'cam_front',
      camera_name: 'Kamera Depan',
      event_type: 'object_detected',
      timestamp: new Date().toISOString(),
      confidence: 0.94,
      metadata: { label: 'person' },
      snapshot_path: null,
      snapshot_url: null,
      is_mock: false,
    }
    triggerAlert(mockEvent, true)
  }, [triggerAlert])

  return {
    settings,
    updateSettings,
    activeAlert,
    dismissAlert,
    testAlert,
  }
}
