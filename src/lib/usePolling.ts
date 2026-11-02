import { useEffect, useRef } from 'react'

/**
 * ms 간격으로 fn을 호출한다. 화면이 가려져 있으면 멈추고, 다시 보이면 즉시 한 번 호출한다.
 */
export function usePolling(fn: () => void, ms: number, enabled = true) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) return
    let timer: number | undefined

    const start = () => {
      stop()
      timer = window.setInterval(() => fnRef.current(), ms)
    }
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer)
      timer = undefined
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fnRef.current()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ms, enabled])
}
