import { supabase } from './supabase'

// ---------- 타입 ----------
export type PublicSlot = {
  id: number
  starts_at: string
  ends_at: string
  remaining: number
}

export type PublicState = {
  now: string
  booking_open: boolean
  booth_title: string
  notice: string | null
  slots: PublicSlot[]
}

export type BookingStatus = 'booked' | 'checked_in' | 'cancelled'

export type MyBooking = {
  code: string
  status: BookingStatus
  starts_at: string
  ends_at: string
}

export type BookErrorCode =
  | 'BOOKING_CLOSED'
  | 'SLOT_FULL'
  | 'SLOT_STARTED'
  | 'SLOT_UNAVAILABLE'
  | 'ALREADY_BOOKED'
  | 'INVALID_REQUEST'

export type BookResult =
  | { ok: true; booking: MyBooking }
  | { ok: false; error: BookErrorCode; booking?: MyBooking }

export type CancelResult =
  | { ok: true; booking: MyBooking }
  | { ok: false; error: 'NOT_FOUND' | 'NOT_CANCELLABLE'; status?: BookingStatus }

// ---------- 오류 ----------
/** 통신 자체가 실패한 경우 (네트워크, 시간 초과, 설정 누락 등) */
export class ApiError extends Error {
  readonly kind: 'NETWORK' | 'NOT_CONFIGURED'
  constructor(kind: 'NETWORK' | 'NOT_CONFIGURED', message?: string) {
    super(message ?? kind)
    this.kind = kind
  }
}

/** 서버 오류 코드 → 관람객 문구 */
export const VISITOR_MESSAGES: Record<string, string> = {
  BOOKING_CLOSED: '지금은 예약 없이 바로 체험하실 수 있어요. 부스로 오세요.',
  SLOT_FULL: '방금 마감됐어요. 다른 시간대를 골라 주세요.',
  SLOT_STARTED: '이미 시작된 시간대예요. 다음 시간대를 골라 주세요.',
  SLOT_UNAVAILABLE: '지금은 예약할 수 없는 시간대예요. 다른 시간대를 골라 주세요.',
  INVALID_REQUEST: '요청을 처리하지 못했어요. 화면을 새로고침한 뒤 다시 시도해 주세요.',
  NOT_CANCELLABLE: '이미 방문 처리되었거나 취소된 예약이에요.',
  NOT_FOUND: '예약을 찾지 못했어요.',
  NETWORK: '연결이 불안정해요. 잠시 후 다시 눌러 주세요.',
  NOT_CONFIGURED: '예약 서버 설정이 아직 끝나지 않았어요. 부스 스태프에게 알려 주세요.',
}

// ---------- RPC 호출 ----------
const TIMEOUT_MS = 10_000

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new ApiError('NOT_CONFIGURED')
  let result
  try {
    result = await supabase.rpc(fn, args).abortSignal(AbortSignal.timeout(TIMEOUT_MS))
  } catch (e) {
    throw new ApiError('NETWORK', String(e))
  }
  if (result.error) throw new ApiError('NETWORK', result.error.message)
  return result.data as T
}

export const getPublicState = () => rpc<PublicState>('get_public_state')

export const bookSlot = (slotId: number, deviceToken: string) =>
  rpc<BookResult>('book_slot', { p_slot_id: slotId, p_device_token: deviceToken })

export const getMyBooking = (deviceToken: string, code: string) =>
  rpc<MyBooking | null>('get_my_booking', { p_device_token: deviceToken, p_code: code })

export const cancelMyBooking = (deviceToken: string, code: string) =>
  rpc<CancelResult>('cancel_my_booking', { p_device_token: deviceToken, p_code: code })

export function messageFor(e: unknown): string {
  if (e instanceof ApiError) return VISITOR_MESSAGES[e.kind]
  return VISITOR_MESSAGES.NETWORK
}
