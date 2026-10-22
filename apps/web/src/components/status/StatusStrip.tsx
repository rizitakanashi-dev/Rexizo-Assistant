import { Box, Chip, Skeleton, Tooltip, Typography } from '@mui/material'
import { useHealth, useSystemStatus } from '@/api/queries'
import { mapAiState } from '@/utils/contract'

function fmtUptime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}j ${m}m`
}

export function StatusStrip() {
  const health = useHealth()
  const sys = useSystemStatus()

  if (health.isLoading || sys.isLoading) {
    return <Skeleton width={420} height={24} />
  }

  const cpu = sys.data?.cpu_usage_percent ?? 0
  const mem = sys.data?.memory_usage_percent ?? 0
  const disk = sys.data?.disk_free_gb ?? 0
  const active = sys.data?.active_cameras ?? 0
  const total = sys.data?.total_cameras ?? 0
  const eventsToday = sys.data?.events_today ?? 0
  const aiState = mapAiState(health.data, sys.data)

  const aiLabel: Record<string, string> = {
    available: 'AI siap',
    degraded: 'AI menurun',
    unavailable: 'AI mati',
    not_configured: 'AI belum diatur',
    disabled: 'AI dimatikan',
  }
  const aiColor: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    available: 'success',
    degraded: 'warning',
    unavailable: 'error',
    not_configured: 'default',
    disabled: 'default',
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
      <Tooltip title="CPU">
        <Typography variant="body2" color={cpu >= 90 ? 'error' : cpu >= 75 ? 'warning.main' : 'text.secondary'}>
          CPU {cpu.toFixed(0)}%
        </Typography>
      </Tooltip>
      <Tooltip title="Memori">
        <Typography variant="body2" color={mem >= 90 ? 'error' : mem >= 75 ? 'warning.main' : 'text.secondary'}>
          RAM {mem.toFixed(0)}%
        </Typography>
      </Tooltip>
      <Tooltip title="Disk bebas">
        <Typography variant="body2" color={disk < 10 ? 'error' : disk < 25 ? 'warning.main' : 'text.secondary'}>
          Disk {disk.toFixed(1)} GB
        </Typography>
      </Tooltip>
      <Typography variant="body2" color="text.secondary">
        Kamera {active}/{total}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Event hari ini {eventsToday}
      </Typography>
      {sys.data?.uptime_seconds !== undefined && (
        <Typography variant="body2" color="text.secondary">
          Uptime {fmtUptime(sys.data.uptime_seconds)}
        </Typography>
      )}
      <Chip size="small" label={aiLabel[aiState]} color={aiColor[aiState]} variant="outlined" />
    </Box>
  )
}
