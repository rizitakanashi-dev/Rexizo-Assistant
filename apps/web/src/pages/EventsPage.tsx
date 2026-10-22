import {
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
import { useEvents } from '@/api/queries'
import { useCameras } from '@/api/queries'
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
  useEffect(() => { setPage(1) }, [latestEvent, eventType, cameraId, search])

  // totalPages used in TablePagination via count
  const errMsg = (error as Error | null)?.message

  const WsIcon = wsState === 'connected'
    ? WifiIcon
    : wsState === 'reconnecting'
    ? SyncIcon
    : WifiOffIcon

  const wsColor: 'success' | 'warning' | 'error' =
    wsState === 'connected' ? 'success' : wsState === 'reconnecting' ? 'warning' : 'error'

  const wsLabel =
    wsState === 'connected' ? 'Realtime aktif' :
    wsState === 'reconnecting' ? 'Menghubungkan ulang…' :
    wsState === 'connecting' ? 'Menghubungkan…' : 'Realtime terputus'

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ fontWeight: 600, flex: 1 }}>
          Timeline Event
        </Typography>
        <Tooltip title={wsLabel}>
          <Chip
            icon={<WsIcon fontSize="small" />}
            label={wsLabel}
            size="small"
            color={wsColor}
            variant="outlined"
          />
        </Tooltip>
        <Tooltip title="Muat ulang">
          <IconButton size="small" onClick={() => refetch()}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Filter bar */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ pb: '12px !important' }}>
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
                  <MenuItem key={cam.id} value={cam.id}>{cam.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {(eventType || cameraId || search) && (
              <Chip
                label="Reset filter"
                size="small"
                onClick={() => { setEventType(''); setCameraId(''); setSearch('') }}
                onDelete={() => { setEventType(''); setCameraId(''); setSearch('') }}
              />
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Total {data?.total ?? 0} event
          </Typography>
        </CardContent>
      </Card>

      <EventTimeline
        items={data?.items ?? []}
        isLoading={isLoading}
        isError={isError}
        errorMessage={errMsg}
      />

      {!isLoading && !isError && (data?.total ?? 0) > PAGE_SIZE && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <TablePagination
            component="div"
            count={data?.total ?? 0}
            page={page - 1}
            onPageChange={(_: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => setPage(newPage + 1)}
            rowsPerPage={PAGE_SIZE}
            rowsPerPageOptions={[PAGE_SIZE]}
          />
        </Box>
      )}
    </Box>
  )
}
