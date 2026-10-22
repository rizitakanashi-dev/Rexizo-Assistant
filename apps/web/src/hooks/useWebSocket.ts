/**
 * Hook WebSocket generik untuk /ws/events.
 * State: connecting → connected → disconnected → reconnecting
 */
import { useEffect, useRef, useState } from 'react'

export type WsReadyState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

interface UseWebSocketOptions<T> {
  url: string
  /** Callback dipanggil setiap pesan JSON valid diterima */
  onMessage?: (data: T) => void
  /** Maksimum upaya reconnect (0 = unlimited) */
  maxRetries?: number
  /** Delay awal reconnect ms; digandakan tiap gagal, max 30s */
  baseDelayMs?: number
  /** Nonaktifkan koneksi (untuk dev saat backend mati) */
  enabled?: boolean
}

export function useWebSocket<T = unknown>({
  url,
  onMessage,
  maxRetries = 0,
  baseDelayMs = 1000,
  enabled = true,
}: UseWebSocketOptions<T>) {
  const [state, setState] = useState<WsReadyState>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const delayRef = useRef(baseDelayMs)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setState('disconnected')
      return
    }

    let cancelled = false

    function connect() {
      if (cancelled) return
      const ws = new WebSocket(url)
      wsRef.current = ws
      setState(retriesRef.current === 0 ? 'connecting' : 'reconnecting')

      ws.onopen = () => {
        if (cancelled) { ws.close(); return }
        retriesRef.current = 0
        delayRef.current = baseDelayMs
        setState('connected')
      }

      ws.onmessage = (ev) => {
        if (cancelled) return
        try {
          const data = JSON.parse(ev.data as string) as T
          onMessageRef.current?.(data)
        } catch {
          // ignore non-JSON (e.g. PING/PONG text)
        }
      }

      ws.onerror = () => {
        // onclose will fire after
      }

      ws.onclose = () => {
        if (cancelled) return
        wsRef.current = null
        setState('disconnected')
        if (maxRetries > 0 && retriesRef.current >= maxRetries) return
        retriesRef.current += 1
        const delay = Math.min(delayRef.current * 2, 30000)
        delayRef.current = delay
        setState('reconnecting')
        timerRef.current = setTimeout(() => {
          if (!cancelled && mountedRef.current) connect()
        }, delay)
      }
    }

    connect()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled])

  function sendPing() {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send('ping')
    }
  }

  return { state, sendPing }
}
