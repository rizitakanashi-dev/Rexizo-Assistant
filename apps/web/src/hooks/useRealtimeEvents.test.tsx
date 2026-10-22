import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const wsState = { value: 'connected' as const }
let capturedOnMessage: ((msg: unknown) => void) | null = null

vi.mock('./useWebSocket', () => ({
  useWebSocket: (options: { onMessage?: (msg: unknown) => void }) => {
    capturedOnMessage = options.onMessage ?? null
    return { state: wsState.value, sendPing: () => {} }
  },
}))

import { useRealtimeEvents } from './useRealtimeEvents'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useRealtimeEvents', () => {
  beforeEach(() => {
    capturedOnMessage = null
    wsState.value = 'connected' as never
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('menyimpan event terakhir dan invalidate query events saat NEW_EVENT', () => {
    const { result } = renderHook(() => useRealtimeEvents(), { wrapper })

    const event = {
      id: 'evt_1',
      camera_id: 'cam_front_door',
      camera_name: 'Front Door',
      event_type: 'motion',
      timestamp: '2026-10-22T06:00:00Z',
      confidence: null,
      metadata: {},
      snapshot_path: null,
      snapshot_url: null,
      is_mock: false,
    }

    act(() => {
      capturedOnMessage?.({ event: 'NEW_EVENT', data: event })
    })

    expect(result.current.latestEvent?.id).toBe('evt_1')
    expect(result.current.latestCameraStatus).toBeNull()
  })

  it('menangani CAMERA_STATUS tanpa menimpa latestEvent', () => {
    const { result } = renderHook(() => useRealtimeEvents(), { wrapper })

    const cameraStatus = {
      camera_id: 'cam_front_door',
      name: 'Front Door',
      status: 'reconnecting',
      fps: 0,
      last_seen_at: null,
      is_mock: false,
    }

    act(() => {
      capturedOnMessage?.({ event: 'CAMERA_STATUS', data: cameraStatus })
    })

    expect(result.current.latestCameraStatus?.status).toBe('reconnecting')
    expect(result.current.latestCameraStatus?.camera_id).toBe('cam_front_door')
    expect(result.current.latestEvent).toBeNull()
  })

  it('mengabaikan PING dan PONG', () => {
    const { result } = renderHook(() => useRealtimeEvents(), { wrapper })

    act(() => {
      capturedOnMessage?.({ event: 'PING' })
      capturedOnMessage?.({ event: 'PONG' })
    })

    expect(result.current.latestEvent).toBeNull()
    expect(result.current.latestCameraStatus).toBeNull()
  })
})
