import { AiState, CameraStatus, ChatMeta, EventItem, ToolExecution } from '@/types'

/** Alias dari enum kanonik `AiState` (ruling G-7). */
export type AiUiState = AiState

export interface NormalizedError {
  kind: string
  http?: number
  retryable: boolean
  code: string
}

const UPPERCASE_MAP: Record<string, NormalizedError> = {
  AI_INVALID_REQUEST: { kind: 'invalid_request', retryable: false, code: 'AI_INVALID_REQUEST' },
  TOOL_DENIED: { kind: 'tool_denied', retryable: false, code: 'TOOL_DENIED' },
  TOOL_NOT_ALLOWED: { kind: 'tool_not_allowed', retryable: false, code: 'TOOL_NOT_ALLOWED' },
  AI_PROVIDER_ERROR: { kind: 'provider_error', retryable: true, code: 'AI_PROVIDER_ERROR' },
  AI_UNAVAILABLE: { kind: 'unavailable', retryable: true, code: 'AI_UNAVAILABLE' },
  AI_TIMEOUT: { kind: 'timeout', retryable: true, code: 'AI_TIMEOUT' },
  AI_RATE_LIMITED: { kind: 'rate_limited', retryable: false, code: 'AI_RATE_LIMITED' },
  AI_DISABLED: { kind: 'disabled', retryable: false, code: 'AI_DISABLED' },
  NOT_FOUND: { kind: 'not_found', retryable: false, code: 'NOT_FOUND' },
  INTERNAL_ERROR: { kind: 'internal_error', retryable: true, code: 'INTERNAL_ERROR' },
}

const LOWERCASE_MAP: Record<string, NormalizedError> = {
  llm_invalid_response: { kind: 'provider_error', retryable: true, code: 'AI_PROVIDER_ERROR' },
  llm_request_rejected: { kind: 'provider_error', retryable: true, code: 'AI_PROVIDER_ERROR' },
  llm_unavailable: { kind: 'unavailable', retryable: true, code: 'AI_UNAVAILABLE' },
  llm_timeout: { kind: 'timeout', retryable: true, code: 'AI_TIMEOUT' },
  ai_timeout: { kind: 'timeout', retryable: true, code: 'AI_TIMEOUT' },
  llm_quota_exceeded: { kind: 'rate_limited', retryable: false, code: 'AI_RATE_LIMITED' },
  llm_auth_failed: { kind: 'auth', retryable: false, code: 'AI_PROVIDER_ERROR' },
  ai_disabled: { kind: 'disabled', retryable: false, code: 'AI_DISABLED' },
  llm_circuit_open: { kind: 'unavailable', retryable: true, code: 'AI_UNAVAILABLE' },
  internal_error: { kind: 'internal_error', retryable: true, code: 'INTERNAL_ERROR' },
}

export function mapErrorCode(code?: string | null): NormalizedError {
  if (!code) return { kind: 'unknown', retryable: true, code: 'UNKNOWN' }
  if (UPPERCASE_MAP[code]) return UPPERCASE_MAP[code]
  if (LOWERCASE_MAP[code]) return LOWERCASE_MAP[code]
  // try uppercase
  const up = code.toUpperCase()
  if (UPPERCASE_MAP[up]) return UPPERCASE_MAP[up]
  return { kind: 'unknown', retryable: true, code }
}

/**
 * Kosakata status AI kanonik (ruling G-7 / G-8).
 *
 * `mock` bukan lagi nilai utama yang dipakai backend, tetapi tetap diterima
 * sebagai alias legacy agar payload lama tidak membuat UI salah baca.
 */
const AI_STATE_ALIASES: Record<string, AiUiState> = {
  available: 'available',
  degraded: 'degraded',
  unavailable: 'unavailable',
  not_configured: 'not_configured',
  disabled: 'disabled',
  mock: 'not_configured',
}

function toAiState(value?: string | null): AiUiState | null {
  if (!value) return null
  return AI_STATE_ALIASES[value.trim().toLowerCase()] ?? null
}

export function mapAiState(
  health?: { components?: Record<string, string> } | null,
  systemStatus?: {
    ai?: { enabled?: boolean; degraded?: boolean; state?: string | null } | null
  } | null,
): AiUiState {
  const ai = systemStatus?.ai
  const llmService = health?.components?.llm_service

  // 1. `ai.state` otoritatif (ruling G-7) — backend yang tahu kondisi sebenarnya.
  const fromAiState = toAiState(ai?.state)
  if (fromAiState) return fromAiState

  // 2. `components.llm_service` memakai kosakata kanonik yang sama (ruling G-8).
  const fromHealth = toAiState(llmService)
  if (fromHealth) return fromHealth

  // 3. Heuristik fallback untuk backend yang belum mengirim field baru.
  if (ai && ai.enabled === false) return 'disabled'
  if (ai && ai.enabled && ai.degraded) return 'degraded'
  if (ai && ai.enabled && !ai.degraded) return 'available'
  return 'degraded'
}

