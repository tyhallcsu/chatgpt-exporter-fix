// One bounded look at ChatGPT's own backend calls: which endpoints answered and
// with what status.
//
//   node api-health.mjs [seconds]
//
// Reloads the current page once, watches the network for a fixed window, and
// prints one line per `/backend-api/` request. This is how "Export All is
// broken" is told apart from "the account is being rate limited right now" —
// without hammering the endpoint from a script, which is what the 429 is asking
// us not to do.
import { attach, sleep } from './manager.mjs'

const seconds = Number(process.argv[2] || 25)

const c = await attach('chatgpt.com')
await c.send('Page.bringToFront')
await c.send('Network.enable')
await c.send('Page.enable')
await c.send('Page.reload')

const seen = new Map()
for (let waited = 0; waited < seconds * 1000; waited += 1000) {
    await sleep(1000)
    for (const e of c.events.splice(0)) {
        if (e.method === 'Network.requestWillBeSent' && e.params.request.url.includes('/backend-api/')) {
            seen.set(e.params.requestId, { url: e.params.request.url, status: null, retryAfter: null })
        }
        else if (e.method === 'Network.responseReceived' && seen.has(e.params.requestId)) {
            const row = seen.get(e.params.requestId)
            row.status = e.params.response.status
            const headers = e.params.response.headers || {}
            row.retryAfter = headers['retry-after'] ?? headers['Retry-After'] ?? null
        }
    }
}
c.close()

const rows = [...seen.values()]
const short = url => url.replace('https://chatgpt.com/backend-api/', '').split('?')[0].slice(0, 60)
const byEndpoint = new Map()
for (const r of rows) {
    const key = `${short(r.url)} → ${r.status ?? 'no response'}${r.retryAfter ? ` (Retry-After ${r.retryAfter})` : ''}`
    byEndpoint.set(key, (byEndpoint.get(key) || 0) + 1)
}
for (const [key, count] of byEndpoint) console.log(`  ${count}x  ${key}`)
const throttled = rows.filter(r => r.status === 429)
console.log(`\n${rows.length} backend-api requests, ${throttled.length} throttled (429)`)
if (throttled.length) console.log('throttled endpoints:', [...new Set(throttled.map(r => short(r.url)))].join(', '))
