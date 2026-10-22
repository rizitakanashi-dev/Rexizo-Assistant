import { Box, Paper } from '@mui/material'
import { ChatPanel } from '@/components/chat/ChatPanel'

export function ChatPage() {
  return (
    <Box sx={{ height: 'calc(100vh - 140px)' }}>
      <Paper variant="outlined" sx={{ height: '100%', overflow: 'hidden' }}>
        <ChatPanel />
      </Paper>
    </Box>
  )
}
