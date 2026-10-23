import { Box, Chip, Skeleton, Tooltip, Typography } from '@mui/material'
import { useHealth, useSystemStatus } from '@/api/queries'
import { mapAiState } from '@/utils/contract'

function fmtUptime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}j ${m}m`
}

const AI_LABEL: Record<string, string> = {
  available: 'AI siap',
  degraded: 'AI menurun',
  unavailable: 'AI mati',
  not_configured: 'AI lokal (mock)',
  disabled: 'AI dimatikan',
}

export function StatusStrip() {
  const health = useHealth()
  const sys = useSystemStatus()

  if (health.isLoading || sys.isLoading) {
    return <Skeleton width={380} height={20} sx={{ borderRadius: '6px' }} />
  }

  const cpu = sys.data?.cpu_usage_percent ?? 0
  const mem = sys.data?.memory_usage_percent ?? 0
  const disk = sys.data?.disk_free_gb ?? 0
  const active = sys.data?.active_cameras ?? 0
  const total = sys.data?.total_cameras ?? 0
  const eventsToday = sys.data?.events_today ?? 0
  // `ai.state` backend bersifat otoritatif (ruling G-7); helper handles fallback.
  const aiState = mapAiState(health.data, sys.data)
  const mockMode = health.data?.mock_mode === true

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
      <Tooltip title="CPU">
        <Typography
          variant="body2"
          sx={{
            fontSize: '13px',
            color: cpu >= 75 ? '#0d0d0d' : '#5d5d5d',
            fontWeight: cpu >= 75 ? 600 : 400,
          }}
        >
          CPU {cpu.toFixed(0)}%
        </Typography>
      </Tooltip>
      <Tooltip title="Memori">
        <Typography
          variant="body2"
          sx={{
            fontSize: '13px',
            color: mem >= 75 ? '#0d0d0d' : '#5d5d5d',
            fontWeight: mem >= 75 ? 600 : 400,
          }}
        >
          RAM {mem.toFixed(0)}%
        </Typography>
      </Tooltip>
      <Tooltip title="Disk bebas">
        <Typography
          variant="body2"
          sx={{
            fontSize: '13px',
            color: disk < 25 ? '#0d0d0d' : '#5d5d5d',
            fontWeight: disk < 25 ? 600 : 400,
          }}
        >
          Disk {disk.toFixed(1)} GB
        </Typography>
      </Tooltip>
      <Typography variant="body2" sx={{ fontSize: '13px', color: '#5d5d5d' }}>
        Kamera <strong style={{ color: '#0d0d0d', fontWeight: 500 }}>{active}/{total}</strong>
      </Typography>
      <Typography variant="body2" sx={{ fontSize: '13px', color: '#5d5d5d' }}>
        Event hari ini <strong style={{ color: '#0d0d0d', fontWeight: 500 }}>{eventsToday}</strong>
      </Typography>
      {sys.data?.uptime_seconds !== undefined && (
        <Typography variant="body2" sx={{ fontSize: '13px', color: '#8f8f8f' }}>
          Uptime {fmtUptime(sys.data.uptime_seconds)}
        </Typography>
      )}
      <Chip
        size="small"
        label={AI_LABEL[aiState] ?? 'AI'}
        sx={{
          borderRadius: 0,
          fontSize: '11px',
          height: '20px',
          bgcolor: '#f9f9f9',
          borderColor: 'rgba(0, 0, 0, 0.1)',
          color: '#0d0d0d',
          fontWeight: 500,
        }}
      />
      {mockMode && (
        <Tooltip title="Mode data sintetis aktif">
          <Chip
            size="small"
            label="MOCK"
            sx={{
              borderRadius: 0,
              fontSize: '11px',
              height: '20px',
              bgcolor: '#0d0d0d',
              color: '#ffffff',
              fontWeight: 600,
              border: 'none',
            }}
          />
        </Tooltip>
      )}
    </Box>
  )
}
