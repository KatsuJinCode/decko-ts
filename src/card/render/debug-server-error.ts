// card-mod-format set/all/html/error.rb view :debug_server_error, the error
// page Decko shows in place of :server_error when the deck's *debugger card
// is on (card-1.110.0 lib/card/error.rb ServerError.view):
//
//   view :debug_server_error, wrap: { modal: { size: :full } } do
//     error_page = BetterErrors::ErrorPage.new Card::Error.current,
//                                              "PATH_INFO" => request.env["REQUEST_URI"]
//     haml :debug_server_error, {}, error_page
//   end
//
// The template (set/all/html/debug_server_error.haml) is rendered with the
// ErrorPage as its scope: exception_type, request_path, exception_message,
// backtrace_frames and id (better_errors-2.10.1 lib/better_errors/
// error_page.rb, stack_frame.rb). The port renders the same document from
// the current server error: its static stylesheet and scripts are the
// template's own (debug-server-error-assets.ts, generated from the gem), and
// the frames are the JavaScript stack's, classified the way StackFrame
// classifies Ruby's (application code, a dependency, or neither). A stack
// trace is the port's own by nature, so these bytes cannot equal Ruby's; the
// view's existence, scope and shape do.
//
// Card::Error.current is the error being reported (lib/card/error.rb
// report); withCurrentServerError is its seam. With no current error Ruby's
// ErrorPage raises on the nil exception; the port raises the same way, a
// named error instead of a crash inside the template.

import { h } from "./slot-html.js";
import type { ViewFn } from "./format.js";
import {
  DEBUG_ERROR_PAGE_CSS,
  DEBUG_ERROR_PAGE_FRAME_SCRIPT,
  DEBUG_ERROR_PAGE_HEAD_SCRIPTS,
} from "./debug-server-error-assets.js";

/** SecureRandom.hex(n) (ErrorPage#id). */
function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

let currentServerError: { error: Error; requestPath: string } | undefined;

/** Card::Error.current for the duration of fn (the error report scope). */
export function withCurrentServerError<T>(error: Error, requestPath: string, fn: () => T): T {
  const previous = currentServerError;
  currentServerError = { error, requestPath };
  try {
    return fn();
  } finally {
    currentServerError = previous;
  }
}

export interface DebugFrame {
  context: "application" | "gem" | "dunno";
  className: string;
  methodName: string;
  prettyPath: string;
  line: string;
}

/** StackFrame.from_exception over a V8 stack: "at Type.method (path:line:col)"
 *  or "at path:line:col". Application frames are the engine's own sources,
 *  dependency frames are under node_modules (StackFrame#gem?), anything else
 *  (node internals) is :dunno. pretty_path is the path relative to the
 *  application root for application frames and "name path" for
 *  dependencies, as StackFrame#pretty_path does. */
export function debugFrames(error: Error): DebugFrame[] {
  const frames: DebugFrame[] = [];
  for (const raw of (error.stack ?? "").split("\n").slice(1)) {
    const m = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+)(?::\d+)?\)?\s*$/.exec(raw);
    if (m === null) continue;
    const callee = m[1] ?? "";
    const file = (m[2] ?? "").replace(/\\/g, "/").replace(/^file:\/\/\/?/, "");
    const dot = callee.lastIndexOf(".");
    const className = dot === -1 ? "" : callee.slice(0, dot).replace(/^async\s+/, "");
    const methodName = dot === -1 ? callee.replace(/^async\s+/, "") : `#${callee.slice(dot + 1)}`;
    const modules = file.indexOf("/node_modules/");
    const app = file.search(/\/(src|deploy)\//);
    const context = modules !== -1 ? "gem" : app !== -1 ? "application" : "dunno";
    const prettyPath =
      context === "gem"
        ? file.slice(modules + "/node_modules/".length).replace("/", " ")
        : context === "application"
          ? file.slice(app + 1)
          : file;
    frames.push({ context, className, methodName, prettyPath, line: m[3] ?? "" });
  }
  return frames;
}

/** The template's body for one error page (debug_server_error.haml after
 *  its filters: .top header, the backtrace section, the frame script). */
export function debugErrorPageHtml(error: Error, requestPath: string, id: string = randomHex(8)): string {
  const frames = debugFrames(error);
  const type = error.name !== "" ? error.name : error.constructor.name;
  const message = error.message.trim().replace(/(\r?\n\s*\r?\n)+/g, "\n");
  const frameItems = frames
    .map(
      (f, i) =>
        `<li class="${f.context}" data-context="${f.context}" data-index="${i}">\n` +
        `<span class="stroke"></span>\n<i class="icon ${f.context}"></i>\n<div class="info">\n` +
        `<div class="name">\n<strong>${h(f.className)}</strong>\n<span class="method">${h(f.methodName)}</span>\n</div>\n` +
        `<div class="location">\n<span class="filename">${h(f.prettyPath)}</span>, line\n<span class="line">${h(f.line)}</span>\n</div>\n</div>\n</li>`,
    )
    .join("\n");
  const frameInfos = frames.map((_f, i) => `<div class="frame_info" id="frame_info_${i}" style="display:none;"></div>`).join("\n");
  return [
    `<style>\n${DEBUG_ERROR_PAGE_CSS}\n</style>`,
    ...DEBUG_ERROR_PAGE_HEAD_SCRIPTS.map((s) => `<script>\n${s}\n</script>`),
    `<div class="top">\n<header class="exception">\n<h2>\n<strong>${h(type)}</strong>\n<span>\nat ${h(requestPath)}\n</span>\n</h2>\n<p>${h(message)}</p>\n</header>\n</div>`,
    `<section class="backtrace">\n<nav class="sidebar">\n<nav class="tabs">\n` +
      `<a href="#" id="application_frames">Application Frames</a>\n<a href="#" id="all_frames">All Frames</a>\n</nav>\n` +
      `<ul class="frames">\n${frameItems}\n</ul>\n</nav>\n${frameInfos}\n</section>`,
    `<script>\n${DEBUG_ERROR_PAGE_FRAME_SCRIPT.replace('"#{id}"', JSON.stringify(id))}\n</script>`,
  ].join("\n");
}

/** view :debug_server_error (set/all/html/error.rb:4-8). */
export const debugServerErrorView: ViewFn = () => {
  const current = currentServerError;
  if (current === undefined) {
    throw new Error("debug_server_error: no current server error (Card::Error.current is nil)");
  }
  return debugErrorPageHtml(current.error, current.requestPath);
};
