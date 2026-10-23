import { Alert, Box, Grid, Skeleton, Typography } from '@mui/material'
import { useCameras } from '@/api/queries'
import { CameraTile } from '@/components/camera/CameraTile'

export function DashboardPage() {
  const { data: cameras, isLoading, isError, error } = useCameras()

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, color: '#0d0d0d', fontSize: '22px' }}>
          Dashboard Kamera
        </Typography>
        <Typography variant="body2" sx={{ color: '#5d5d5d', mt: 0.5 }}>
          Pantauan langsung feed CCTV dan status kamera lokal.
        </Typography>
      </Box>

      {isError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Gagal memuat daftar kamera: {(error as Error)?.message ?? 'Kesalahan tidak diketahui'}
        </Alert>
      )}

      {isLoading && (
        <Grid container spacing={2.5}>
          {Array.from({ length: 4 }).map((_, idx) => (
            <Grid item xs={12} sm={6} md={4} key={idx}>
              <Skeleton
                variant="rounded"
                sx={{ aspectRatio: '16/9', height: 'auto', borderRadius: '10px' }}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {!isLoading && !isError && cameras && cameras.length === 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Tidak ada kamera yang terdaftar. Tambahkan kamera melalui konfigurasi backend.
        </Alert>
      )}

      {!isLoading && cameras && cameras.length > 0 && (
        <Grid container spacing={2.5}>
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
