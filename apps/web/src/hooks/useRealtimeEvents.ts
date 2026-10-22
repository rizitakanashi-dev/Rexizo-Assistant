/**
 * Hook realtime events via WebSocket /ws/events.
 *
 * Event baru disisipkan di awal daftar (terbaru di atas).
 * Kembali ke polling REST jika WebSocket tidak tersedia.
 *
 * Autentikasi WS ditangani dev-proxy Vite: header `X-JARVIS-API-KEY` disuntik
 * server-side, sehingga browser tidak pernah memegang secret (ruling C-5).
 */
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWebSocket, type WsReadyState } from './useWebSocket'
import { type CameraStatus, type EventItem } from '@/types'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/events`

/** Payload event `CAMERA_STATUS` (ruling C-2). */
export interface CameraStatusEvent {
  camera_id: string
  name: string
  status: CameraStatus
  fps?: number | null
  last_seen_at?: string | null
  is_mock?: boolean
}

interface WsEventPayload {
  event?: string
  data?: EventItem | CameraStatusEvent
}

export function useRealtimeEvents() {
  const qc = useQueryClient()
  const [latestEvent, setLatestEvent] = useState<EventItem | null>(null)
  const [latestCameraStatus, setLatestCameraStatus] = useState<CameraStatusEvent | null>(null)
  const [wsState, setWsState] = useState<WsReadyState>('connecting')

  const handleMessage = useCallback((msg: WsEventPayload) => {
    if (msg.event === 'PING' || msg.event === 'PONG') return
    if (!msg.data) return

    if (msg.event === 'CAMERA_STATUS') {
      const cameraStatus = msg.data as CameraStatusEvent
      setLatestCameraStatus(cameraStatus)
      // Invalidasi query kamera agar badge status tile ter-update live.
      qc.invalidateQueries({ queryKey: ['cameras'] })
      return
    }

    setLatestEvent(msg.data as EventItem)
    // Invalidate events query so EventsPage re-fetches
    qc.invalidateQueries({ queryKey: ['events'] })
  }, [qc])

  const { state } = useWebSocket<WsEventPayload>({
    url: WS_URL,
    onMessage: handleMessage,
  })

  // Sync ws state to local state for external consumption
  if (state !== wsState) setWsState(state)

  return { wsState, latestEvent, latestCameraStatus }
}
