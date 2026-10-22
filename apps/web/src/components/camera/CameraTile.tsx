import { Box, Card, CardContent, Chip, IconButton, Typography } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useEffect, useRef, useState } from 'react'
import { Camera } from '@/types'
import { resolveMediaPath } from '@/utils/contract'

interface Props {
  camera: Camera
}

export function CameraTile({ camera }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [streamOk, setStreamOk] = useState(true)
  const [retry, setRetry] = useState(0)
  const streamSrc = camera.stream_url_preview ? resolveMediaPath(camera.stream_url_preview) : null
  const snapshotSrc = camera.snapshot_url ? resolveMediaPath(camera.snapshot_url) : null

  useEffect(() => {
    setStreamOk(true)
    setRetry(0)
  }, [camera.id])

  useEffect(() => {
    if (camera.status === 'offline' || camera.status === 'error' || !camera.is_enabled) {
      setStreamOk(false)
      return
    }
    const el = imgRef.current
    if (!el) return
    const t = setTimeout(() => {
      if (el.naturalWidth === 0) setStreamOk(false)
    }, 2500)
    return () => clearTimeout(t)
  }, [camera.status, camera.is_enabled, retry, streamSrc])

  const showStream = camera.is_enabled && streamOk && camera.status !== 'offline' && camera.status !== 'error' && streamSrc

  return (
    <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ position: 'relative', aspectRatio: '16/9', bgcolor: '#050810' }}>
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
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: snapshotSrc ? 1 : 0.4 }}
          />
        )}
        {!camera.is_enabled && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.6)' }}>
            <Chip label="Nonaktif" size="small" />
          </Box>
        )}
        {(camera.status === 'offline' || camera.status === 'error') && camera.is_enabled && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.5)' }}>
            <Chip label="Offline" size="small" color="error" />
          </Box>
        )}
      </Box>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>
            {camera.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {camera.status} · {camera.fps.toFixed(1)} fps
          </Typography>
        </Box>
        {!showStream && camera.is_enabled && (
          <IconButton size="small" onClick={() => setRetry((r) => r + 1)}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        )}
      </CardContent>
    </Card>
  )
}
