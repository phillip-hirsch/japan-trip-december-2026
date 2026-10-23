import { useSuspenseQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Navigate,
  notFound,
  redirect,
} from '@tanstack/react-router'

import { ButtonLink } from '@/components/button-link'
import { LastUpdated } from '@/components/last-updated'
import { NotFound } from '@/components/not-found'
import {
  ReplaceScheduleDialog,
  useRestoreSchedule,
} from '@/components/replace-schedule-dialog'
import { AnchorWarnings } from '@/components/schedule-rules'
import {
  RevisionNotice,
  ScheduleSections,
} from '@/components/schedule-sections'
import { Button } from '@/components/ui/button'
import { VerifyClaims } from '@/components/verify-claims'
import { formatMoment } from '@/trip/domain/calendar'
import type { ScheduleDetail, ScheduleSummary } from '@/trip/domain/domain'
import {
  loadQuery,
  scheduleByIdQuery,
  useScheduleSummary,
} from '@/trip/client/queries'
import { parseScheduleId } from '@/trip/client/params'
import { pageTitle } from '@/lib/app-identity'

export const Route = createFileRoute('/schedule/archived/$scheduleId')({
  params: {
    parse: (params) => {
      const scheduleId = parseScheduleId(params.scheduleId)

      if (scheduleId === undefined) throw notFound()

      return { scheduleId }
    },
    stringify: ({ scheduleId }) => ({ scheduleId }),
  },
  loader: {
    handler: async ({ context, params: { scheduleId } }) => {
      const schedule = await loadQuery(
        context.queryClient,
        scheduleByIdQuery(scheduleId),
      )

      if (schedule === null) throw notFound()

      if (schedule.status === 'current') throw redirect({ to: '/schedule' })
    },
    staleReloadMode: 'blocking',
  },
  head: () => ({
    meta: [{ title: pageTitle('Archived Schedule') }],
  }),
  component: ArchivedSchedulePage,
})

function ArchivedSchedulePage() {
  const { scheduleId } = Route.useParams()
  const schedule = useSuspenseQuery(scheduleByIdQuery(scheduleId)).data

  if (schedule === null) return <NotFound />

  const restoredSinceOpened = schedule.status === 'current'

  if (restoredSinceOpened) return <Navigate to="/schedule" />

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-10 md:px-12 md:py-16">
      <header>
        <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
          Archived Schedule
        </p>
        <h1 className="mt-4 text-5xl font-semibold md:text-6xl">
          Option {schedule.sourceOptionNumber}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Copied from Option {schedule.sourceOptionNumber} on{' '}
          <time dateTime={schedule.chosenAt}>
            {formatMoment(schedule.chosenAt)}
          </time>
          {schedule.archivedAt !== null && (
            <>
              , archived on{' '}
              <time dateTime={schedule.archivedAt}>
                {formatMoment(schedule.archivedAt)}
              </time>
            </>
          )}
          . Read-only until you restore it.
        </p>
        <LastUpdated query={scheduleByIdQuery(scheduleId)} className="mt-2" />
        <AnchorWarnings warnings={schedule.anchorWarnings} className="mt-6" />
        <RevisionNotice schedule={schedule} className="mt-6" />
        <div className="mt-8 flex flex-wrap gap-2">
          <RestoreButton schedule={schedule} />
          <ButtonLink to="/schedule" size="lg" variant="outline">
            Open your Schedule
          </ButtonLink>
        </div>
        <VerifyClaims claims={schedule.verifyClaims} className="mt-6" />
      </header>
      <ScheduleSections schedule={schedule} />
    </article>
  )
}

function RestoreButton({ schedule }: { schedule: ScheduleDetail }) {
  const current = useScheduleSummary()

  if (current === undefined) {
    return (
      <Button size="lg" disabled>
        Restore this Schedule
      </Button>
    )
  }

  return <RestoreDialog schedule={schedule} current={current} />
}

function RestoreDialog({
  schedule,
  current,
}: {
  schedule: ScheduleDetail
  current: ScheduleSummary | null
}) {
  const replacement = useRestoreSchedule({ scheduleId: schedule.id, current })

  return (
    <ReplaceScheduleDialog
      replacement={replacement}
      trigger={<Button size="lg" />}
      triggerLabel="Restore this Schedule"
      title="Restore this Schedule?"
      description={
        <>
          <p>
            This Schedule from Option {schedule.sourceOptionNumber} becomes your
            Schedule again, as it was when archived.
          </p>
          {current && (
            <p>
              Your current Schedule, from Option {current.sourceOptionNumber},
              is archived. You can restore it the same way.
            </p>
          )}
          <p>Your Trip note and your own Checklist items stay as they are.</p>
        </>
      }
      action="Restore"
      working="Restoring…"
      failed="Restoring didn’t go through. Try again; it won’t restore twice."
    />
  )
}
