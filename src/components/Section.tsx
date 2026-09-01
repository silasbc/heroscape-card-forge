import { useState, type ReactNode } from 'react'

export function Section({
  title,
  badge,
  defaultOpen = false,
  open,
  onToggle,
  children,
}: {
  title: string
  badge?: string
  defaultOpen?: boolean
  open?: boolean
  onToggle?: (open: boolean) => void
  children: ReactNode
}) {
  const [inner, setInner] = useState(defaultOpen)
  const isOpen = open ?? inner
  const toggle = () => {
    const n = !isOpen
    setInner(n)
    onToggle?.(n)
  }
  return (
    <section className={'section' + (isOpen ? ' open' : '')}>
      <header onClick={toggle}>
        <span className="chev">▶</span>
        <h2>{title}</h2>
        {badge && <span className="badge">{badge}</span>}
      </header>
      {isOpen && <div className="body">{children}</div>}
    </section>
  )
}
