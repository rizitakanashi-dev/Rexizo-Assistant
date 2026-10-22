import { Alert } from '@mui/material'
import { useHealth } from '@/api/queries'

export function MockBanner() {
  const { data } = useHealth()
  const llm = data?.components?.llm_service?.toLowerCase()
  if (llm !== 'mock') return null
  return (
    <Alert severity="warning" variant="filled" sx={{ borderRadius: 0 }}>
      Mode data sintetis aktif — event di dashboard ini BUKAN observasi kamera sungguhan.
    </Alert>
  )
}
