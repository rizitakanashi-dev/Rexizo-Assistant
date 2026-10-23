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
import { resolveEventSnapshot } from '@/utils/contract'

const EVENT_TYPE_LABELS: Record<string, string> = {
  motion: 'Gerak',
  object_detected: 'Objek terdeteksi',
  camera_status: 'Status kamera',
}

function EventCard({ ev }: { ev: EventItem }) {
  const label = EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type.replace(/_/g, ' ')
  const time = (() => {
    try {
      return format(parseISO(ev.timestamp), 'dd MMM yyyy HH:mm:ss', { locale: idLocale })
    } catch {
      return ev.timestamp
    }
  })()

  const metaEntries = Object.entries(ev.metadata ?? {}).filter(([, v]) => v !== null && v !== undefined)
  // `snapshot_url` (ruling C-8) lebih didahulukan; `snapshot_path` jadi fallback.
  const snapshotUrl = resolveEventSnapshot(ev)

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: '10px',
        borderColor: 'rgba(0, 0, 0, 0.1)',
        bgcolor: '#ffffff',
        transition: 'background-color 0.15s ease',
        '&:hover': {
          bgcolor: 'rgba(0, 0, 0, 0.02)',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.75 }}>
        <Chip
          label={label}
          size="small"
          sx={{
            borderRadius: 0,
            fontSize: '11px',
            height: '20px',
            bgcolor: '#0d0d0d',
            color: '#ffffff',
            fontWeight: 500,
            border: 'none',
          }}
        />
        <Chip
          label={ev.camera_name}
          size="small"
          variant="outlined"
          sx={{
            borderRadius: 0,
            fontSize: '11px',
            height: '20px',
            borderColor: 'rgba(0, 0, 0, 0.1)',
            color: '#0d0d0d',
            bgcolor: '#ffffff',
          }}
        />
        {ev.is_mock && (
          <Chip
            label="[MOCK DATA]"
            size="small"
            sx={{
              borderRadius: 0,
              fontSize: '11px',
              height: '20px',
              bgcolor: '#f9f9f9',
              color: '#0d0d0d',
              fontWeight: 600,
              border: '1px solid rgba(0, 0, 0, 0.1)',
            }}
          />
        )}
        {ev.confidence !== null && ev.confidence !== undefined && (
          <Chip
            label={`${(ev.confidence * 100).toFixed(0)}% keyakinan`}
            size="small"
            variant="outlined"
            sx={{
              borderRadius: 0,
              fontSize: '11px',
              height: '20px',
              borderColor: 'rgba(0, 0, 0, 0.1)',
              color: '#5d5d5d',
            }}
          />
        )}
        {snapshotUrl && (
          <Chip
            label="Ada snapshot"
            size="small"
            variant="outlined"
            sx={{
              borderRadius: 0,
              fontSize: '11px',
              height: '20px',
              borderColor: 'rgba(0, 0, 0, 0.1)',
              color: '#5d5d5d',
              bgcolor: '#f9f9f9',
            }}
          />
        )}
      </Box>
      <Typography variant="caption" sx={{ color: '#8f8f8f', fontSize: '12px' }}>
        {time}
      </Typography>
      {metaEntries.length > 0 && (
        <Box sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {metaEntries.slice(0, 6).map(([k, v]) => (
            <Typography key={k} variant="caption" sx={{ color: '#5d5d5d', fontSize: '12px' }}>
              {k}: <strong style={{ color: '#0d0d0d', fontWeight: 500 }}>{String(v)}</strong>
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
          <Skeleton
            key={i}
            variant="rounded"
            height={68}
            sx={{ borderRadius: '10px', bgcolor: 'rgba(0, 0, 0, 0.04)' }}
          />
        ))}
      </Stack>
    )
  }

  if (isError) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 3,
          textAlign: 'center',
          borderRadius: '10px',
          borderColor: 'rgba(0, 0, 0, 0.1)',
          bgcolor: '#f9f9f9',
        }}
      >
        <Typography sx={{ color: '#0d0d0d', fontWeight: 600, mb: 0.5 }}>
          Gagal memuat event
        </Typography>
        <Typography variant="caption" sx={{ color: '#8f8f8f' }}>
          {errorMessage ?? 'Periksa koneksi dan coba lagi'}
        </Typography>
      </Paper>
    )
  }

  if (isEmpty || items.length === 0) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 4,
          textAlign: 'center',
          borderRadius: '10px',
          borderColor: 'rgba(0, 0, 0, 0.1)',
          bgcolor: '#f9f9f9',
        }}
      >
        <Typography sx={{ color: '#8f8f8f', fontSize: '14px' }}>
          Belum ada event yang tercatat
        </Typography>
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  color: '#8f8f8f',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontSize: '12px',
                }}
              >
                {dateLabel}
              </Typography>
              <Divider sx={{ flex: 1, borderColor: 'rgba(0, 0, 0, 0.1)' }} />
            </Box>
            <Stack spacing={1}>
              {evs.map((ev) => (
                <EventCard key={ev.id} ev={ev} />
              ))}
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
