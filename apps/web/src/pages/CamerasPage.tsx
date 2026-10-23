import { Alert, Box, Card, CardContent, Divider, Skeleton, Typography } from '@mui/material'
import { useCameras } from '@/api/queries'
import { CameraTile } from '@/components/camera/CameraTile'

export function CamerasPage() {
  const { data: cameras, isLoading, isError, error } = useCameras()

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, color: '#0d0d0d', fontSize: '22px' }}>
          Kamera
        </Typography>
        <Typography variant="body2" sx={{ color: '#5d5d5d', mt: 0.5 }}>
          Daftar seluruh kamera CCTV yang dikonfigurasi dan status koneksinya.
        </Typography>
      </Box>

      {isError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Gagal memuat kamera: {(error as Error)?.message}
        </Alert>
      )}

      {isLoading && (
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={200} sx={{ borderRadius: '10px' }} />
          ))}
        </Box>
      )}

      {!isLoading && !isError && cameras && cameras.length === 0 && (
        <Card variant="outlined" sx={{ borderRadius: '10px', borderColor: 'rgba(0, 0, 0, 0.1)' }}>
          <CardContent sx={{ p: 3, textAlign: 'center' }}>
            <Typography sx={{ color: '#8f8f8f', fontSize: '14px' }}>
              Belum ada kamera terdaftar.
            </Typography>
          </CardContent>
        </Card>
      )}

      {!isLoading && cameras && cameras.length > 0 && (
        <>
          <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ color: '#5d5d5d', fontSize: '13px' }}>
              <strong style={{ color: '#0d0d0d' }}>{cameras.filter((c) => c.status === 'online').length}</strong> dari {cameras.length} kamera online
            </Typography>
          </Box>
          <Divider sx={{ mb: 2.5, borderColor: 'rgba(0, 0, 0, 0.1)' }} />
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {cameras.map((cam) => (
              <CameraTile key={cam.id} camera={cam} />
            ))}
          </Box>
        </>
      )}
    </Box>
  )
}
