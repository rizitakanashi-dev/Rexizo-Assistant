import { create } from 'zustand'

interface UiState {
  chatOpen: boolean
  toggleChat: () => void
  setChatOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  chatOpen: false,
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  setChatOpen: (open) => set({ chatOpen: open }),
}))
