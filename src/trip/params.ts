// Route params, checked in the browser by small synchronous checks (no Effect
// in the browser). The server validates them again.

/** An Option number from the address, or undefined when it is malformed. */
export const parseOptionNumber = (param: string) => {
  const optionNumber = Number(param)
  return /^[1-9]\d*$/.test(param) && Number.isSafeInteger(optionNumber)
    ? optionNumber
    : undefined
}
