import { isTripDate } from '@/trip/domain/calendar'

export const parseTripDate = (param: string) =>
  isTripDate(param) ? param : undefined
