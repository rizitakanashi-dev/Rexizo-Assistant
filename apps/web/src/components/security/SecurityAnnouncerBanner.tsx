import {
  Box,
  Button,
  IconButton,
  Slide,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import VideocamIcon from '@mui/icons-material/Videocam'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { useNavigate } from 'react-router-dom'
import { SecurityAlert } from '@/hooks/useSecurityAnnouncer'

interface Props {
  alert: SecurityAlert | null
  onDismiss: () => void
}

export function SecurityAnnouncerBanner({ alert, onDismiss }: Props) {
  const navigate = useNavigate()

  if (!alert) return null

  return (
    <Slide direction="down" in={Boolean(alert)}>
      <Box
        sx={{
          position: 'fixed',
          top: 60,
          right: { xs: 16, sm: 24 },
          zIndex: 9999,
          maxWidth: 420,
          width: 'calc(100vw - 32px)',
          bgcolor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
          border: '1.5px solid #d32f2f',
          overflow: 'hidden',
          p: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Box
            sx={{
              p: 1,
              borderRadius: '8px',
              bgcolor: '#ffebee',
              color: '#d32f2f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'pulse 1.5s infinite',
              '@keyframes pulse': {
                '0%': { transform: 'scale(1)' },
                '50%': { transform: 'scale(1.08)' },
                '100%': { transform: 'scale(1)' },
              },
            }}
          >
            <WarningAmberIcon sx={{ fontSize: 22 }} />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography sx={{ fontSize: '13px', fontWeight: 700, color: '#d32f2f', letterSpacing: '0.2px' }}>
                PERINGATAN KEAMANAN CCTV
              </Typography>
              <IconButton size="small" onClick={onDismiss} sx={{ p: '2px', color: '#8f8f8f' }}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>

            <Typography sx={{ fontSize: '13px', fontWeight: 500, color: '#0d0d0d', mb: 0.75 }}>
              {alert.message}
            </Typography>

            <Typography sx={{ fontSize: '11px', color: '#5d5d5d', mb: 1.5 }}>
              Kamera: <b>{alert.camera_name}</b> • {new Date(alert.timestamp).toLocaleTimeString('id-ID')}
            </Typography>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="contained"
                startIcon={<VideocamIcon sx={{ fontSize: 16 }} />}
                onClick={() => {
                  navigate('/cameras')
                  onDismiss()
                }}
                sx={{
                  bgcolor: '#0d0d0d',
                  color: '#ffffff',
                  textTransform: 'none',
                  fontSize: '12px',
                  borderRadius: '6px',
                  px: 1.5,
                  py: 0.5,
                  '&:hover': { bgcolor: '#222222' },
                }}
              >
                Lihat Kamera
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={onDismiss}
                sx={{
                  borderColor: 'rgba(0,0,0,0.15)',
                  color: '#5d5d5d',
                  textTransform: 'none',
                  fontSize: '12px',
                  borderRadius: '6px',
                  px: 1.5,
                  py: 0.5,
                }}
              >
                Tutup
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </Slide>
  )
}
