// Edge-host LibSass compiler: the ScssCompiler the edge write surfaces pass
// (cloudflare-write-routes.ts mountWrite), where no native program can run.
// The module is the same LibSass 3.6.4 the Node host builds natively
// (tools/libsass/build-native.mjs) and the Ruby oracle's sassc gem ships,
// compiled to a standalone WebAssembly reactor by tools/libsass/build-wasm.mjs
// (sassc-wasm.c is its wrapper) and vendored as base64
// (vendor/libsass-wasm/, MIT, see the LICENSE there) so every bundler that
// ships the write surface carries it without loader configuration.
//
// The compile is the SassC::Engine string-template compile, exactly what
// src/server/libsass-process.ts runs as a child process on Node hosts — one
// seam, one compiler, two runtimes. Instantiation is lazy and cached per
// isolate: a host that never saves a stylesheet never pays for it.

import libsassWasmBase64 from "../../vendor/libsass-wasm/libsass-3.6.4-wasm-base64.js";
import { memoizeScssCompiler, type ScssCompiler, type ScssOutputStyle } from "../card/assets/scss-compiler.js";

interface LibsassExports {
  memory: WebAssembly.Memory;
  malloc(bytes: number): number;
  free(pointer: number): void;
  /** sassc-wasm.c: 0 on success with *out_css malloc'd, 1 with *out_error. */
  sassc_compile(source: number, style: number, outCss: number, outError: number): number;
  _initialize(): void;
}

/** The Sass_Output_Style ordinals sassc-wasm.c switches on (the order of
 *  enum Sass_Output_Style in sass/context.h). */
const STYLE_CODES: Record<ScssOutputStyle, number> = { nested: 0, expanded: 1, compact: 2, compressed: 3 };

/** WASI errno 8 (bad file descriptor). The compile touches no file; the
 *  module keeps its stdio layer (the C++ iostream static initializers wire
 *  the standard streams up at ctor time), and the loader answers the fd
 *  calls benignly: reads end immediately (EOF), writes go nowhere. */
const EBADF = 8;

/** Base64 to bytes without platform helpers (atob is not universal on the
 *  runtimes these bundles ship to; this decoder is). */
