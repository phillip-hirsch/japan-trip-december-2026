import { isTripDate } from '@/trip/domain/calendar'

export const parseOptionNumber = (param: string) => {
  const optionNumber = Number(param)

  return /^[1-9]\d*$/.test(param) && Number.isSafeInteger(optionNumber)
    ? optionNumber
    : undefined
}

export const parseScheduleId = (param: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    param,
  )
    ? param
    : undefined

export const parseTripDate = (param: string) =>
  isTripDate(param) ? param : undefined
