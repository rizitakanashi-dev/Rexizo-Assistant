import {
  Box,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import ChatIcon from '@mui/icons-material/Chat'
import DashboardIcon from '@mui/icons-material/Dashboard'
import VideocamIcon from '@mui/icons-material/Videocam'
import TimelineIcon from '@mui/icons-material/Timeline'
import SettingsIcon from '@mui/icons-material/Settings'
import MenuIcon from '@mui/icons-material/Menu'
import { PropsWithChildren, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { StatusStrip } from '../status/StatusStrip'
import { MockBanner } from './MockBanner'
import { useSecurityAnnouncer } from '@/hooks/useSecurityAnnouncer'
import { SecurityAnnouncerButton } from '../security/SecurityAnnouncerButton'
import { SecurityAnnouncerBanner } from '../security/SecurityAnnouncerBanner'

const NAV_WIDTH = 260

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon fontSize="small" sx={{ color: '#0d0d0d' }} /> },
  { label: 'Asisten AI', path: '/chat', icon: <ChatIcon fontSize="small" sx={{ color: '#0d0d0d' }} /> },
  { label: 'Kamera', path: '/cameras', icon: <VideocamIcon fontSize="small" sx={{ color: '#0d0d0d' }} /> },
  { label: 'Events', path: '/events', icon: <TimelineIcon fontSize="small" sx={{ color: '#0d0d0d' }} /> },
  { label: 'Pengaturan', path: '/settings', icon: <SettingsIcon fontSize="small" sx={{ color: '#0d0d0d' }} /> },
]

function SideNavContent({ onClose }: { onClose?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#f9f9f9' }}>
      {/* Sidebar Header */}
      <Box
        sx={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
        }}
      >
        <Typography variant="body1" sx={{ fontWeight: 600, color: '#0d0d0d', letterSpacing: '0px' }}>
          REXIZO
        </Typography>
        <Chip
          label="v0.1"
          size="small"
          sx={{
            borderRadius: 0,
            fontSize: '11px',
            height: '20px',
            bgcolor: '#ffffff',
            borderColor: 'rgba(0, 0, 0, 0.1)',
            color: '#5d5d5d',
          }}
        />
      </Box>

      {/* Navigation List */}
      <Box sx={{ flex: 1, p: 1, overflowY: 'auto' }}>
        <List dense disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {NAV_ITEMS.map((item) => {
            const active =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path)
            return (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  selected={active}
                  onClick={() => {
                    navigate(item.path)
                    onClose?.()
                  }}
                  sx={{
                    borderRadius: '10px',
                    px: '10px',
                    py: '6px',
                    bgcolor: active ? 'rgba(0, 0, 0, 0.06)' : 'transparent',
                    '&:hover': {
                      bgcolor: 'rgba(0, 0, 0, 0.05)',
                    },
                    '&.Mui-selected': {
                      bgcolor: 'rgba(0, 0, 0, 0.06)',
                      '&:hover': {
                        bgcolor: 'rgba(0, 0, 0, 0.08)',
                      },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>{item.icon}</ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: '14px',
                      fontWeight: active ? 600 : 400,
                      color: '#0d0d0d',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            )
          })}
        </List>
      </Box>

      {/* Sidebar Footer */}
      <Box
        sx={{
          p: 1.5,
          borderTop: '1px solid rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        <ListItemButton
          selected={location.pathname === '/chat'}
          onClick={() => {
            navigate('/chat')
            onClose?.()
          }}
          sx={{
            borderRadius: '10px',
            px: '10px',
            py: '8px',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            bgcolor: location.pathname === '/chat' ? 'rgba(0, 0, 0, 0.06)' : '#ffffff',
            '&:hover': {
              bgcolor: 'rgba(0, 0, 0, 0.05)',
              borderColor: 'rgba(0, 0, 0, 0.2)',
            },
          }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <ChatIcon fontSize="small" sx={{ color: '#0d0d0d' }} />
          </ListItemIcon>
          <ListItemText
            primary="Asisten REXIZO"
            secondary="Buka obrolan AI"
            primaryTypographyProps={{ fontSize: '13px', fontWeight: location.pathname === '/chat' ? 600 : 500, color: '#0d0d0d' }}
            secondaryTypographyProps={{ fontSize: '12px', color: '#8f8f8f' }}
          />
        </ListItemButton>
      </Box>
    </Box>
  )
}

export function AppShell({ children }: PropsWithChildren) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const securityAnnouncer = useSecurityAnnouncer()
  const location = useLocation()
  const navigate = useNavigate()
  const isChatPage = location.pathname.startsWith('/chat')

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#ffffff' }}>
      <SecurityAnnouncerBanner
        alert={securityAnnouncer.activeAlert}
        onDismiss={securityAnnouncer.dismissAlert}
      />
      {/* Desktop sidebar */}
      {!isMobile && (
        <Box
          component="nav"
          sx={{
            width: NAV_WIDTH,
            flexShrink: 0,
            borderRight: '1px solid rgba(0, 0, 0, 0.1)',
            bgcolor: '#f9f9f9',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflow: 'hidden',
          }}
        >
          <SideNavContent />
        </Box>
      )}

      {/* Mobile nav drawer */}
      <Drawer
        anchor="left"
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        PaperProps={{
          sx: {
            width: NAV_WIDTH,
            bgcolor: '#f9f9f9',
            borderRight: '1px solid rgba(0, 0, 0, 0.1)',
            boxShadow: 'none',
          },
        }}
      >
        <SideNavContent onClose={() => setMobileNavOpen(false)} />
      </Drawer>

      {/* Main column */}
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        {/* Top bar header */}
        <Box
          component="header"
          sx={{
            height: 52,
            px: { xs: 2, md: 3 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
            bgcolor: '#ffffff',
            position: 'sticky',
            top: 0,
            zIndex: theme.zIndex.appBar,
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            {isMobile && (
              <IconButton
                size="small"
                onClick={() => setMobileNavOpen(true)}
                sx={{
                  color: '#0d0d0d',
                  p: '6px',
                  borderRadius: '10px',
                  '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.05)' },
                }}
              >
                <MenuIcon fontSize="small" />
              </IconButton>
            )}
            <StatusStrip />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityAnnouncerButton
              settings={securityAnnouncer.settings}
              onUpdateSettings={securityAnnouncer.updateSettings}
              onTestAlert={securityAnnouncer.testAlert}
            />
            <Tooltip title="Buka Asisten AI">
              <IconButton
                size="small"
                onClick={() => navigate('/chat')}
                sx={{
                  color: isChatPage ? '#ffffff' : '#0d0d0d',
                  p: '6px',
                  borderRadius: '10px',
                  border: isChatPage ? '1px solid #0d0d0d' : '1px solid rgba(0, 0, 0, 0.1)',
                  bgcolor: isChatPage ? '#0d0d0d' : '#ffffff',
                  '&:hover': {
                    bgcolor: isChatPage ? '#222222' : 'rgba(0, 0, 0, 0.05)',
                  },
                }}
              >
                <ChatIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {!isChatPage && <MockBanner />}

        {/* Page body content */}
        <Box
          component="main"
          sx={{
            flex: 1,
            p: isChatPage ? 0 : { xs: 2, md: 3 },
            maxWidth: isChatPage ? 'none' : '1200px',
            width: '100%',
            mx: isChatPage ? 0 : 'auto',
            display: 'flex',
            flexDirection: 'column',
            height: isChatPage ? 'calc(100vh - 52px)' : 'auto',
            overflow: isChatPage ? 'hidden' : 'visible',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}
