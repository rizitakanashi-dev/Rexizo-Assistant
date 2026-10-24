import {
  Badge,
  Box,
  Button,
  Divider,
  FormControlLabel,
  IconButton,
  Popover,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material'
import ShieldIcon from '@mui/icons-material/Shield'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import { useState } from 'react'
import { SecurityAnnouncerSettings } from '@/hooks/useSecurityAnnouncer'

interface Props {
  settings: SecurityAnnouncerSettings
  onUpdateSettings: (settings: Partial<SecurityAnnouncerSettings>) => void
  onTestAlert: () => void
}

export function SecurityAnnouncerButton({
  settings,
  onUpdateSettings,
  onTestAlert,
}: Props) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null)

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleDesktopAlertToggle = (checked: boolean) => {
    if (checked && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then((perm) => {
          onUpdateSettings({ desktopAlert: perm === 'granted' })
        })
        return
      }
    }
    onUpdateSettings({ desktopAlert: checked })
  }

  const open = Boolean(anchorEl)

  return (
    <>
      <Tooltip title="Pengaturan Peringatan Suara CCTV">
        <IconButton
          size="small"
          onClick={handleClick}
          sx={{
            p: '6px',
            borderRadius: '10px',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            bgcolor: settings.enabled ? '#ffffff' : 'rgba(0, 0, 0, 0.04)',
            color: settings.enabled ? '#0d0d0d' : '#8f8f8f',
            '&:hover': {
              bgcolor: 'rgba(0, 0, 0, 0.05)',
              borderColor: 'rgba(0, 0, 0, 0.2)',
            },
          }}
        >
          <Badge
            color={settings.enabled ? 'success' : 'default'}
            variant="dot"
            invisible={false}
            sx={{
              '& .MuiBadge-badge': {
                bgcolor: settings.enabled ? '#2e7d32' : '#8f8f8f',
              },
            }}
          >
            <ShieldIcon sx={{ fontSize: 18 }} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            p: 2,
            width: 320,
            borderRadius: '12px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
          },
        }}
      >
        <Box sx={{ mb: 1.5 }}>
          <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#0d0d0d' }}>
            Peringatan Suara CCTV (Security)
          </Typography>
          <Typography sx={{ fontSize: '11.5px', color: '#5d5d5d', mt: 0.25 }}>
            Asisten otomatis mengumumkan saat terdeteksi gerakan atau orang di feed kamera.
          </Typography>
        </Box>

        <Divider sx={{ my: 1.5, borderColor: 'rgba(0,0,0,0.08)' }} />

        <Stack spacing={1.5}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={settings.enabled}
                onChange={(e) => onUpdateSettings({ enabled: e.target.checked })}
                color="default"
              />
            }
            label={
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 500, color: '#0d0d0d' }}>
                  Aktifkan Security Announcer
                </Typography>
                <Typography sx={{ fontSize: '11px', color: '#8f8f8f' }}>
                  Memonitor event real-time dari kamera CCTV
                </Typography>
              </Box>
            }
            sx={{ m: 0, alignItems: 'flex-start' }}
          />

          <FormControlLabel
            control={
              <Switch
                size="small"
                disabled={!settings.enabled}
                checked={settings.voiceAlert}
                onChange={(e) => onUpdateSettings({ voiceAlert: e.target.checked })}
                color="default"
              />
            }
            label={
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 500, color: '#0d0d0d' }}>
                  Suara Asisten (Neural TTS)
                </Typography>
                <Typography sx={{ fontSize: '11px', color: '#8f8f8f' }}>
                  Mengumumkan via suara Nozomi / Butler
                </Typography>
              </Box>
            }
            sx={{ m: 0, alignItems: 'flex-start' }}
          />

          <FormControlLabel
            control={
              <Switch
                size="small"
                disabled={!settings.enabled}
                checked={settings.personOnly}
                onChange={(e) => onUpdateSettings({ personOnly: e.target.checked })}
                color="default"
              />
            }
            label={
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 500, color: '#0d0d0d' }}>
                  Hanya saat Terdeteksi Orang
                </Typography>
                <Typography sx={{ fontSize: '11px', color: '#8f8f8f' }}>
                  Abaikan gerakan umum, fokus deteksi manusia
                </Typography>
              </Box>
            }
            sx={{ m: 0, alignItems: 'flex-start' }}
          />

          <FormControlLabel
            control={
              <Switch
                size="small"
                disabled={!settings.enabled}
                checked={settings.desktopAlert}
                onChange={(e) => handleDesktopAlertToggle(e.target.checked)}
                color="default"
              />
            }
            label={
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 500, color: '#0d0d0d' }}>
                  Notifikasi Desktop Browser
                </Typography>
                <Typography sx={{ fontSize: '11px', color: '#8f8f8f' }}>
                  Banner pop-up desktop browser (HTML5)
                </Typography>
              </Box>
            }
            sx={{ m: 0, alignItems: 'flex-start' }}
          />

          <Divider sx={{ my: 1, borderColor: 'rgba(0,0,0,0.08)' }} />

          <Button
            fullWidth
            size="small"
            variant="outlined"
            startIcon={<VolumeUpIcon sx={{ fontSize: 16 }} />}
            onClick={() => {
              onTestAlert()
              handleClose()
            }}
            sx={{
              borderColor: 'rgba(0,0,0,0.15)',
              color: '#0d0d0d',
              borderRadius: '8px',
              textTransform: 'none',
              fontSize: '12.5px',
              fontWeight: 500,
              py: 0.75,
              '&:hover': {
                borderColor: '#0d0d0d',
                bgcolor: 'rgba(0,0,0,0.04)',
              },
            }}
          >
            Uji Peringatan Suara Sekarang
          </Button>
        </Stack>
      </Popover>
    </>
  )
}
