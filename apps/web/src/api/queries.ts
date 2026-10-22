import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import {
  Camera,
  ChatHistory,
  ChatResponse,
  EventPage,
  HealthResponse,
  SystemStatus,
} from '@/types'

export const useHealth = () =>
  useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    refetchInterval: 15000,
  })

export const useSystemStatus = () =>
  useQuery({
    queryKey: ['system-status'],
    queryFn: () => api.get<SystemStatus>('/system/status'),
    refetchInterval: 15000,
  })

export const useCameras = () =>
  useQuery({
    queryKey: ['cameras'],
    queryFn: () => api.get<Camera[]>('/cameras'),
    refetchInterval: 5000,
  })

export const useEvents = (params: Record<string, string | number | undefined> = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v))
  })
  const qs = search.toString()
  return useQuery({
    queryKey: ['events', params],
    queryFn: () => api.get<EventPage>(`/events${qs ? `?${qs}` : ''}`),
    refetchInterval: 10000,
  })
}

export const useChatHistory = (conversationId = 'conv_default', limit = 50) =>
  useQuery({
    queryKey: ['chat-history', conversationId, limit],
    queryFn: () =>
      api.get<ChatHistory>(`/chat/history?conversation_id=${encodeURIComponent(conversationId)}&limit=${limit}`),
  })

export const useSendMessage = (conversationId = 'conv_default') => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { message: string; client_message_id?: string }) =>
      api.post<ChatResponse>('/chat/messages', { conversation_id: conversationId, ...payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-history', conversationId] })
    },
  })
}
