export type CameraStatus = 'online' | 'offline' | 'connecting' | 'error'
export type EventType = 'motion' | 'object_detected' | 'camera_status' | (string & {})

export interface Camera {
  id: string
  name: string
  is_enabled: boolean
  status: CameraStatus
  fps: number
  last_seen_at: string | null
  stream_url_preview: string | null
  snapshot_url: string | null
}

export interface EventItem {
  id: string
  camera_id: string
  camera_name: string
  event_type: EventType
  timestamp: string
  confidence: number | null
  metadata: Record<string, unknown>
  snapshot_path: string | null
  is_mock: boolean
}

export interface EventPage {
  total: number
  limit: number
  offset: number
  items: EventItem[]
}

export type ToolExecStatus = 'ok' | 'error' | 'denied' | string

export interface ToolExecution {
  name?: string
  tool_name?: string
  status: ToolExecStatus
  duration_ms?: number
  parameters?: Record<string, unknown>
  result?: unknown
  result_summary?: string | null
  error?: string | null
}

export interface ChatMeta {
  provider?: string
  model?: string
  latency_ms?: number
  rounds?: number
  tool_calls?: number
  stop_reason?: 'completed' | 'no_tool_grounding' | 'max_rounds' | string
  degraded?: boolean
  usage?: Record<string, unknown>
  [key: string]: unknown
}

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  tool_name?: string | null
  created_at: string
}

export interface ChatHistory {
  conversation_id: string
  messages: ChatMessage[]
}

export interface ChatResponse {
  conversation_id: string
  message_id?: string
  reply: string
  tools_executed: ToolExecution[]
  meta: ChatMeta
  created_at: string
}

export interface HealthComponents {
  [key: string]: string
}

export interface HealthResponse {
  status: string
  version: string
  uptime_seconds: number
  components: HealthComponents
}

export interface AiStatus {
  enabled: boolean
  provider: string
  model?: string | null
  degraded: boolean
  tool_mode?: string
}

export interface SystemStatus {
  cpu_usage_percent: number
  memory_usage_percent: number
  disk_free_gb: number
  active_cameras: number
  total_cameras: number
  events_today: number
  uptime_seconds?: number
  ai: AiStatus
}

export interface ApiError {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
