import {
  AppBar,
  Box,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
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
import { ChatPanel } from '../chat/ChatPanel'
import { useUiStore } from '@/store/ui'

const NAV_WIDTH = 200

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon fontSize="small" /> },
  { label: 'Kamera', path: '/cameras', icon: <VideocamIcon fontSize="small" /> },
  { label: 'Events', path: '/events', icon: <TimelineIcon fontSize="small" /> },
  { label: 'Pengaturan', path: '/settings', icon: <SettingsIcon fontSize="small" /> },
]

function SideNav({ onClose }: { onClose?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <Box sx={{ width: NAV_WIDTH, pt: 1 }}>
      <List dense>
        {NAV_ITEMS.map((item) => {
          const active = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path)
          return (
            <ListItem key={item.path} disablePadding>
              <ListItemButton
                selected={active}
                onClick={() => { navigate(item.path); onClose?.() }}
                sx={{ borderRadius: 1, mx: 0.5, mb: 0.25 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2' }} />
              </ListItemButton>
            </ListItem>
          )
        })}
      </List>
    </Box>
  )
}

export function AppShell({ children }: PropsWithChildren) {
  const { chatOpen, toggleChat } = useUiStore()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)', zIndex: theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1.5 }}>
          {isMobile && (
            <IconButton color="inherit" size="small" onClick={() => setMobileNavOpen(true)}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ fontWeight: 700, mr: 1 }}>
            JARVIS
          </Typography>
          <Chip label="v0.1" size="small" variant="outlined" sx={{ opacity: 0.6 }} />
          <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
            <StatusStrip />
          </Box>
          <Tooltip title="Chat JARVIS">
            <IconButton color="inherit" onClick={toggleChat}>
              <ChatIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
        <MockBanner />
      </AppBar>

      <Box sx={{ display: 'flex', flex: 1 }}>
        {/* Desktop sidebar */}
        {!isMobile && (
          <Box
            component="nav"
            sx={{
              width: NAV_WIDTH,
              flexShrink: 0,
              borderRight: '1px solid rgba(255,255,255,0.08)',
              bgcolor: 'background.paper',
            }}
          >
            <SideNav />
          </Box>
        )}

        {/* Mobile nav drawer */}
        <Drawer
          anchor="left"
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          PaperProps={{ sx: { width: NAV_WIDTH + 16 } }}
        >
          <Toolbar />
          <SideNav onClose={() => setMobileNavOpen(false)} />
        </Drawer>

        <Box component="main" sx={{ flex: 1, p: { xs: 2, md: 3 }, overflow: 'auto' }}>
          {children}
        </Box>
      </Box>

      {/* Chat drawer */}
      <Drawer
        anchor="right"
        open={chatOpen}
        onClose={toggleChat}
        PaperProps={{ sx: { width: { xs: '100%', sm: 420 } } }}
      >
        <ChatPanel />
      </Drawer>
    </Box>
  )
}
