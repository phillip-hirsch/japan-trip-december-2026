import type { HotelDetails } from '@/trip/domain/domain'

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
