import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventTimeline } from './EventTimeline'
import { EventItem } from '@/types'

function makeEvent(overrides: Partial<EventItem> = {}): EventItem {
  return {
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
    ...overrides,
  }
}

describe('EventTimeline', () => {
  it('menandai event punya snapshot dari snapshot_url (ruling C-8)', () => {
    render(
      <EventTimeline
        items={[makeEvent({ snapshot_url: '/api/v1/events/evt_1/snapshot' })]}
      />,
    )
    expect(screen.getByText('Ada snapshot')).toBeInTheDocument()
  })

  it('tetap menandai snapshot dari snapshot_path (fallback legacy)', () => {
    render(
      <EventTimeline
        items={[makeEvent({ snapshot_path: '/api/v1/events/evt_1/snapshot' })]}
      />,
    )
    expect(screen.getByText('Ada snapshot')).toBeInTheDocument()
  })

  it('tidak menandai snapshot bila keduanya kosong', () => {
    render(<EventTimeline items={[makeEvent()]} />)
    expect(screen.queryByText('Ada snapshot')).not.toBeInTheDocument()
  })

  it('menampilkan badge mock untuk event sintetis', () => {
    render(<EventTimeline items={[makeEvent({ is_mock: true })]} />)
    expect(screen.getByText('[MOCK DATA]')).toBeInTheDocument()
  })
})
