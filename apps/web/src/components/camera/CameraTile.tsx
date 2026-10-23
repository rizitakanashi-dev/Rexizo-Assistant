import { Box, Card, CardContent, Chip, IconButton, Typography } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useEffect, useRef, useState } from 'react'
import { Camera } from '@/types'
import { mapCameraStatus, resolveMediaPath } from '@/utils/contract'

interface Props {
  camera: Camera
}

const OFFLINE_STATUSES = ['offline', 'error']

export function CameraTile({ camera }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [streamOk, setStreamOk] = useState(true)
  const [retry, setRetry] = useState(0)
  const streamSrc = camera.stream_url_preview ? resolveMediaPath(camera.stream_url_preview) : null
  const snapshotSrc = camera.snapshot_url ? resolveMediaPath(camera.snapshot_url) : null

  const statusView = mapCameraStatus(camera.status)
  const isOffline = OFFLINE_STATUSES.includes(camera.status)
  const isReconnecting = camera.status === 'reconnecting'

  useEffect(() => {
    setStreamOk(true)
    setRetry(0)
  }, [camera.id])

  useEffect(() => {
    if (isOffline || !camera.is_enabled) {
      setStreamOk(false)
      return
    }
    const el = imgRef.current
    if (!el) return
    const t = setTimeout(() => {
      if (el.naturalWidth === 0) setStreamOk(false)
    }, 2500)
    return () => clearTimeout(t)
  }, [camera.status, camera.is_enabled, retry, streamSrc, isOffline])

  const showStream =
    camera.is_enabled && streamOk && !isOffline && streamSrc

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '10px',
        borderColor: 'rgba(0, 0, 0, 0.1)',
        bgcolor: '#ffffff',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ position: 'relative', aspectRatio: '16/9', bgcolor: '#1a1a1a' }}>
        {showStream ? (
          <Box
            component="img"
            ref={imgRef}
            src={`${streamSrc}${streamSrc?.includes('?') ? '&' : '?'}t=${retry}`}
            alt={camera.name}
            onError={() => setStreamOk(false)}
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Box
            component="img"
            src={snapshotSrc || undefined}
            alt={camera.name}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              opacity: snapshotSrc ? 0.9 : 0.3,
            }}
          />
        )}
        {!camera.is_enabled && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(0, 0, 0, 0.65)',
            }}
          >
            <Chip
              label="Nonaktif"
              size="small"
              sx={{
                borderRadius: 0,
                bgcolor: '#ffffff',
                color: '#0d0d0d',
                fontWeight: 500,
                border: 'none',
              }}
            />
          </Box>
        )}
        {isOffline && camera.is_enabled && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(0, 0, 0, 0.6)',
            }}
          >
            <Chip
              label={statusView.label}
              size="small"
              color={statusView.color}
              sx={{
                borderRadius: 0,
                bgcolor: '#0d0d0d',
                color: '#ffffff',
                fontWeight: 500,
                border: 'none',
              }}
            />
          </Box>
        )}
        {isReconnecting && camera.is_enabled && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(0, 0, 0, 0.55)',
            }}
          >
            <Chip
              label={statusView.label}
              size="small"
              color={statusView.color}
              sx={{
                borderRadius: 0,
                bgcolor: '#0d0d0d',
                color: '#ffffff',
                fontWeight: 500,
                border: 'none',
              }}
            />
          </Box>
        )}
        {camera.is_mock && (
          <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
            <Chip
              label="[MOCK]"
              size="small"
              color="warning"
              variant="filled"
              sx={{
                borderRadius: 0,
                bgcolor: '#ffffff',
                color: '#0d0d0d',
                fontWeight: 600,
                fontSize: '11px',
                border: '1px solid rgba(0, 0, 0, 0.1)',
              }}
            />
          </Box>
        )}
      </Box>
      <CardContent sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            noWrap
            sx={{ fontWeight: 600, color: '#0d0d0d', fontSize: '14px', mb: 0.25 }}
          >
            {camera.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Chip
              label={statusView.label}
              size="small"
              color={statusView.color}
              variant="outlined"
              sx={{
                borderRadius: 0,
                height: '18px',
                fontSize: '11px',
                borderColor: 'rgba(0, 0, 0, 0.1)',
                color: '#5d5d5d',
              }}
            />
            <Typography variant="caption" sx={{ color: '#8f8f8f', fontSize: '12px' }}>
              {camera.fps !== null && camera.fps !== undefined
                ? `${camera.fps.toFixed(1)} fps`
                : 'fps —'}
            </Typography>
          </Box>
        </Box>
        {!showStream && camera.is_enabled && (
          <IconButton
            size="small"
            onClick={() => setRetry((r) => r + 1)}
            sx={{
              color: '#0d0d0d',
              borderRadius: '10px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              p: '5px',
              '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.05)' },
            }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        )}
      </CardContent>
    </Card>
  )
}
