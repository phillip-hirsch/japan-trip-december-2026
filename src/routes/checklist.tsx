import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import {
  AddChecklistItem,
  ChecklistItems,
  ChooseItineraryPrompt,
} from '@/components/checklist'
import { checklistQuery } from '@/trip/queries'

// Personal state, so never prerendered: each visit asks the Trip store.
export const Route = createFileRoute('/checklist')({
  loader: {
    handler: ({ context }) => context.queryClient.fetchQuery(checklistQuery),
    staleReloadMode: 'blocking',
  },
  head: () => ({ meta: [{ title: 'Checklist · Japan · December 2026' }] }),
  component: ChecklistPage,
})

function ChecklistPage() {
  const { scheduleId, items } = useSuspenseQuery(checklistQuery).data
  const done = items.filter((item) => item.ticked).length

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-10 md:px-12 md:py-16">
      <header>
        <h1 className="text-5xl font-semibold md:text-6xl">Checklist</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {items.length > 0 && `${done} of ${items.length} done. `}
          What to book or confirm, the next thing to do on top. Reminder dates
          show here only; nothing is sent.
        </p>
      </header>
      {scheduleId === null && (
        <div className="mt-8">
          <ChooseItineraryPrompt />
        </div>
      )}
      <section aria-label="Items" className="mt-8">
        <ChecklistItems items={items} scheduleId={scheduleId} />
      </section>
      <section aria-labelledby="add-item" className="mt-12">
        <h2 id="add-item" className="mb-4 text-xl font-semibold">
          Add your own
        </h2>
        <AddChecklistItem labelledBy="add-item" />
      </section>
    </article>
  )
}
