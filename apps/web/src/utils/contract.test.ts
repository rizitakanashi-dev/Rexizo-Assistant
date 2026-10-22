import { describe, expect, it } from 'vitest'
import { displayToolName, getToolName, mapAiState, mapErrorCode, mapToolStatus } from './contract'

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
