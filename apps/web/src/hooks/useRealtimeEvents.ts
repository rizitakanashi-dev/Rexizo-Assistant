/**
 * Hook realtime events via WebSocket /ws/events.
 * Event baru disisipkan di awal daftar (terbaru di atas).
 * Kembali ke polling REST jika WebSocket tidak tersedia.
 */
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWebSocket, type WsReadyState } from './useWebSocket'
import { type EventItem } from '@/types'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/events`

interface WsEventPayload {
  event?: string
  data?: EventItem
}

export function useRealtimeEvents() {
  const qc = useQueryClient()
  const [latestEvent, setLatestEvent] = useState<EventItem | null>(null)
  const [wsState, setWsState] = useState<WsReadyState>('connecting')

  const handleMessage = useCallback((msg: WsEventPayload) => {
    if (msg.event === 'PING' || msg.event === 'PONG') return
    if (msg.data) {
      setLatestEvent(msg.data)
      // Invalidate events query so EventsPage re-fetches
      qc.invalidateQueries({ queryKey: ['events'] })
    }
  }, [qc])

  const { state } = useWebSocket<WsEventPayload>({
    url: WS_URL,
    onMessage: handleMessage,
  })

  // Sync ws state to local state for external consumption
  if (state !== wsState) setWsState(state)

  return { wsState, latestEvent }
}
