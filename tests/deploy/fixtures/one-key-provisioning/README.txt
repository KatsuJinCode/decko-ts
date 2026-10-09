Fixtures for tests/deploy/one-key-provisioning-payload.test.ts — the one-key
Bunny provisioning runner.

sample-payload.json
  A valid decko-one-key-provisioning-payload/1 document, exactly the shape
  one-key-provisioning-page.html generates (the page's own defaults with a
  file identity filled in). The runner's validatePayload must accept it and
  normalize it unchanged.

script-create-response.json
  Synthetic EdgeScriptModel transcription for POST /compute/script — 201
  body shape per the fetched Bunny Compute OpenAPI (Id, Name,
  DefaultHostname, LinkedPullZones[.Id/.PullZoneName]). Identifiers are
  SYNTHETIC (900001/900002), not live captures; real account ids
  must stay out of this repo.

database-create-response.json
  Synthetic transcription of POST /database/v1/databases 200 body per the
  fetched Bunny Database Backend API spec (name/id/url/group_id...). The
  ulid-shaped strings are synthetic.

auth-generate-response.json
  Synthetic transcription of PUT /database/v2/databases/{id}/auth/generate
  200 body ({token, expires_at}). The token text is a synthetic placeholder,
  never a real credential.
