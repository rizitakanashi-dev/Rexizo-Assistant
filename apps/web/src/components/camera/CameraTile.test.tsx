import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CameraTile } from './CameraTile'
import { Camera } from '@/types'

function makeCamera(overrides: Partial<Camera> = {}): Camera {
  return {
    id: 'cam_front_door',
    name: 'Front Door',
    is_enabled: true,
    status: 'online',
    fps: 15,
    last_seen_at: '2026-10-22T06:00:00Z',
    stream_url_preview: null,
    snapshot_url: null,
    is_mock: false,
    ...overrides,
  }
}

describe('CameraTile', () => {
  it('menampilkan badge [MOCK] untuk kamera sintetis (ruling C-9)', () => {
    render(<CameraTile camera={makeCamera({ is_mock: true })} />)
    expect(screen.getByText('[MOCK]')).toBeInTheDocument()
  })

  it('tidak menampilkan badge [MOCK] untuk kamera nyata', () => {
    render(<CameraTile camera={makeCamera({ is_mock: false })} />)
    expect(screen.queryByText('[MOCK]')).not.toBeInTheDocument()
  })

  it('menampilkan status reconnecting secara berbeda dari connecting (ruling C-2)', () => {
    const { unmount } = render(<CameraTile camera={makeCamera({ status: 'reconnecting' })} />)
    expect(screen.getAllByText('Menghubungkan kembali').length).toBeGreaterThan(0)
    expect(screen.queryByText('Menghubungkan')).not.toBeInTheDocument()
    unmount()

    render(<CameraTile camera={makeCamera({ status: 'connecting' })} />)
    expect(screen.getAllByText('Menghubungkan').length).toBeGreaterThan(0)
    expect(screen.queryByText('Menghubungkan kembali')).not.toBeInTheDocument()
  })

  it('menampilkan status offline dengan label yang jelas', () => {
    render(<CameraTile camera={makeCamera({ status: 'offline' })} />)
    expect(screen.getAllByText('Offline').length).toBeGreaterThan(0)
  })
})
