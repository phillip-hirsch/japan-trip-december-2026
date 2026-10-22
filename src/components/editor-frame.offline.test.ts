// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { vi } from 'vite-plus/test'
import { act } from 'react'

import { useEditorFrame } from '@/components/editor-frame'
import { useDayNote } from '@/components/notes'
import { SaveState } from '@/trip/client/drafts'
import {
  answeringOnly,
  comeBackOnline,
  goOffline,
  openEditor,
} from '@/trip/client/editor-testing'
import { IsoDate, ScheduleId, WriteDayNoteOutcome } from '@/trip/domain/domain'
import { writeDayNote } from '@/trip/trip/trip.functions'

vi.mock('@/trip/trip/trip.functions', () => ({
  writeDayNote: vi.fn(),
}))

const scheduleId = ScheduleId.make('00000000-0000-4000-8000-00000000000a')

const date = IsoDate.make('2026-12-07')

/** The Day note editor on December 7, saved as "Tsukiji at dawn.", and its frame. */
const openDayNoteFrame = () =>
  openEditor(() => {
    const field = useDayNote({ scheduleId, date, note: 'Tsukiji at dawn.' })

    return { field, frame: useEditorFrame(field) }
  }, {})

describe('the editor frame while offline', () => {
  it('locks a Day note while offline, and unlocks it when the connection returns', async () => {
    localStorage.clear()
    const editor = await openDayNoteFrame()

    await goOffline()
    const offline = editor.field().frame
    await comeBackOnline()
    const online = editor.field().frame

    assert.deepStrictEqual(
      [
        { paused: offline.paused, locked: offline.locked },
        { paused: online.paused, locked: online.locked },
      ],
      [
        { paused: true, locked: true },
        { paused: false, locked: false },
      ],
    )
    await editor.close()
  })

  it('keeps a Draft open but locked when the connection drops, and saves it once the connection returns', async () => {
    localStorage.clear()
    vi.mocked(writeDayNote).mockImplementation(
      answeringOnly(
        { scheduleId, date, note: 'Tsukiji at six.' },
        WriteDayNoteOutcome.cases.Written.make({}),
        WriteDayNoteOutcome.cases.DayNotFound.make({ date }),
      ),
    )
    const editor = await openDayNoteFrame()
    await act(async () => editor.field().field.edit())
    await act(async () => editor.field().field.change('Tsukiji at six.'))

    await goOffline()
    await act(async () => editor.field().field.change('Tsukiji at seven.'))
    await act(() => editor.field().field.save())
    assert.deepStrictEqual(
      { state: editor.field().field.state, view: editor.field().frame.view },
      { state: SaveState.Editing({ value: 'Tsukiji at six.' }), view: 'form' },
    )

    await comeBackOnline()
    await act(() => editor.field().field.save())
    const { view, justSaved } = editor.field().frame
    assert.deepStrictEqual(
      { view, justSaved },
      { view: 'summary', justSaved: true },
    )
    await editor.close()
  })
})
