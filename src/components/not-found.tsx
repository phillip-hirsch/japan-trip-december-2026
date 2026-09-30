import { ButtonLink } from '@/components/button-link'

/** The page for an address with nothing behind it. */
export function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16 md:px-12">
      <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
        Not found
      </p>
      <h1 className="mt-4 text-4xl font-semibold md:text-5xl">
        Nothing lives at this address
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
        The link may be mistyped, or it may point to an Option that doesn’t
        exist.
      </p>
      <div className="mt-8 flex gap-2">
        <ButtonLink to="/">Home</ButtonLink>
        <ButtonLink to="/options" variant="outline">
          Options
        </ButtonLink>
      </div>
    </section>
  )
}
