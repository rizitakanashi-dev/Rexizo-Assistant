import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MockBanner } from './MockBanner'

const healthState: { data: unknown } = { data: undefined }

vi.mock('@/api/queries', () => ({
  useHealth: () => healthState,
}))

describe('MockBanner', () => {
  it('tampil saat mock_mode true dari /health (ruling C-9)', () => {
    healthState.data = {
      status: 'healthy',
      version: '0.1.0-mvp',
      uptime_seconds: 10,
      components: { database: 'connected', llm_service: 'available' },
      mock_mode: true,
    }
    render(<MockBanner />)
    expect(screen.getByText(/Mode data sintetis aktif/i)).toBeInTheDocument()
  })

  it('tersembunyi saat mock_mode false walau llm_service available', () => {
    healthState.data = {
      status: 'healthy',
      version: '0.1.0-mvp',
      uptime_seconds: 10,
      components: { database: 'connected', llm_service: 'available' },
      mock_mode: false,
    }
    render(<MockBanner />)
    expect(screen.queryByText(/Mode data sintetis aktif/i)).not.toBeInTheDocument()
  })

  it('fallback ke llm_service mock untuk backend lama tanpa mock_mode', () => {
    healthState.data = {
      status: 'healthy',
      version: '0.1.0-mvp',
      uptime_seconds: 10,
      components: { database: 'connected', llm_service: 'mock' },
    }
    render(<MockBanner />)
    expect(screen.getByText(/Mode data sintetis aktif/i)).toBeInTheDocument()
  })
})
