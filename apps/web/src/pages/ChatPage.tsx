import { Box } from '@mui/material'
import { ChatPanel } from '@/components/chat/ChatPanel'

export function ChatPage() {
  return (
    <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#ffffff' }}>
      <ChatPanel />
    </Box>
  )
}
