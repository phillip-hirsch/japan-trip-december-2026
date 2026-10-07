// What following real short Google Maps links answered, recorded with
// `curl -sS -o /dev/null -D - <link>` in October 2026, for the location-link
// resolver the tests replay. Only the tests import this.
import type { LinkResponse } from '@/trip/LocationLinkResolver'

const redirectTo = (location: string): LinkResponse => ({
  status: 302,
  location,
})

/** A made-up chain of short links, each redirecting to the next. */
const chain = (name: string, hops: number, to: string) =>
  Object.fromEntries(
    Array.from({ length: hops }, (_, hop) => [
      `https://maps.app.goo.gl/${name}${hop}`,
      redirectTo(
        hop === hops - 1 ? to : `https://maps.app.goo.gl/${name}${hop + 1}`,
      ),
    ]),
  )

/** Recorded responses, by the link requested. */
export interface RecordedResponses {
  readonly [link: string]: LinkResponse
}

export const recordedResponses: RecordedResponses = {
  // DILL COFFEE PARLOR, Tokyo. The map shown is zoomed out over the Kanto
  // plain, well west of the place's pin.
  'https://maps.app.goo.gl/75CwmUKb62uxphUq9': redirectTo(
    'https://www.google.com/maps/place/DILL+COFFEE+PARLOR/@35.6938493,139.1537297,10z/data=!3m1!5s0x60188c054c3409ff:0x4469b87e56c429d4!4m7!3m6!1s0x60188d005be0b9e9:0xa1df4b63af83deb0!8m2!3d35.6938493!4d139.7634709!15sCgRkaWxsWgYiBGRpbGySAQtjb2ZmZWVfc2hvcOABAA!16s%2Fg%2F11y34f7yh0?entry=tts&g_ep=EgoyMDI0MTAyOS4wIPu8ASoASAFQAw%3D%3D',
  ),
  // Fushimi Inari Taisha, Kyoto, from an older goo.gl/maps link.
  'https://goo.gl/maps/9e6EdUNDE18LuEwR7': redirectTo(
    'https://www.google.com/maps/place/Fushimi+Inari+Taisha/@34.9671402,135.7721245,19z/data=!3m1!4b1!4m5!3m4!1s0x60010f153d2e6d21:0x7b1aca1c753ae2e9!8m2!3d34.9671402!4d135.7726717?coh=164777&entry=tt&shorturl=1',
  ),
  // A street address in London, named but without coordinates.
  'https://maps.app.goo.gl/GK6GhwG7X1CFqwMy8': redirectTo(
    'https://www.google.com/maps/place/Akamai+Technologies,+7+Air+St,+London+W1B+5AD,+United+Kingdom/data=!4m2!3m1!1s0x487604d41862febd:0x7da7ebf049766eb!18m1!1e1?utm_source=mstt_1&entry=gps&coh=192189&g_ep=CAESBzI2LjExLjYYACCenQoqnQEsOTQyNjc3MjcsOTQyOTIxOTUsOTQyOTk1MzIsMTAwNzk2NDk4LDEwMDc5Nzc1NywxMDA3OTY1MzUsOTQyODQ0ODcsOTQyODA1NzYsOTQyMDczOTQsOTQyMDc1MDYsOTQyMDg1MDYsOTQyMTg2NTMsOTQyMjk4MzksOTQyNzUxNjgsOTQyNzk2MTksOTQyNjI3MzMsMTAwNzk2MTg2QgJCRQ%3D%3D&skid=dbe7d059-bb11-4966-b548-5940ee75a478',
  ),
  // Shared from the iPhone app: a place searched for by name.
  'https://maps.app.goo.gl/CBXW7Sn1y3NG5df98?g_st=ic': redirectTo(
    'https://maps.google.com?q=Cafeteria+Restaurant+Llevant,+Carrer+de+L.Van+Beethoven,+2,+43007+Tarragona&ftid=0x12a3fcc9256e8b1d:0x6dd7ce37f4a43d83&hl=en-RU&gl=ru&entry=gps&g_ep=CAISBjYuNDQuNBgAIMi8Bw%3D%3D&g_st=ic',
  ),
  // Google's London office, a place outside Japan.
  'https://maps.app.goo.gl/4LnCdiNYWrN11M9z5': redirectTo(
    'https://www.google.com/maps/place/Google+London+-+Pancras+Square/@51.5332609,-0.1260032,17z/data=!3m1!4b1!4m6!3m5!1s0x48761b3c54efa6e1:0xc7053ab04745950d!8m2!3d51.5332609!4d-0.1260032!16s%2Fg%2F11bz0l7w_6?coh=277535&entry=tts&g_ep=EgoyMDI1MTIwOS4wIPu8ASoKLDEwMDc5MjA3M0gBUAM%3D&skid=e0bef94c-6c00-4fd4-aeb3-a1915a568c47',
  ),
  // An older goo.gl/maps link redirecting to google.dk, off the Google Maps
  // hosts.
  'https://goo.gl/maps/1DTErmADkkz': redirectTo(
    "https://www.google.dk/maps/place/Frenesi+Cafe/@41.3848532,2.1525209,17z/data=!4m13!1m7!3m6!1s0x12a4a2861f7ed10b:0x551c998ca4d4ac0d!2sCarrer+del+Comte+d'Urgell,+115,+08011+Barcelona!3b1!8m2!3d41.3848492!4d2.1547149!3m4!1s0x12a4a2861f6e93f3:0xe0621c16264abcb8!8m2!3d41.384906!4d2.1546423?shorturl=1",
  ),
  // A short link that doesn't exist.
  'https://maps.app.goo.gl/doesnotexist123': { status: 404 },
  // Made up: a short link redirecting to plain http.
  'https://maps.app.goo.gl/toHttp': redirectTo(
    'http://www.google.com/maps/@35.0116,135.7681,15z',
  ),
  // Made up: a short link redirecting to something that isn't a link.
  'https://maps.app.goo.gl/toMalformed': redirectTo('https://[not a link'),
  // Made up: a short link redirecting to a link past 2,000 characters.
  'https://maps.app.goo.gl/toLongLink': redirectTo(
    `https://www.google.com/maps/place/Kinkaku-ji/@35.0394,135.7292,17z?g_ep=${'a'.repeat(2000)}`,
  ),
  // Made up: chains of five and six redirects to Kinkaku-ji, Kyoto.
  ...chain('five', 5, 'https://www.google.com/maps/@35.0394,135.7292,17z'),
  ...chain('six', 6, 'https://www.google.com/maps/@35.0394,135.7292,17z'),
}
