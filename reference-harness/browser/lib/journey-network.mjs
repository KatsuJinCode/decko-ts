/** Observe actual HTTP outcomes without recording bodies, query tokens or credentials. */
export function recordJourneyNetwork(context, result) {
  result.network ??= [];
  const address = value => {
    try { const url = new URL(value); return { origin: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname) ? "local" : url.hostname, path: url.pathname }; }
    catch { return { origin: "invalid", path: "invalid" }; }
  };
  context.on("response", response => {
    const request = response.request();
    result.network.push({ ...address(response.url()), method: request.method(), status: response.status(), resourceType: request.resourceType(), navigation: request.isNavigationRequest() });
  });
  context.on("requestfailed", request => {
    result.network.push({ ...address(request.url()), method: request.method(), status: null, resourceType: request.resourceType(), failure: request.failure()?.errorText ?? "request failed" });
  });
}
