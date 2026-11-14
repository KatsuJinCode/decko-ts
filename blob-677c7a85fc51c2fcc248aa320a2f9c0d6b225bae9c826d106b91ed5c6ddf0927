const TIMING_FIELDS = ["startTime", "domainLookupStart", "domainLookupEnd", "connectStart", "secureConnectionStart", "connectEnd", "requestStart", "responseStart", "responseEnd"];

/** Observe actual HTTP outcomes without recording bodies, query tokens or credentials.
 * Request.timing() uses epoch milliseconds for startTime and relative
 * milliseconds for its other fields; -1 means unavailable. Observer stamps
 * use Node's monotonic performance clock and must not be mixed with either.
 */
export function recordJourneyNetwork(context, result, { monotonicNow = () => performance.now(), epochNow = () => Date.now() } = {}) {
  result.network ??= [];
  result.networkRequests ??= [];
  result.networkUnfinished ??= [];
  result.networkTiming ??= { format: "decko-journey-network-timing/1", observerClock: "node-performance-now-ms", captures: [], errors: [] };
  const capture = { id: result.networkTiming.captures.length + 1, startedAtMs: monotonicNow(), startedAtEpochMs: epochNow() };
  result.networkTiming.captures.push(capture);
  const requests = new Map();
  let nextId = 0, finalized = false;
  const address = value => {
    try { const url = new URL(value); return { origin: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname) ? "local" : url.hostname, path: url.pathname }; }
    catch { return { origin: "invalid", path: "invalid" }; }
  };
  const readTiming = (request, state, phase) => {
    try {
      const timing = request.timing();
      state.timing.request = Object.fromEntries(TIMING_FIELDS.map(key => [key, Number.isFinite(timing[key]) ? timing[key] : null]));
      state.timing.requestPhase = phase;
    } catch {
      state.timing.request ??= null;
      result.networkTiming.errors.push({ requestId: state.id, phase, reason: "request timing unavailable" });
    }
  };
  const stateFor = request => {
    let state = requests.get(request);
    if (state) return state;
    state = { id: `${capture.id}:${++nextId}`, state: "unobserved", timing: { requestedAtMs: null, responseAtMs: null, finishedAtMs: null, failedAtMs: null }, records: [] };
    requests.set(request, state);
    const previous = request.redirectedFrom();
    if (previous) {
      const prior = stateFor(previous);
      state.redirectedFromId = prior.id;
      prior.redirectedToId = state.id;
      for (const record of prior.records) record.redirectedToId = state.id;
    }
    state.trace = { ...address(request.url()), method: request.method(), resourceType: request.resourceType(), navigation: request.isNavigationRequest(), ...extra(state) };
    state.records.push(state.trace);
    result.networkRequests.push(state.trace);
    return state;
  };
  const extra = state => ({ requestId: state.id, state: state.state, timing: state.timing, ...(state.redirectedFromId ? { redirectedFromId: state.redirectedFromId } : {}), ...(state.redirectedToId ? { redirectedToId: state.redirectedToId } : {}) });
  const onRequest = request => {
    if (finalized) return;
    const state = stateFor(request);
    state.state = "requested";
    state.timing.requestedAtMs = monotonicNow();
    state.trace.state = state.state;
  };
  const onResponse = response => {
    if (finalized) return;
    const request = response.request();
    const state = stateFor(request);
    state.state = "response";
    state.timing.responseAtMs = monotonicNow();
    readTiming(request, state, "response");
    const record = { ...address(response.url()), method: request.method(), status: response.status(), resourceType: request.resourceType(), navigation: request.isNavigationRequest(), ...extra(state), serverTiming: response.headers()["server-timing"] ?? null };
    Object.assign(state.trace, { state: state.state, status: record.status, serverTiming: record.serverTiming });
    state.records.push(record);
    result.network.push(record);
  };
  const onFinished = request => {
    if (finalized) return;
    const state = stateFor(request);
    state.state = "finished";
    state.timing.finishedAtMs = monotonicNow();
    readTiming(request, state, "finished"); // responseEnd is available only now.
    for (const record of state.records) record.state = state.state;
  };
  const onFailed = request => {
    if (finalized) return;
    const state = stateFor(request);
    state.state = "failed";
    state.timing.failedAtMs = monotonicNow();
    readTiming(request, state, "failed");
    state.trace.failure = request.failure()?.errorText ?? "request failed";
    for (const record of state.records) record.state = state.state;
    const record = { ...address(request.url()), method: request.method(), status: null, resourceType: request.resourceType(), failure: request.failure()?.errorText ?? "request failed", ...extra(state) };
    state.records.push(record);
    result.network.push(record);
  };
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    capture.closedAtMs = monotonicNow();
    for (const [request, state] of requests) {
      if (state.state === "finished" || state.state === "failed") continue;
      readTiming(request, state, "close");
      state.trace.state = "unfinished";
      result.networkUnfinished.push({ ...address(request.url()), method: request.method(), resourceType: request.resourceType(), ...extra(state), state: "unfinished" });
    }
    capture.unfinished = result.networkUnfinished.filter(record => record.requestId.startsWith(`${capture.id}:`)).length;
    for (const [event, listener] of listeners) context.off(event, listener);
  };
  const listeners = [["request", onRequest], ["response", onResponse], ["requestfinished", onFinished], ["requestfailed", onFailed], ["close", finalize]];
  for (const [event, listener] of listeners) context.on(event, listener);
  return { finalize };
}
