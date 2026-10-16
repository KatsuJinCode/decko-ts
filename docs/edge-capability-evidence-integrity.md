# Local edge capability evidence

The capability exercise runs the deployed bundle on Node with an SDK shim.
It does not establish behavior inside Bunny's vendor runtime. Its local
configuration copies only named render settings; database and object storage
use owned loopback services. Ambient provider credentials are removed from
the harness process before the bundle loads. The browser can write only to
its own exact origin; public asset hosts admit read-only asset requests.

The earlier exercise excluded the Font Awesome HTTP403 from console checks
and counted configured capability labels independently of successful checks.
Those shortcuts are removed. A covered capability now requires actual passing
named checks; absent, failed, inconsistent and partial evidence cannot become
complete coverage. Remaining coverage gaps cause a nonzero exit. No external
asset failure is waived.

Each attempt requires clean source and a fresh output destination, records
source/deck/bundle/build identities, and retains raw visited HTML plus JSON
results and failed requests. The database snapshot is read-only and checked
for changes during copying. Builds use the first-class distribution builder;
the already-built bundle is reused rather than built twice.

Three negative-control tests in the private site exercise cover production
credential exclusion, exact owned-origin writes and truthful capability
coverage. The site-specific exercise and its deployment configuration are
not shipped in the public package. These controls alone are not a successful
application capability run.
