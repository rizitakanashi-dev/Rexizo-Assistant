import { Alert } from '@mui/material'
import { useHealth } from '@/api/queries'

/**
 * Banner mode data sintetis.
 *
 * Sumber kebenaran = `mock_mode` top-level dari `/health` (ruling C-9).
 * `components.llm_service` hanya dipakai sebagai fallback untuk backend lama
 * yang belum mengirim `mock_mode`.
 */
export function MockBanner() {
  const { data } = useHealth()

  const mockMode =
    data?.mock_mode === true || data?.components?.llm_service?.toLowerCase() === 'mock'

  if (!mockMode) return null

  return (
    <Alert severity="warning" variant="filled" sx={{ borderRadius: 0 }}>
      Mode data sintetis aktif — event di dashboard ini BUKAN observasi kamera sungguhan.
    </Alert>
  )
}
