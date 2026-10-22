import { describe, expect, it } from 'vitest'
import {
  displayToolName,
  getToolName,
  mapAiState,
  mapCameraStatus,
  mapErrorCode,
  mapToolStatus,
  resolveEventSnapshot,
} from './contract'

describe('contract utils', () => {
  it('mapErrorCode handles uppercase and lowercase aliases', () => {
    expect(mapErrorCode('AI_RATE_LIMITED').retryable).toBe(false)
    expect(mapErrorCode('llm_quota_exceeded').retryable).toBe(false)
    expect(mapErrorCode('AI_TIMEOUT').retryable).toBe(true)
    expect(mapErrorCode('llm_timeout').retryable).toBe(true)
    expect(mapErrorCode('AI_DISABLED').retryable).toBe(false)
    expect(mapErrorCode('ai_disabled').retryable).toBe(false)
  })

  it('mapAiState derives from health and systemStatus', () => {
    expect(mapAiState({ components: { llm_service: 'mock' } }, null)).toBe('not_configured')
    expect(mapAiState({ components: { llm_service: 'unavailable' } }, { ai: { enabled: true, degraded: false } })).toBe('unavailable')
    expect(mapAiState(null, { ai: { enabled: false, degraded: false } })).toBe('disabled')
    expect(mapAiState({ components: { llm_service: 'available' } }, { ai: { enabled: true, degraded: false } })).toBe('available')
  })

  it('displayToolName and mapToolStatus normalize actual backend values', () => {
    expect(displayToolName('get_camera_list')).toBe('Daftar kamera')
    expect(displayToolName('list_cameras')).toBe('Daftar kamera')
    expect(mapToolStatus('ok').color).toBe('success')
    expect(mapToolStatus('denied').color).toBe('warning')
    expect(mapToolStatus('error').color).toBe('error')
  })

  it('getToolName prefers tool_name over name', () => {
    expect(getToolName({ tool_name: 'get_camera_list', name: 'x', status: 'ok' })).toBe('get_camera_list')
  })
})

describe('mapAiState — ruling G-7 / G-8', () => {
  it('memakai ai.state backend sebagai sumber otoritatif', () => {
    expect(
      mapAiState(
        { components: { llm_service: 'available' } },
        { ai: { enabled: true, degraded: false, state: 'not_configured' } },
      ),
    ).toBe('not_configured')

    expect(
      mapAiState(
        { components: { llm_service: 'available' } },
        { ai: { enabled: true, degraded: true, state: 'degraded' } },
      ),
    ).toBe('degraded')

    expect(
      mapAiState(null, { ai: { enabled: false, degraded: false, state: 'disabled' } }),
    ).toBe('disabled')

    expect(
      mapAiState(null, { ai: { enabled: true, degraded: false, state: 'unavailable' } }),
    ).toBe('unavailable')
  })

  it('membaca not_configured dan disabled dari components.llm_service', () => {
    expect(mapAiState({ components: { llm_service: 'not_configured' } }, null)).toBe('not_configured')
    expect(mapAiState({ components: { llm_service: 'disabled' } }, null)).toBe('disabled')
    expect(mapAiState({ components: { llm_service: 'degraded' } }, null)).toBe('degraded')
    expect(mapAiState({ components: { llm_service: 'available' } }, null)).toBe('available')
    expect(mapAiState({ components: { llm_service: 'unavailable' } }, null)).toBe('unavailable')
  })

  it('tetap menerima mock sebagai alias legacy not_configured', () => {
    expect(mapAiState({ components: { llm_service: 'mock' } }, null)).toBe('not_configured')
  })

  it('fallback ke heuristik bila backend belum mengirim state', () => {
    expect(mapAiState(null, { ai: { enabled: true, degraded: false } })).toBe('available')
    expect(mapAiState(null, { ai: { enabled: true, degraded: true } })).toBe('degraded')
    expect(mapAiState(null, null)).toBe('degraded')
  })
})

describe('mapToolStatus — ruling G-2', () => {
  it('memetakan status kanonik success', () => {
    const res = mapToolStatus('success')
    expect(res.color).toBe('success')
    expect(res.label).toBe('Berhasil')
  })

  it('memetakan invalid_arguments dan timeout', () => {
    expect(mapToolStatus('invalid_arguments').color).toBe('warning')
    expect(mapToolStatus('invalid_arguments').label).toBe('Argumen tidak valid')
    expect(mapToolStatus('timeout').color).toBe('warning')
    expect(mapToolStatus('timeout').label).toBe('Timeout')
  })

  it('tetap menerima ok sebagai alias legacy success', () => {
    expect(mapToolStatus('ok').color).toBe('success')
  })

  it('menandai denied dan error dengan warna yang benar', () => {
    expect(mapToolStatus('denied').color).toBe('warning')
    expect(mapToolStatus('error').color).toBe('error')
  })
})

describe('resolveEventSnapshot — ruling C-8', () => {
  it('memprioritaskan snapshot_url', () => {
    expect(
      resolveEventSnapshot({
        snapshot_url: '/api/v1/events/evt_1/snapshot',
        snapshot_path: '/api/v1/events/evt_legacy/snapshot',
      }),
    ).toBe('/api/v1/events/evt_1/snapshot')
  })

  it('fallback ke snapshot_path bila snapshot_url kosong', () => {
    expect(
      resolveEventSnapshot({
        snapshot_url: null,
        snapshot_path: '/api/v1/events/evt_2/snapshot',
      }),
    ).toBe('/api/v1/events/evt_2/snapshot')
  })

  it('mengembalikan null bila keduanya kosong', () => {
    expect(resolveEventSnapshot({ snapshot_url: null, snapshot_path: null })).toBeNull()
    expect(resolveEventSnapshot(null)).toBeNull()
    expect(resolveEventSnapshot(undefined)).toBeNull()
  })

  it('memakai resolveMediaPath untuk path relatif dan absolut', () => {
    expect(resolveEventSnapshot({ snapshot_url: 'events/evt_3/snapshot' })).toBe('/events/evt_3/snapshot')
    expect(resolveEventSnapshot({ snapshot_url: 'https://cdn.example/evt.jpg' })).toBe(
      'https://cdn.example/evt.jpg',
    )
  })
})

describe('mapCameraStatus — ruling C-2', () => {
  it('menangani reconnecting secara terpisah dari connecting dan offline', () => {
    const reconnecting = mapCameraStatus('reconnecting')
    expect(reconnecting.label).toBe('Menghubungkan kembali')
    expect(reconnecting.color).toBe('warning')

    const connecting = mapCameraStatus('connecting')
    expect(connecting.label).toBe('Menghubungkan')
    expect(connecting.color).toBe('info')
    expect(connecting.label).not.toBe(reconnecting.label)
    expect(connecting.color).not.toBe(reconnecting.color)

    const offline = mapCameraStatus('offline')
    expect(offline.label).toBe('Offline')
    expect(offline.color).toBe('error')
  })

  it('memetakan status kanonik lainnya', () => {
    expect(mapCameraStatus('online')).toEqual({ label: 'Online', color: 'success' })
    expect(mapCameraStatus('error')).toEqual({ label: 'Kesalahan', color: 'error' })
  })

  it('aman untuk status yang tidak dikenal', () => {
    expect(mapCameraStatus(null)).toEqual({ label: 'Tidak diketahui', color: 'default' })
    expect(mapCameraStatus('entah')).toEqual({ label: 'entah', color: 'default' })
  })
})
