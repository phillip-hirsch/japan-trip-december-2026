import { useRef } from 'react'
import type { TouchEvent } from 'react'

/** How far a finger must travel sideways to count as a swipe, in CSS pixels. */
const minDistance = 48

/** How much further sideways than up or down, so scrolling is never a swipe. */
const minRatio = 1.5

/** Where a drag selects text or moves the caret rather than swipes. */
const editable =
  'input, textarea, [contenteditable]:not([contenteditable="false"])'

/**
 * Touch handlers that call back when one finger swipes across the element.
 * Vertical scrolling is left alone, and nothing is prevented, so the page
 * still scrolls during the gesture. A gesture starting in a field is never a
 * swipe.
 */
export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
}: {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onTouchStart: (event: TouchEvent) => {
      const touch = event.touches[0]
      const inField =
        event.target instanceof Element && event.target.closest(editable)
      start.current =
        event.touches.length === 1 && touch && !inField
          ? { x: touch.clientX, y: touch.clientY }
          : null
    },
    onTouchEnd: (event: TouchEvent) => {
      const from = start.current
      const touch = event.changedTouches[0]
      start.current = null
      if (from === null || touch === undefined) return
      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y
      if (
        Math.abs(dx) < minDistance ||
        Math.abs(dx) < Math.abs(dy) * minRatio
      ) {
        return
      }
      ;(dx < 0 ? onSwipeLeft : onSwipeRight)?.()
    },
    onTouchCancel: () => {
      start.current = null
    },
  }
}
