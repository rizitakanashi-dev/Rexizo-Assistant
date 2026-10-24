import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SECURITY_SETTINGS,
  loadSecuritySettings,
  saveSecuritySettings,
  useSecurityAnnouncer,
} from './useSecurityAnnouncer'

const storageMock: Record<string, string> = {}

beforeEach(() => {
  for (const key in storageMock) {
    delete storageMock[key]
  }
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn((key: string) => storageMock[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        storageMock[key] = String(val)
      }),
      removeItem: vi.fn((key: string) => {
        delete storageMock[key]
      }),
      clear: vi.fn(() => {
        for (const key in storageMock) {
          delete storageMock[key]
        }
      }),
    },
    writable: true,
  })
})

const mockLatestEvent = vi.fn()

vi.mock('./useRealtimeEvents', () => ({
  useRealtimeEvents: () => ({
    latestEvent: mockLatestEvent(),
  }),
}))

vi.mock('@/utils/speech', () => ({
  loadVoiceSettings: () => ({
    persona: 'nozomi',
    volume: 1.0,
    pitch: 1.35,
    rate: 1.05,
    voiceURI: '',
    continuousMode: false,
  }),
  playRexizoChime: vi.fn(),
  speakRexizo: vi.fn(),
}))

describe('useSecurityAnnouncer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLatestEvent.mockReturnValue(null)
  })

  it('memuat default settings jika localStorage kosong', () => {
    const settings = loadSecuritySettings()
    expect(settings).toEqual(DEFAULT_SECURITY_SETTINGS)
  })

  it('menyimpan dan memuat settings kustom dari localStorage', () => {
    saveSecuritySettings({
      enabled: false,
      personOnly: true,
      voiceAlert: false,
      desktopAlert: false,
    })
    const loaded = loadSecuritySettings()
    expect(loaded.enabled).toBe(false)
    expect(loaded.personOnly).toBe(true)
  })

  it('memicu alert saat testAlert dipanggil', () => {
    const { result } = renderHook(() => useSecurityAnnouncer())

    expect(result.current.activeAlert).toBeNull()

    act(() => {
      result.current.testAlert()
    })

    expect(result.current.activeAlert).not.toBeNull()
    expect(result.current.activeAlert?.camera_name).toBe('Kamera Depan')
    expect(result.current.activeAlert?.message).toContain('Peringatan Sensei')
  })

  it('dapat menutup alert aktif menggunakan dismissAlert', () => {
    const { result } = renderHook(() => useSecurityAnnouncer())

    act(() => {
      result.current.testAlert()
    })
    expect(result.current.activeAlert).not.toBeNull()

    act(() => {
      result.current.dismissAlert()
    })
    expect(result.current.activeAlert).toBeNull()
  })

  it('dapat memperbarui pengaturan announcer via updateSettings', () => {
    const { result } = renderHook(() => useSecurityAnnouncer())

    act(() => {
      result.current.updateSettings({ personOnly: true })
    })

    expect(result.current.settings.personOnly).toBe(true)
  })
})
