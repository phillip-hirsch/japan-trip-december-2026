// Facts about Hotel details that the Trip service and the browser share.
// See AGENTS.md: Effect in the browser.
import type { HotelDetails } from '@/trip/domain'

/**
 * Hotel details as the Trip service saves them: each field trimmed, and a
 * blank one removed.
 */
export const trimmedHotelDetails = ({
  name = '',
  address = '',
  confirmationNumber = '',
}: HotelDetails): HotelDetails => ({
  ...(name.trim() !== '' && { name: name.trim() }),
  ...(address.trim() !== '' && { address: address.trim() }),
  ...(confirmationNumber.trim() !== '' && {
    confirmationNumber: confirmationNumber.trim(),
  }),
})