export function displayToolName(toolName?: string | null): string {
  if (!toolName) return 'Tool'
  const map: Record<string, string> = {
    get_camera_list: 'Daftar kamera',
    list_cameras: 'Daftar kamera',
    get_recent_events: 'Event terbaru',
    search_events: 'Cari event',
    get_system_status: 'Status sistem',
    restart_camera_stream: 'Restart stream kamera',
    delete_event_history: 'Hapus riwayat event',
    launch_application: 'Buka aplikasi Linux',
    open_app: 'Buka aplikasi Linux',
    launch_app: 'Buka aplikasi Linux',
    system_control: 'Kontrol sistem Linux',
    control_system: 'Kontrol sistem Linux',
    run_terminal_command: 'Eksekusi perintah terminal',
    terminal_exec: 'Eksekusi perintah terminal',
    run_command: 'Eksekusi perintah terminal',
    take_screenshot: 'Tangkapan layar desktop',
    screenshot: 'Tangkapan layar desktop',
  }
  if (map[toolName]) return map[toolName]
  return toolName.replace(/_/g, ' ')
}

export function mapToolStatus(status?: string | null): {
  label: string
  color: 'success' | 'error' | 'warning' | 'default'
} {
  if (!status) return { label: 'Tidak diketahui', color: 'default' }
  const s = status.toLowerCase()
  // `success` = nilai kanonik; `ok` = nilai legacy yang masih dikirim backend lama.
  if (s === 'success' || s === 'ok') return { label: 'Berhasil', color: 'success' }
  if (s === 'denied') return { label: 'Ditolak', color: 'warning' }
  if (s === 'error') return { label: 'Gagal', color: 'error' }
  if (s === 'invalid_arguments') return { label: 'Argumen tidak valid', color: 'warning' }
  if (s === 'timeout') return { label: 'Timeout', color: 'warning' }
  return { label: status, color: 'default' }
}

export function getToolName(exec: ToolExecution): string | undefined {
  return exec.tool_name || exec.name || undefined
}

export function resolveMediaPath(path?: string | null, apiBase = ''): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (path.startsWith('/')) return `${apiBase}${path}`
  return `${apiBase}/${path}`
}

/**
 * Resolve URL snapshot event.
 *
 * `snapshot_url` (ruling C-8) lebih diprioritaskan; `snapshot_path` tetap
 * dipakai sebagai fallback karena isinya identik dan backend lama belum
 * mengirim alias baru.
 */
export function resolveEventSnapshot(
  ev: Partial<Pick<EventItem, 'snapshot_url' | 'snapshot_path'>> | null | undefined,
  apiBase = '',
): string | null {
  if (!ev) return null
  const raw = ev.snapshot_url || ev.snapshot_path
  if (!raw) return null
  return resolveMediaPath(raw, apiBase) || null
}

export type CameraStatusColor = 'success' | 'error' | 'warning' | 'info' | 'default'

export interface CameraStatusView {
  label: string
  color: CameraStatusColor
}

/**
 * Label + warna untuk status kamera.
 *
 * `reconnecting` (ruling C-2) dibedakan dari `connecting` (koneksi pertama)
 * dan `offline` (kamera benar-benar mati).
 */
export function mapCameraStatus(status?: CameraStatus | string | null): CameraStatusView {
  switch ((status ?? '').toLowerCase()) {
    case 'online':
      return { label: 'Online', color: 'success' }
    case 'offline':
      return { label: 'Offline', color: 'error' }
    case 'connecting':
      return { label: 'Menghubungkan', color: 'info' }
    case 'reconnecting':
      return { label: 'Menghubungkan kembali', color: 'warning' }
    case 'error':
      return { label: 'Kesalahan', color: 'error' }
    default:
      return { label: status ? String(status) : 'Tidak diketahui', color: 'default' }
  }
}

export function getGroundingChip(meta?: ChatMeta | null): { label: string; color: 'warning' | 'default' } | null {
  if (!meta?.stop_reason) return null
  if (meta.stop_reason === 'no_tool_grounding') {
    return { label: 'Jawaban tanpa klaim faktual — tidak ada data yang dirujuk', color: 'warning' }
  }
  if (meta.stop_reason === 'max_rounds') {
    return { label: 'Batas penalaran tool tercapai — jawaban mungkin belum lengkap', color: 'warning' }
  }
  return null
}
