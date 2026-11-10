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
  /** 예약 마감 (마이그레이션 007 이전 DB에는 없음 → undefined) */
  booking_ended?: boolean
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
  | 'BOOKING_ENDED'
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
export type ApiErrorKind = 'NETWORK' | 'NOT_CONFIGURED' | 'UNAUTHORIZED'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  constructor(kind: ApiErrorKind, message?: string) {
    super(message ?? kind)
    this.kind = kind
  }
}

/** 서버 오류 코드 → 관람객 문구 */
export const VISITOR_MESSAGES: Record<string, string> = {
  BOOKING_CLOSED: '지금은 예약 없이 바로 체험하실 수 있어요. 부스로 오세요.',
  BOOKING_ENDED: '예약이 마감되었습니다.',
  SLOT_FULL: '방금 마감됐어요. 다른 시간대를 골라 주세요.',
  SLOT_STARTED: '이미 시작된 시간대예요. 다음 시간대를 골라 주세요.',
  SLOT_UNAVAILABLE: '지금은 예약할 수 없는 시간대예요. 다른 시간대를 골라 주세요.',
  INVALID_REQUEST: '요청을 처리하지 못했어요. 화면을 새로고침한 뒤 다시 시도해 주세요.',
  NOT_CANCELLABLE: '이미 방문 처리되었거나 취소된 예약이에요.',
  NOT_FOUND: '예약을 찾지 못했어요.',
  NETWORK: '연결이 불안정해요. 잠시 후 다시 눌러 주세요.',
  NOT_CONFIGURED: '예약 서버 설정이 아직 끝나지 않았어요. 부스 스태프에게 알려 주세요.',
  UNAUTHORIZED: '로그인이 필요해요.',
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
  if (result.error) {
    const { code, message } = result.error
    const unauthorized =
      result.status === 401 || code === '42501' || code === 'PGRST301' || /NOT_AUTHORIZED|JWT/i.test(message)
    throw new ApiError(unauthorized ? 'UNAUTHORIZED' : 'NETWORK', message)
  }
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

// =============================================================
// 스태프용
// =============================================================
export type BookingSource = 'qr' | 'walk_in'

export type AdminBooking = {
  id: string
  code: string
  status: BookingStatus
  source: BookingSource
  created_at: string
  checked_in_at: string | null
  cancelled_at: string | null
}

export type AdminSlot = {
  id: number
  starts_at: string
  ends_at: string
  capacity: number
  is_closed: boolean
  booked_count: number
  checked_in_count: number
  cancelled_count: number
  walk_in_count: number
  active_count: number
  bookings: AdminBooking[]
}

export type AdminState = {
  now: string
  settings: { booking_open: boolean; booking_ended?: boolean; booth_title: string; notice: string | null; updated_at: string }
  slots: AdminSlot[]
}

/** 예약 + 시간대 정보 (방문 처리·현장 등록 결과) */
export type AdminBookingDetail = AdminBooking & { slot_id: number; starts_at: string; ends_at: string }

export type CheckInResult = {
  ok: boolean
  result: 'CHECKED_IN' | 'ALREADY_CHECKED_IN' | 'CANCELLED' | 'NOT_FOUND'
  booking?: AdminBookingDetail
}

export type AdminResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export const adminList = () => rpc<AdminState>('admin_list')

export const adminCheckIn = (code: string) => rpc<CheckInResult>('admin_check_in', { p_code: code })

export const adminSetStatus = (bookingId: string, status: BookingStatus, force = false) =>
  rpc<AdminResult<{ booking: AdminBookingDetail }>>('admin_set_status', {
    p_booking_id: bookingId,
    p_status: status,
    p_force: force,
  })

export const adminWalkIn = (slotId: number, force = false) =>
  rpc<AdminResult<{ booking: AdminBookingDetail }>>('admin_walk_in', { p_slot_id: slotId, p_force: force })

export const adminUpdateSlot = (slotId: number, changes: { capacity?: number; isClosed?: boolean }) =>
  rpc<AdminResult>('admin_update_slot', {
    p_slot_id: slotId,
    p_capacity: changes.capacity ?? null,
    p_is_closed: changes.isClosed ?? null,
  })

export const adminSetBookingOpen = (open: boolean) =>
  rpc<AdminResult<{ booking_open: boolean }>>('admin_set_booking_open', { p_open: open })

export const adminSetBookingEnded = (ended: boolean) =>
  rpc<AdminResult<{ booking_ended: boolean }>>('admin_set_booking_ended', { p_ended: ended })

/** 스태프 화면용 오류 문구 */
export const ADMIN_MESSAGES: Record<string, string> = {
  SLOT_FULL: '정원이 찼어요.',
  SLOT_CLOSED: '닫힌 시간대예요.',
  SLOT_UNAVAILABLE: '없는 시간대예요.',
  NOT_FOUND: '찾을 수 없어요. 화면을 새로고침해 주세요.',
  INVALID_REQUEST: '잘못된 요청이에요.',
  NETWORK: '연결이 불안정해요. 잠시 후 다시 시도해 주세요.',
  UNAUTHORIZED: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  NOT_CONFIGURED: '.env에 Supabase 설정이 없어요.',
}
