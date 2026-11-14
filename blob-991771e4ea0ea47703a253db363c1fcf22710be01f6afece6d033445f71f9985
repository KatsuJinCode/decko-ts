# Resolved anonymous sessions keep the batched renderer

The real 21,676-card local capability run exposed a plain homepage GET
taking 26.479s and 2,340 statements after an unsuccessful credential check.
Removing unnecessary harness navigation cannot fix that real homepage.

On the same approved source copy, current fcdc-integrated source c862d0ee,
and allowlisted render settings, a bounded raw HTTP probe measured:

| Request | Status | Wall time | Statements | Actual SQLite execution |
|---|---:|---:|---:|---:|
| GET / without a session cookie | 200 | 1.688s | 58 | 890ms |
| GET / with an owned nonexistent session cookie | 200 | 25.434s | 2342 | 1518ms |

Both responses contain 22,061 bytes and no signed-in control. The second
request's database wall timing is 24.330s: repeated network round trips,
not 24 seconds executing SQLite. The protected original database remains
SHA-256 `edcc11bc32a8e0b1ec3529aeb9240c6201cc7c39191e0c2ebe618795838815bc`.

The Bunny handler resolved the failed lookup to the anonymous viewer, then
called `handleEngineRequest` with only the render budget. Its cookieless
branch additionally passes `anonymous:true`, the configured live-render
flag and serving boot options. Without those flags, `liveRenderApplies`
rejects the request, silently forcing the serial normal renderer. The
repair supplies those same anonymous settings only after session lookup
has established that the actor is anonymous. Authentication, cache posture,
read permissions and explicit off/history/layout behavior are unchanged.

The actual handler regression first proves a valid admin session works,
then checks nonexistent, expired and revoked tokens on Home, sign-in and
a private account page. Anonymous bytes/statuses equal the cookieless path
under the repository's existing random-slot-ID normalization, the private
account remains403, no signed-in control leaks, all cards remain unchanged,
and requests remain bounded. Before the repair the control failed with
272 trips against its 80-trip ceiling; after it, all eight anonymous/focal
controls passed in 15.05s, and TypeScript validation passed.

Original raw measurements, HTML and scripts remain in the owned private
profiling directory; subsequent actual after-measurements are recorded
separately. These single observations are not a median/p95 or hosted claim.
