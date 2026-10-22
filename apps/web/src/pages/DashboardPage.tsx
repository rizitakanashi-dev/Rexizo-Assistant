import { Alert, Box, Grid, Skeleton, Typography } from '@mui/material'
import { useCameras } from '@/api/queries'
import { CameraTile } from '@/components/camera/CameraTile'

export function DashboardPage() {
  const { data: cameras, isLoading, isError, error } = useCameras()

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        Dashboard Kamera
      </Typography>

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Gagal memuat daftar kamera: {(error as Error)?.message ?? 'Kesalahan tidak diketahui'}
        </Alert>
      )}

      {isLoading && (
        <Grid container spacing={2}>
          {Array.from({ length: 4 }).map((_, idx) => (
            <Grid item xs={12} sm={6} md={4} key={idx}>
              <Skeleton variant="rounded" sx={{ aspectRatio: '16/9', height: 'auto' }} />
            </Grid>
          ))}
        </Grid>
      )}

      {!isLoading && !isError && cameras && cameras.length === 0 && (
        <Alert severity="info">
          Tidak ada kamera yang terdaftar. Tambahkan kamera melalui konfigurasi backend.
        </Alert>
      )}

      {!isLoading && cameras && cameras.length > 0 && (
        <Grid container spacing={2}>
          {cameras.map((cam) => (
            <Grid item xs={12} sm={6} md={4} key={cam.id}>
              <CameraTile camera={cam} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  )
}
