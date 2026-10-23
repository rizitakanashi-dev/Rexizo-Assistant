import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import TablePagination from '@mui/material/TablePagination'
import RefreshIcon from '@mui/icons-material/Refresh'
import WifiIcon from '@mui/icons-material/Wifi'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import SyncIcon from '@mui/icons-material/Sync'
import { useEffect, useState } from 'react'
import { useEvents, useCameras } from '@/api/queries'
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents'
import { EventTimeline } from '@/components/event/EventTimeline'

const PAGE_SIZE = 20

export function EventsPage() {
  const [page, setPage] = useState(1)
  const [eventType, setEventType] = useState('')
  const [cameraId, setCameraId] = useState('')
  const [search, setSearch] = useState('')

  const { wsState, latestEvent } = useRealtimeEvents()
  const { data: cameras = [] } = useCameras()

  const { data, isLoading, isError, error, refetch } = useEvents({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    ...(eventType ? { event_type: eventType } : {}),
    ...(cameraId ? { camera_id: cameraId } : {}),
    ...(search ? { search } : {}),
  })

  // Reset to page 1 when new event arrives or filter changes
  useEffect(() => {
    setPage(1)
  }, [latestEvent, eventType, cameraId, search])

  const errMsg = (error as Error | null)?.message

  const WsIcon =
    wsState === 'connected' ? WifiIcon : wsState === 'reconnecting' ? SyncIcon : WifiOffIcon

  const wsLabel =
    wsState === 'connected'
      ? 'Realtime aktif'
      : wsState === 'reconnecting'
      ? 'Menghubungkan ulang…'
      : wsState === 'connecting'
      ? 'Menghubungkan…'
      : 'Realtime terputus'

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, color: '#0d0d0d', fontSize: '22px' }}>
            Timeline Event
          </Typography>
          <Typography variant="body2" sx={{ color: '#5d5d5d', mt: 0.5 }}>
            Log kronologis deteksi gerak dan deteksi objek dari seluruh kamera.
          </Typography>
        </Box>
        <Tooltip title={wsLabel}>
          <Chip
            icon={<WsIcon sx={{ fontSize: '14px !important', color: '#0d0d0d !important' }} />}
            label={wsLabel}
            size="small"
            sx={{
              borderRadius: 0,
              bgcolor: '#f9f9f9',
              borderColor: 'rgba(0, 0, 0, 0.1)',
              color: '#0d0d0d',
              fontSize: '12px',
              height: '24px',
            }}
          />
        </Tooltip>
        <Tooltip title="Muat ulang">
          <IconButton
            size="small"
            onClick={() => refetch()}
            sx={{
              borderRadius: '10px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              p: '5px',
              color: '#0d0d0d',
              '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.05)' },
            }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Filter bar */}
      <Card
        variant="outlined"
        sx={{
          mb: 3,
          borderRadius: '10px',
          borderColor: 'rgba(0, 0, 0, 0.1)',
          bgcolor: '#ffffff',
        }}
      >
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="flex-start">
            <TextField
              label="Cari"
              size="small"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Kata kunci…"
              sx={{ minWidth: 160 }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Tipe event</InputLabel>
              <Select
                label="Tipe event"
                value={eventType}
                onChange={(e: SelectChangeEvent) => setEventType(e.target.value)}
              >
                <MenuItem value="">Semua</MenuItem>
                <MenuItem value="motion">Gerak</MenuItem>
                <MenuItem value="object_detected">Objek terdeteksi</MenuItem>
                <MenuItem value="camera_status">Status kamera</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Kamera</InputLabel>
              <Select
                label="Kamera"
                value={cameraId}
                onChange={(e: SelectChangeEvent) => setCameraId(e.target.value)}
              >
                <MenuItem value="">Semua</MenuItem>
                {cameras.map((cam) => (
                  <MenuItem key={cam.id} value={cam.id}>
                    {cam.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {(eventType || cameraId || search) && (
              <Chip
                label="Reset filter"
                size="small"
                onClick={() => {
                  setEventType('')
                  setCameraId('')
                  setSearch('')
                }}
                onDelete={() => {
                  setEventType('')
                  setCameraId('')
                  setSearch('')
                }}
                sx={{
                  borderRadius: 0,
                  bgcolor: '#f9f9f9',
                  borderColor: 'rgba(0, 0, 0, 0.1)',
                  color: '#0d0d0d',
                  height: '28px',
                  alignSelf: 'center',
                }}
              />
            )}
          </Stack>
          <Typography variant="caption" sx={{ mt: 1.5, display: 'block', color: '#8f8f8f' }}>
            Total <strong style={{ color: '#0d0d0d' }}>{data?.total ?? 0}</strong> event ditemukan
          </Typography>
        </CardContent>
      </Card>

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errMsg || 'Gagal mengambil data event.'}
        </Alert>
      )}

      <EventTimeline
        items={data?.items ?? []}
        isLoading={isLoading}
        isError={isError}
        errorMessage={errMsg}
        isEmpty={!isLoading && !isError && (data?.items?.length ?? 0) === 0}
      />

      {data && data.total > PAGE_SIZE && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
          <TablePagination
            component="div"
            count={data.total}
            page={page - 1}
            onPageChange={(_: React.MouseEvent<HTMLButtonElement> | null, newPage: number) =>
              setPage(newPage + 1)
            }
            rowsPerPage={PAGE_SIZE}
            rowsPerPageOptions={[PAGE_SIZE]}
            labelDisplayedRows={({
              from,
              to,
              count,
            }: {
              from: number
              to: number
              count: number
            }) => `${from}-${to} dari ${count}`}
            sx={{
              color: '#5d5d5d',
              borderTop: '1px solid rgba(0, 0, 0, 0.1)',
              '.MuiTablePagination-actions button': {
                color: '#0d0d0d',
                borderRadius: '8px',
                '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.05)' },
              },
            }}
          />
        </Box>
      )}
    </Box>
  )
}
