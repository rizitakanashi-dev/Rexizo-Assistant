import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { useHealth, useSystemStatus } from '@/api/queries'

function StatCard({
  label,
  value,
  unit,
  warn,
}: {
  label: string
  value: string | number
  unit?: string
  warn?: boolean
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        flex: 1,
        minWidth: 120,
        borderRadius: '10px',
        borderColor: 'rgba(0, 0, 0, 0.1)',
        bgcolor: '#ffffff',
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Typography variant="caption" sx={{ color: '#5d5d5d', fontSize: '12px' }}>
          {label}
        </Typography>
        <Typography
          variant="h6"
          sx={{
            fontSize: '18px',
            fontWeight: warn ? 700 : 600,
            color: '#0d0d0d',
            mt: 0.25,
          }}
        >
          {value}
          {unit && (
            <Typography component="span" variant="caption" sx={{ color: '#8f8f8f', ml: 0.5 }}>
              {unit}
            </Typography>
          )}
        </Typography>
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const { data: health, isLoading: hLoading, isError: hError } = useHealth()
  const { data: sys, isLoading: sLoading, isError: sError } = useSystemStatus()

  const isHealthy = health?.status === 'ok' || health?.status === 'healthy'

  return (
    <Box sx={{ maxWidth: 768 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, color: '#0d0d0d', fontSize: '22px' }}>
          Pengaturan & Status
        </Typography>
        <Typography variant="body2" sx={{ color: '#5d5d5d', mt: 0.5 }}>
          Informasi operasional runtime backend, resource sistem, dan konfigurasi AI Core.
        </Typography>
      </Box>

      {(hLoading || sLoading) && (
        <Skeleton height={200} variant="rounded" sx={{ borderRadius: '10px', mb: 3 }} />
      )}

      {(hError || sError) && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Tidak dapat memuat status sistem.
        </Alert>
      )}

      {health && (
        <Card
          variant="outlined"
          sx={{
            mb: 3,
            borderRadius: '10px',
            borderColor: 'rgba(0, 0, 0, 0.1)',
            bgcolor: '#ffffff',
          }}
        >
          <CardContent sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ fontSize: '16px', fontWeight: 600, color: '#0d0d0d' }}>
                Informasi Backend
              </Typography>
              <Chip
                icon={
                  isHealthy ? (
                    <CheckCircleOutlineIcon sx={{ fontSize: '14px !important', color: '#0d0d0d !important' }} />
                  ) : (
                    <ErrorOutlineIcon sx={{ fontSize: '14px !important', color: '#0d0d0d !important' }} />
                  )
                }
                label={isHealthy ? 'Sehat' : health.status}
                size="small"
                sx={{
                  borderRadius: 0,
                  fontSize: '12px',
                  bgcolor: '#f9f9f9',
                  borderColor: 'rgba(0, 0, 0, 0.1)',
                  color: '#0d0d0d',
                  fontWeight: 500,
                }}
              />
            </Box>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption" sx={{ color: '#8f8f8f', fontSize: '12px' }}>
                  Versi API
                </Typography>
                <Typography variant="body2" sx={{ color: '#0d0d0d', fontWeight: 500 }}>
                  {health.version}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption" sx={{ color: '#8f8f8f', fontSize: '12px' }}>
                  Uptime
                </Typography>
                <Typography variant="body2" sx={{ color: '#0d0d0d', fontWeight: 500 }}>
                  {Math.floor(health.uptime_seconds / 3600)}j {Math.floor((health.uptime_seconds % 3600) / 60)}m
                </Typography>
              </Grid>
              <Grid item xs={6} sm={4}>
                <Typography variant="caption" sx={{ color: '#8f8f8f', fontSize: '12px' }}>
                  Mode Data
                </Typography>
                <Typography variant="body2" sx={{ color: '#0d0d0d', fontWeight: 500 }}>
                  {health.mock_mode ? 'Sintetis (Mock)' : 'Produksi (RTSP)'}
                </Typography>
              </Grid>
            </Grid>
            <Divider sx={{ my: 2, borderColor: 'rgba(0, 0, 0, 0.1)' }} />
            <Typography variant="subtitle2" sx={{ mb: 1, fontSize: '13px', color: '#5d5d5d', fontWeight: 500 }}>
              Status Komponen
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {Object.entries(health.components ?? {}).map(([k, v]) => (
                <Chip
                  key={k}
                  label={`${k}: ${v}`}
                  size="small"
                  variant="outlined"
                  sx={{
                    borderRadius: 0,
                    fontSize: '11px',
                    borderColor: 'rgba(0, 0, 0, 0.1)',
                    color: '#0d0d0d',
                    bgcolor: '#f9f9f9',
                  }}
                />
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {sys && (
        <Card
          variant="outlined"
          sx={{
            borderRadius: '10px',
            borderColor: 'rgba(0, 0, 0, 0.1)',
            bgcolor: '#ffffff',
          }}
        >
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 2, fontSize: '16px', fontWeight: 600, color: '#0d0d0d' }}>
              Resource Sistem
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
              <StatCard
                label="CPU"
                value={sys.cpu_usage_percent.toFixed(0)}
                unit="%"
                warn={sys.cpu_usage_percent >= 75}
              />
              <StatCard
                label="RAM"
                value={sys.memory_usage_percent.toFixed(0)}
                unit="%"
                warn={sys.memory_usage_percent >= 75}
              />
              <StatCard
                label="Disk bebas"
                value={sys.disk_free_gb.toFixed(1)}
                unit="GB"
                warn={sys.disk_free_gb < 10}
              />
              <StatCard label="Kamera aktif" value={`${sys.active_cameras}/${sys.total_cameras}`} />
              <StatCard label="Event hari ini" value={sys.events_today} />
            </Stack>
            <Divider sx={{ my: 2, borderColor: 'rgba(0, 0, 0, 0.1)' }} />
            <Typography variant="subtitle2" sx={{ mb: 1, fontSize: '13px', color: '#5d5d5d', fontWeight: 500 }}>
              Status AI Core
            </Typography>
            <Stack direction="row" gap={1} flexWrap="wrap">
              <Chip
                label={sys.ai.enabled ? 'Diaktifkan' : 'Dimatikan'}
                size="small"
                sx={{
                  borderRadius: 0,
                  fontSize: '11px',
                  bgcolor: sys.ai.enabled ? '#0d0d0d' : '#f9f9f9',
                  color: sys.ai.enabled ? '#ffffff' : '#0d0d0d',
                  fontWeight: 500,
                  border: 'none',
                }}
              />
              <Chip
                label={`Provider: ${sys.ai.provider}`}
                size="small"
                variant="outlined"
                sx={{
                  borderRadius: 0,
                  fontSize: '11px',
                  borderColor: 'rgba(0, 0, 0, 0.1)',
                  color: '#0d0d0d',
                }}
              />
              {sys.ai.model && (
                <Chip
                  label={`Model: ${sys.ai.model}`}
                  size="small"
                  variant="outlined"
                  sx={{
                    borderRadius: 0,
                    fontSize: '11px',
                    borderColor: 'rgba(0, 0, 0, 0.1)',
                    color: '#0d0d0d',
                  }}
                />
              )}
              {sys.ai.state && (
                <Chip
                  label={`State: ${sys.ai.state}`}
                  size="small"
                  variant="outlined"
                  sx={{
                    borderRadius: 0,
                    fontSize: '11px',
                    borderColor: 'rgba(0, 0, 0, 0.1)',
                    color: '#5d5d5d',
                    bgcolor: '#f9f9f9',
                  }}
                />
              )}
              {sys.ai.degraded && (
                <Chip
                  label="Degraded"
                  size="small"
                  sx={{
                    borderRadius: 0,
                    fontSize: '11px',
                    bgcolor: '#f9f9f9',
                    color: '#0d0d0d',
                    fontWeight: 600,
                    borderColor: 'rgba(0, 0, 0, 0.2)',
                  }}
                />
              )}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
