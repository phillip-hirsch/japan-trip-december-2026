import { isTripDate } from '@/trip/domain/calendar'

export const parseOptionNumber = (param: string) => {
  const optionNumber = Number(param)

  return /^[1-9]\d*$/.test(param) && Number.isSafeInteger(optionNumber)
    ? optionNumber
    : undefined
}

export const parseTripDate = (param: string) =>
  isTripDate(param) ? param : undefined
