import { Box, Paper } from '@mui/material'
import { ChatPanel } from '@/components/chat/ChatPanel'

export function ChatPage() {
  return (
    <Box
      sx={{
        height: 'calc(100vh - 100px)',
        maxWidth: '768px',
        mx: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          flex: 1,
          overflow: 'hidden',
          borderRadius: '10px',
          borderColor: 'rgba(0, 0, 0, 0.1)',
          bgcolor: '#ffffff',
          boxShadow: 'none',
        }}
      >
        <ChatPanel />
      </Paper>
    </Box>
  )
}
