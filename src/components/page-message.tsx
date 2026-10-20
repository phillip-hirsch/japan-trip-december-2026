import type { ReactNode } from 'react'

/**
 * A page that is only a message, such as not found or no Schedule yet: an
 * eyebrow, a title, a short explanation and what to do next.
 */
export function PageMessage({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow: string
  title: string
  children: ReactNode
  actions: ReactNode
}) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16 md:px-12">
      <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
        {eyebrow}
      </p>
      <h1 className="mt-4 text-4xl font-semibold md:text-5xl">{title}</h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
      <div className="mt-8 flex gap-2">{actions}</div>
    </section>
  )
}
