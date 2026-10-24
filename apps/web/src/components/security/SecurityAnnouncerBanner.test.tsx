import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { SecurityAnnouncerBanner } from './SecurityAnnouncerBanner'
import { SecurityAlert } from '@/hooks/useSecurityAnnouncer'

describe('SecurityAnnouncerBanner', () => {
  it('tidak merender apapun jika alert bernilai null', () => {
    const { container } = render(
      <BrowserRouter>
        <SecurityAnnouncerBanner alert={null} onDismiss={vi.fn()} />
      </BrowserRouter>
    )
    expect(container.firstChild).toBeNull()
  })

  it('merender pesan peringatan keamanan saat alert ada', () => {
    const mockAlert: SecurityAlert = {
      id: 'alert_1',
      camera_id: 'cam_backyard',
      camera_name: 'Kamera Belakang',
      event_type: 'motion',
      is_person: false,
      message: 'Sensei, ada gerakan mencurigakan terdeteksi di Kamera Belakang!',
      timestamp: new Date().toISOString(),
    }
    const onDismiss = vi.fn()

    render(
      <BrowserRouter>
        <SecurityAnnouncerBanner alert={mockAlert} onDismiss={onDismiss} />
      </BrowserRouter>
    )

    expect(screen.getByText('PERINGATAN KEAMANAN CCTV')).toBeInTheDocument()
    expect(
      screen.getByText('Sensei, ada gerakan mencurigakan terdeteksi di Kamera Belakang!')
    ).toBeInTheDocument()
    expect(screen.getByText('Lihat Kamera')).toBeInTheDocument()

    const closeBtn = screen.getByText('Tutup')
    fireEvent.click(closeBtn)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
