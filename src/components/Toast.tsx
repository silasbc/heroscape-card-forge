import { useCallback, useRef, useState } from 'react'

export function useToast() {
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  const show = useCallback((msg: string, ms = 3200) => {
    setToast(msg)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), ms)
  }, [])
  return { toast, show }
}

export function Toast({ toast }: { toast: string | null }) {
  if (!toast) return null
  return <div className="toast">{toast}</div>
}
