import { Alert, Box, Card, CardContent, Chip, Divider, Grid, Skeleton, Stack, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import { useHealth, useSystemStatus } from '@/api/queries'

function StatCard({ label, value, unit, warn }: { label: string; value: string | number; unit?: string; warn?: boolean }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 120 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h6" color={warn ? 'warning.main' : 'text.primary'}>
          {value}{unit && <Typography component="span" variant="caption" color="text.secondary"> {unit}</Typography>}
        </Typography>
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const { data: health, isLoading: hLoading, isError: hError } = useHealth()
  const { data: sys, isLoading: sLoading, isError: sError } = useSystemStatus()

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>Pengaturan & Status</Typography>

      {(hLoading || sLoading) && <Skeleton height={200} variant="rounded" />}

      {(hError || sError) && (
        <Alert severity="error" sx={{ mb: 2 }}>Tidak dapat memuat status sistem.</Alert>
      )}

      {health && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Typography variant="h6">Informasi Backend</Typography>
              <Chip
                icon={health.status === 'ok' ? <CheckCircleIcon fontSize="small" /> : <ErrorIcon fontSize="small" />}
                label={health.status === 'ok' ? 'Sehat' : health.status}
                size="small"
                color={health.status === 'ok' ? 'success' : 'error'}
              />
            </Box>
            <Grid container spacing={1} sx={{ mb: 2 }}>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption" color="text.secondary">Versi</Typography>
                <Typography variant="body2">{health.version}</Typography>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption" color="text.secondary">Uptime</Typography>
                <Typography variant="body2">{Math.floor(health.uptime_seconds / 3600)}j {Math.floor((health.uptime_seconds % 3600) / 60)}m</Typography>
              </Grid>
            </Grid>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Komponen</Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {Object.entries(health.components ?? {}).map(([k, v]) => (
                <Chip
                  key={k}
                  label={`${k}: ${v}`}
                  size="small"
                  color={v === 'ok' || v === 'available' ? 'success' : v === 'mock' ? 'warning' : 'default'}
                  variant="outlined"
                />
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {sys && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>Resource Sistem</Typography>
            <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
              <StatCard label="CPU" value={sys.cpu_usage_percent.toFixed(0)} unit="%" warn={sys.cpu_usage_percent >= 75} />
              <StatCard label="RAM" value={sys.memory_usage_percent.toFixed(0)} unit="%" warn={sys.memory_usage_percent >= 75} />
              <StatCard label="Disk bebas" value={sys.disk_free_gb.toFixed(1)} unit="GB" warn={sys.disk_free_gb < 10} />
              <StatCard label="Kamera aktif" value={`${sys.active_cameras}/${sys.total_cameras}`} />
              <StatCard label="Event hari ini" value={sys.events_today} />
            </Stack>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Status AI</Typography>
            <Stack direction="row" gap={1} flexWrap="wrap">
              <Chip label={sys.ai.enabled ? 'Diaktifkan' : 'Dimatikan'} size="small" color={sys.ai.enabled ? 'success' : 'default'} />
              <Chip label={`Provider: ${sys.ai.provider}`} size="small" variant="outlined" />
              {sys.ai.model && <Chip label={`Model: ${sys.ai.model}`} size="small" variant="outlined" />}
              {sys.ai.degraded && <Chip label="Degraded" size="small" color="warning" />}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
