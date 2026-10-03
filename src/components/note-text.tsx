import { cn } from '@/lib/utils'

const webLink = /\bhttps?:\/\/[^\s<>"]+/gi

const count = (text: string, char: string) => text.split(char).length - 1

const openerOf: Partial<Record<string, string>> = { ')': '(', ']': '[' }

/**
 * A link as written, without the punctuation that usually ends its sentence
 * rather than the link. A closing bracket stays when the link opened it, as
 * in Wikipedia's addresses.
 */
const trimmed = (link: string) => {
  let end = link.length
  while (end > 0) {
    const head = link.slice(0, end)
    const last = head.at(-1) ?? ''
    const opener = openerOf[last]
    const ends =
      /[.,;:!?']/.test(last) ||
      (opener !== undefined && count(head, last) > count(head, opener))
    if (!ends) break
    end -= 1
  }
  return link.slice(0, end)
}

/** The address a link opens, when it is a valid http or https URL. */
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
  const parts: Array<string | { link: string; href: string }> = []
  let from = 0
  for (const match of text.matchAll(webLink)) {
    const link = trimmed(match[0])
    const href = hrefOf(link)
    if (href === undefined) continue
    parts.push(text.slice(from, match.index), { link, href })
    from = match.index + link.length
  }
  parts.push(text.slice(from))
  return (
    <p className={cn('break-words whitespace-pre-wrap', className)}>
      {parts.map((part, index) =>
        typeof part === 'string' ? (
          part
        ) : (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-3 [overflow-wrap:anywhere]"
          >
            {part.link}
          </a>
        ),
      )}
    </p>
  )
}
