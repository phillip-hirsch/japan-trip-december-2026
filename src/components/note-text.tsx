import { cn } from '@/lib/utils'

const webLink = /\bhttps?:\/\/[^\s<>"]+/gi

const closerOf = new Map([
  ['(', ')'],
  ['[', ']'],
])

const unmatchedClosers = (link: string) => {
  const unmatched = new Map<string, number>()

  for (const char of link) {
    const closer = closerOf.get(char)

    if (closer !== undefined) {
      unmatched.set(closer, (unmatched.get(closer) ?? 0) - 1)
    } else if (char === ')' || char === ']') {
      unmatched.set(char, (unmatched.get(char) ?? 0) + 1)
    }
  }

  return unmatched
}

const trimTrailingPunctuation = (link: string) => {
  const unmatched = unmatchedClosers(link)
  let end = link.length

  while (end > 0) {
    const last = link[end - 1] ?? ''
    const closes = unmatched.get(last)

    if (closes !== undefined && closes > 0) {
      unmatched.set(last, closes - 1)
    } else if (!/[.,;:!?']/.test(last)) {
      break
    }

    end -= 1
  }

  return link.slice(0, end)
}

const hrefOf = (link: string) => {
  try {
    const url = new URL(link)

    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

/**
 * A note Phillip wrote, always rendered as text, never as HTML, with its line
 * breaks. Only http and https links become clickable, opening in a new tab
 * without referrer or opener access; anything else stays plain text.
 */
export function NoteText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const parts: Array<{ text: string; href?: string }> = []
  let from = 0

  for (const match of text.matchAll(webLink)) {
    const link = trimTrailingPunctuation(match[0])
    const href = hrefOf(link)

    if (href === undefined) continue
    parts.push({ text: text.slice(from, match.index) }, { text: link, href })
    from = match.index + link.length
  }

  parts.push({ text: text.slice(from) })

  return (
    <p className={cn('break-words whitespace-pre-wrap', className)}>
      {parts.map((part, index) =>
        part.href === undefined ? (
          part.text
        ) : (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-3 [overflow-wrap:anywhere]"
          >
            {part.text}
          </a>
        ),
      )}
    </p>
  )
}
