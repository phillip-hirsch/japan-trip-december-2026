import { MapIcon } from 'lucide-react'
import { Component, Suspense, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** MapLibre GL 6 draws with WebGL2 and fails without it. */
const supportsWebGl2 = () => {
  const context = document.createElement('canvas').getContext('webgl2')
  context?.getExtension('WEBGL_lose_context')?.loseContext()

  return context !== null
}

type MapState = 'waiting' | 'unsupported' | 'shown'

function useMapState() {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<MapState>('waiting')
  useEffect(() => {
    const element = ref.current

    if (state !== 'waiting' || element === null) return

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      observer.disconnect()
      setState(supportsWebGl2() ? 'shown' : 'unsupported')
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [state])

  return [ref, state] as const
}

function MapLoading() {
  return (
    <div
      role="status"
      aria-label="Loading the map"
      className="absolute inset-0 animate-pulse bg-muted"
    />
  )
}

function MapUnavailable() {
  return (
    <div
      role="status"
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground"
    >
      <MapIcon aria-hidden className="size-6" />
      <p className="max-w-xs text-balance">
        The map can’t load on this device right now. Everything else on this
        page still works.
      </p>
    </div>
  )
}

class MapErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    return this.state.failed ? <MapUnavailable /> : this.props.children
  }
}

export function LazyMap({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const [ref, state] = useMapState()

  return (
    <div
      ref={ref}
      className={cn(
        'relative isolate aspect-square overflow-hidden rounded-lg border bg-card sm:aspect-[3/2]',
        className,
      )}
    >
      {state === 'waiting' && <MapLoading />}
      {state === 'unsupported' && <MapUnavailable />}
      {state === 'shown' && (
        <MapErrorBoundary>
          <Suspense fallback={<MapLoading />}>{children}</Suspense>
        </MapErrorBoundary>
      )}
    </div>
  )
}
