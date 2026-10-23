import { Box, Typography } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { useHealth } from '@/api/queries'

/**
 * Banner mode data sintetis.
 *
 * Gaya: achromatic graphite ink on warm paper.
 * Sumber kebenaran = `mock_mode` top-level dari `/health` (ruling C-9).
 */
export function MockBanner() {
  const { data } = useHealth()

  const mockMode =
    data?.mock_mode === true || data?.components?.llm_service?.toLowerCase() === 'mock'

  if (!mockMode) return null

  return (
    <Box
      sx={{
        px: { xs: 2, md: 3 },
        py: 1,
        bgcolor: '#f9f9f9',
        borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}
    >
      <InfoOutlinedIcon sx={{ fontSize: 16, color: '#5d5d5d' }} />
      <Typography variant="body2" sx={{ fontSize: '13px', color: '#0d0d0d' }}>
        Mode data sintetis aktif — event di dashboard ini BUKAN observasi kamera sungguhan.
      </Typography>
    </Box>
  )
}
