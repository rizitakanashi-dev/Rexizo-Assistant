import { Alert, Box, Card, CardContent, Divider, Skeleton, Typography } from '@mui/material'
import { useCameras } from '@/api/queries'
import { CameraTile } from '@/components/camera/CameraTile'

export function CamerasPage() {
  const { data: cameras, isLoading, isError, error } = useCameras()

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        Kamera
      </Typography>

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Gagal memuat kamera: {(error as Error)?.message}
        </Alert>
      )}

      {isLoading && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={200} />
          ))}
        </Box>
      )}

      {!isLoading && !isError && cameras && cameras.length === 0 && (
        <Card variant="outlined">
          <CardContent>
            <Typography color="text.secondary">Belum ada kamera terdaftar.</Typography>
          </CardContent>
        </Card>
      )}

      {!isLoading && cameras && cameras.length > 0 && (
        <>
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {cameras.filter(c => c.status === 'online').length}/{cameras.length} online
            </Typography>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {cameras.map((cam) => (
              <CameraTile key={cam.id} camera={cam} />
            ))}
          </Box>
        </>
      )}
    </Box>
  )
}