function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  const table = new Uint8Array(128).fill(255);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = i;
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(new ArrayBuffer(Math.floor((clean.length * 3) / 4)));
  let buffer = 0;
  let bits = 0;
  let at = 0;
  for (let i = 0; i < clean.length; i++) {
    const value = table[clean.charCodeAt(i)];
    if (value === 255) throw new Error("libsass wasm module: invalid base64");
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

/** The one import the module asks for beyond the WASI stubs: the memory
 *  growth notification. The loader derives fresh views per call, so the
 *  notification carries no state to update. */
function importObject(): WebAssembly.Imports {
  return {
    env: {
      emscripten_notify_memory_growth: () => {},
      // LibSass's context setup calls File::get_cwd() (sass context.cpp:46)
      // OUTSIDE any of its compile error handlers, and its get_cwd throws
      // "cwd gone missing" when getcwd fails — a failure here escapes every
      // handler in the module. The compile reads no filesystem, so a bare
      // "/" answers it: Linux getcwd syscall semantics (the length written,
      // NUL included, or -ERANGE when the buffer is too small).
      __syscall_getcwd: (buffer: number, size: number) => {
        const path = new Uint8Array([0x2f, 0]); // "/\0"
        if (path.length > size) return -34; // -ERANGE
        new Uint8Array(libsassExports!.memory.buffer).set(path, buffer);
        return path.length;
      },
      // directory reads: the compile opens no directories
      __syscall_getdents64: () => -EBADF,
    },
    wasi_snapshot_preview1: {
      proc_exit: (code: number) => {
        throw new Error(`libsass wasm module called proc_exit(${code})`);
      },
      fd_close: () => EBADF,
      // the standard streams: stdin reads end immediately (EOF), stdout and
      // stderr absorb whatever libc writes and report it written
      fd_read: (fd: number, iovs: number, iovsLength: number, nreadPointer: number) => {
        if (fd !== 0) return EBADF;
        new DataView(libsassExports!.memory.buffer).setUint32(nreadPointer, 0, true);
        return 0;
      },
      fd_write: (fd: number, iovs: number, iovsLength: number, nwrittenPointer: number) => {
        if (fd !== 1 && fd !== 2) return EBADF;
        const view = new DataView(libsassExports!.memory.buffer);
        let total = 0;
        for (let i = 0; i < iovsLength; i++) {
          total += view.getUint32(iovs + i * 8, true);
        }
        view.setUint32(nwrittenPointer, total, true);
        return 0;
      },
      fd_seek: () => EBADF,
      environ_sizes_get: (countPointer: number, sizePointer: number) => {
        // an empty environment (the module is built -sFILESYSTEM=0 and reads
        // none); called from libc init, which runs under _initialize, by
        // which time the exports are assigned
        const view = new DataView(libsassExports!.memory.buffer);
        view.setInt32(countPointer, 0, true);
        view.setInt32(sizePointer, 0, true);
        return 0;
      },
      environ_get: () => 0,
      random_get: (pointer: number, length: number) => {
        // LibSass's output does not consume randomness; zeros keep the
        // module deterministic on runtimes without Web Crypto.
        new Uint8Array(libsassExports!.memory.buffer).fill(0, pointer, pointer + length);
        return 0;
      },
    },
  };
}

let libsassExports: LibsassExports | undefined;
let libsassModule: Promise<LibsassExports> | undefined;

function instantiate(): Promise<LibsassExports> {
  libsassModule ??= (async () => {
    const module = await WebAssembly.compile(decodeBase64(libsassWasmBase64));
    const instance = await WebAssembly.instantiate(module, importObject());
    libsassExports = instance.exports as unknown as LibsassExports;
    libsassExports._initialize();
    return libsassExports;
  })();
  return libsassModule;
}

/** The exports' views must be re-derived after every call: the compile grows
 *  the heap, and a stale view reads the pre-growth buffer. */
function readCString(pointer: number): string {
  const bytes = new Uint8Array(libsassExports!.memory.buffer);
  let end = pointer;
  while (bytes[end] !== 0) end++;
  return new TextDecoder().decode(bytes.subarray(pointer, end));
}

/** An ScssCompiler that compiles in this runtime through the vendored
 *  WebAssembly module. Errors carry LibSass's message, the same shape the
 *  Node process compiler rejects with. */
export function libsassWasmCompiler(): ScssCompiler {
  return memoizeScssCompiler(async (source: string, style: ScssOutputStyle) => {
    if (source === "") return ""; // SassC::Engine#render returns the empty template unchanged
    const ex = await instantiate();
    const sourceBytes = new TextEncoder().encode(source);
    const sourcePointer = ex.malloc(sourceBytes.length + 1);
    const resultPointer = ex.malloc(8); // two i32 out slots: css, error
    try {
      const before = new Uint8Array(ex.memory.buffer);
      before.set(sourceBytes, sourcePointer);
      before[sourcePointer + sourceBytes.length] = 0;
      const scratch = new DataView(ex.memory.buffer);
      scratch.setInt32(resultPointer, 0, true);
      scratch.setInt32(resultPointer + 4, 0, true);
      const status = ex.sassc_compile(sourcePointer, STYLE_CODES[style], resultPointer, resultPointer + 4);
      // fresh views: the compile may have grown the memory
      const after = new DataView(ex.memory.buffer);
      const cssPointer = after.getInt32(resultPointer, true);
      const errorPointer = after.getInt32(resultPointer + 4, true);
      if (status !== 0) {
        const message = errorPointer !== 0 ? readCString(errorPointer).trim() : "";
        throw new Error(`LibSass compile failed: ${message || `exit ${status}`}`);
      }
      return cssPointer !== 0 ? readCString(cssPointer) : "";
    } finally {
      const cleanup = new DataView(ex.memory.buffer);
      const cssPointer = cleanup.getInt32(resultPointer, true);
      const errorPointer = cleanup.getInt32(resultPointer + 4, true);
      if (cssPointer !== 0) ex.free(cssPointer);
      if (errorPointer !== 0) ex.free(errorPointer);
      ex.free(resultPointer);
      ex.free(sourcePointer);
    }
  });
}
