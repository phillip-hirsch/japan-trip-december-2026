import type { LucideIcon } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'

import { NotSavedAlert, SavedStatus } from '@/components/not-saved-alert'
import { Button } from '@/components/ui/button'
import { SaveState } from '@/trip/drafts'

/** The words an editor saves with: its Save, while saving, and once saved. */
export interface SaveVerb {
  readonly submit: string
  readonly submitting: string
  readonly done: string
}

export const saveVerb: SaveVerb = {
  submit: 'Save',
  submitting: 'Saving…',
  done: 'Saved',
}

/** What the frame reads of a field from the save hook. */
interface FramedField<V> {
  readonly state: SaveState<V>
  /** An open edit the Schedule shown no longer offers, as useOfferedSave says. */
  readonly withdrawn?: boolean
}

interface FramedEditor<V> extends FramedField<V> {
  readonly edit: () => void
  readonly discard: () => void
  readonly save: () => Promise<void>
}

/**
 * Which view of an editor shows: its saved summary, its open form, or an
 * open edit the Schedule withdrew.
 */
export type EditorView = 'summary' | 'form' | 'withdrawn'

/**
 * How the editor frame shows a field from the save hook.
 *
 * - The summary shows a Clean or Saved value, marked just saved after a save.
 * - The form shows a value being edited, on its way, or not saved, with why.
 * - It is busy while the value is on its way or awaiting the read that
 *   confirms it, so it can't change.
 * - Opening the form focuses it; a restored Draft opens unfocused.
 */
export const useEditorFrame = <V,>(
  field: FramedField<V>,
  verb: SaveVerb = saveVerb,
) => {
  const problemId = useId()
  const { state } = field
  const notSaved = SaveState.$is('NotSaved')(state)
  const saving = SaveState.$is('Saving')(state)
  const saved = SaveState.$is('Saved')(state)
  const clean = SaveState.$is('Clean')(state)
  const problem = notSaved ? state.problem : undefined

  const view: EditorView = field.withdrawn
    ? 'withdrawn'
    : clean || saved
      ? 'summary'
      : 'form'

  return {
    view,
    justSaved: saved || (clean && state.justSaved),
    busy: saving || saved,
    submitLabel: saving ? verb.submitting : notSaved ? 'Retry' : verb.submit,
    discardLabel: notSaved ? 'Discard' : 'Cancel',
    autoFocus: SaveState.$is('Editing')(state),
    problem,
    problemId,
    /** What an input describes itself by: the "not saved" alert, if shown. */
    describedBy: problem === undefined ? undefined : problemId,
  }
}

export type EditorFrameView = ReturnType<typeof useEditorFrame>

function WithdrawnView({
  frame,
  labelledBy,
  reason,
  onDiscard,
}: {
  frame: EditorFrameView
  labelledBy: string
  reason: string | undefined
  onDiscard: () => void
}) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="flex flex-col items-start gap-3"
    >
      {frame.problem !== undefined && <NotSavedAlert problem={frame.problem} />}
      {reason !== undefined && (
        <p className="text-sm text-muted-foreground">{reason}</p>
      )}
      <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
        {frame.discardLabel}
      </Button>
    </div>
  )
}

/**
 * An edit Phillip has open that the refreshed Schedule no longer offers: any
 * refusal of it, why it can't be sent, and the way to dismiss it. For an
 * editor not yet on EditorFrame, which shows this as its withdrawn view.
 */
export function WithdrawnEdit<V>({
  field,
  labelledBy,
  reason,
}: {
  field: FramedField<V> & { readonly discard: () => void }
  labelledBy: string
  reason: string
}) {
  const frame = useEditorFrame(field)

  return (
    <WithdrawnView
      frame={frame}
      labelledBy={labelledBy}
      reason={reason}
      onDiscard={field.discard}
    />
  )
}

/**
 * One editor of a value saved under the save pattern: its saved summary with
 * the way to edit it, its open form, or its withdrawn view. The editor
 * supplies the summary, the form's inputs, given the frame's view, and its
 * verb; the frame owns the labels, the "not saved" alert and the autofocus
 * rule.
 */
export function EditorFrame<V>({
  field,
  labelledBy,
  verb = saveVerb,
  summary,
  editLabel,
  editIcon: EditIcon,
  withdrawnReason,
  actions,
  children,
}: {
  field: FramedEditor<V>
  /** The heading the editor is under. */
  labelledBy: string
  verb?: SaveVerb
  summary: ReactNode
  editLabel: string
  editIcon: LucideIcon
  withdrawnReason?: string
  /** Shown after Save and Cancel. */
  actions?: ReactNode
  children: (frame: EditorFrameView) => ReactNode
}) {
  const frame = useEditorFrame(field, verb)

  if (frame.view === 'summary') {
    return (
      <div className="flex flex-col items-start gap-3">
        {summary}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            aria-describedby={labelledBy}
            onClick={field.edit}
          >
            <EditIcon data-icon="inline-start" aria-hidden />
            {editLabel}
          </Button>
          <SavedStatus saved={frame.justSaved}>{verb.done}</SavedStatus>
        </div>
      </div>
    )
  }

  if (frame.view === 'withdrawn') {
    return (
      <WithdrawnView
        frame={frame}
        labelledBy={labelledBy}
        reason={withdrawnReason}
        onDiscard={field.discard}
      />
    )
  }

  return (
    <form
      aria-labelledby={labelledBy}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void field.save()
      }}
    >
      {frame.problem !== undefined && (
        <NotSavedAlert problem={frame.problem} problemId={frame.problemId} />
      )}
      {children(frame)}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={frame.busy}>
          {frame.submitLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={frame.busy}
          onClick={field.discard}
        >
          {frame.discardLabel}
        </Button>
        {actions}
      </div>
    </form>
  )
}
