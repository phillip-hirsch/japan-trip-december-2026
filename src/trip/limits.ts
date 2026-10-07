// Limits the Trip service enforces, shared with the browser so its fields
// stop at the same place. Plain values only: the browser imports this.

/**
 * The longest note (Day, Stay or Trip) the Trip service accepts, in UTF-16
 * code units.
 */
export const noteMaxLength = 10_000

/** The longest own Checklist item's text the Trip service accepts. */
export const checklistTextMaxLength = 500

/** The longest Activity title the Trip service accepts. */
export const activityTitleMaxLength = 200

/**
 * The longest hotel name, address or confirmation number the Trip service
 * accepts.
 */
export const hotelDetailMaxLength = 500
