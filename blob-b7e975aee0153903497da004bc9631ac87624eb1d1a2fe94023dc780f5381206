// sdk-shim.mjs — stands in for "@bunny.net/edgescript-sdk" when the deployed
// bundle runs on Node.
//
// The bundle keeps that one import bare by design (tools/bundle-bunny-edge-
// engine.mjs: the platform resolves it; inlining would pin the Bunny.v1
// serve contract into the artifact). The edge entry calls
// BunnySDK.net.http.serve(handler) at module scope to register the request
// handler, so this shim captures that handler and the local host drives it
// over node:http. Everything else in the bundle runs untouched.

/** The handler the bundle registers, set by net.http.serve at import time. */
export const captured = { handler: undefined };

export const net = {
  http: {
    serve(handler) {
      captured.handler = handler;
      return {
        unlisten() {},
        stop() {},
      };
    },
  },
};

export default { net };