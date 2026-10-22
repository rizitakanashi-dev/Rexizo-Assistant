import {
  Box,
  Chip,
  Divider,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material'
import { format, parseISO } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { EventItem } from '@/types'

const EVENT_TYPE_LABELS: Record<string, string> = {
  motion: 'Gerak',
  object_detected: 'Objek terdeteksi',
  camera_status: 'Status kamera',
}

const EVENT_TYPE_COLOR: Record<string, 'default' | 'primary' | 'warning' | 'error' | 'info'> = {
  motion: 'primary',
  object_detected: 'warning',
  camera_status: 'info',
}

function EventCard({ ev }: { ev: EventItem }) {
  const label = EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type.replace(/_/g, ' ')
  const color = EVENT_TYPE_COLOR[ev.event_type] ?? 'default'
  const time = (() => {
    try {
      return format(parseISO(ev.timestamp), 'dd MMM yyyy HH:mm:ss', { locale: idLocale })
    } catch {
      return ev.timestamp
    }
  })()

  const metaEntries = Object.entries(ev.metadata ?? {}).filter(([, v]) => v !== null && v !== undefined)

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
        <Chip label={label} size="small" color={color} />
        <Chip label={ev.camera_name} size="small" variant="outlined" />
        {ev.is_mock && (
          <Chip label="[MOCK DATA]" size="small" color="warning" variant="filled" />
        )}
        {ev.confidence !== null && ev.confidence !== undefined && (
          <Chip
            label={`${(ev.confidence * 100).toFixed(0)}% keyakinan`}
            size="small"
            variant="outlined"
          />
        )}
        {ev.snapshot_path && (
          <Chip label="Ada snapshot" size="small" color="default" variant="outlined" />
        )}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {time}
      </Typography>
      {metaEntries.length > 0 && (
        <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {metaEntries.slice(0, 6).map(([k, v]) => (
            <Typography key={k} variant="caption" color="text.secondary" sx={{ mr: 1 }}>
              {k}: <strong>{String(v)}</strong>
            </Typography>
          ))}
        </Box>
      )}
    </Paper>
  )
}

interface EventTimelineProps {
  items: EventItem[]
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  isEmpty?: boolean
}

export function EventTimeline({
  items,
  isLoading,
  isError,
  errorMessage,
  isEmpty,
}: EventTimelineProps) {
  if (isLoading) {
    return (
      <Stack spacing={1.5}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={72} />
        ))}
      </Stack>
    )
  }

  if (isError) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="error" gutterBottom>
          Gagal memuat event
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {errorMessage ?? 'Periksa koneksi dan coba lagi'}
        </Typography>
      </Paper>
    )
  }

  if (isEmpty || items.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Belum ada event yang tercatat</Typography>
      </Paper>
    )
  }

  // Group by date
  const groups: Record<string, EventItem[]> = {}
  for (const ev of items) {
    let dateKey = ev.timestamp.slice(0, 10)
    try {
      dateKey = format(parseISO(ev.timestamp), 'yyyy-MM-dd')
    } catch {
      // keep raw slice
    }
    if (!groups[dateKey]) groups[dateKey] = []
    groups[dateKey].push(ev)
  }

  return (
    <Stack spacing={2.5}>
      {Object.entries(groups).map(([dateKey, evs]) => {
        let dateLabel = dateKey
        try {
          dateLabel = format(parseISO(dateKey), 'EEEE, dd MMM yyyy', { locale: idLocale })
        } catch {
          // keep raw
        }
        return (
          <Box key={dateKey}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {dateLabel}
              </Typography>
              <Divider sx={{ flex: 1 }} />
            </Box>
            <Stack spacing={1}>
              {evs.map((ev) => <EventCard key={ev.id} ev={ev} />)}
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
