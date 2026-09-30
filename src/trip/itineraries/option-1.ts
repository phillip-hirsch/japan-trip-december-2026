// Converted from docs/itinerary.md, "1. Tokyo → Kyoto → Kanazawa → Tokyo".
import { december } from '@/trip/domain'
import type { ItineraryContent } from '@/trip/domain'

export const option1: ItineraryContent = {
  optionNumber: 1,
  name: 'Kyoto + Kanazawa',
  stays: [
    { base: 'tokyo', checkIn: december(6), checkOut: december(9) },
    { base: 'kyoto', checkIn: december(9), checkOut: december(13) },
    { base: 'kanazawa', checkIn: december(13), checkOut: december(17) },
    { base: 'tokyo', checkIn: december(17), checkOut: december(20) },
  ],
  days: [
    { date: december(6), description: 'Arrival evening.' },
    { date: december(7), description: 'A recovery day.' },
    { date: december(8), description: 'Kamakura.' },
    { date: december(9), description: 'Arrive Wednesday.' },
    { date: december(10), description: 'Keep Thursday flexible.' },
    { date: december(11), description: 'Friday morning for Shigeharu.' },
    { date: december(12), description: 'Uji or a leisurely Kyoto day.' },
    { date: december(13) },
    { date: december(14) },
    { date: december(15), description: 'Your birthday dinner.' },
    { date: december(16) },
    { date: december(17) },
    { date: december(18), description: 'Optional Enoshima afternoon/evening.' },
    { date: december(19), description: 'Shopping and relaxing.' },
    { date: december(20) },
  ],
  shigeharuVisit: { date: december(11), slot: 'morning' },
}
