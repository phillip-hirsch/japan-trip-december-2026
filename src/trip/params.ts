// Route params, checked in the browser by small synchronous checks (no Effect
// in the browser). The server validates them again.

/** An Option number from the address, or undefined when it is malformed. */
export const parseOptionNumber = (param: string) => {
  const optionNumber = Number(param)
  return /^[1-9]\d*$/.test(param) && Number.isSafeInteger(optionNumber)
    ? optionNumber
    : undefined
}

/**
 * A Schedule id from the address, or undefined when it is malformed. Schedule
 * ids are random UUIDs.
 */
export const parseScheduleId = (param: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    param,
  )
    ? param
    : undefined
