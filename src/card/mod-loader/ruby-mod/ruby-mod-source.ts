// Runs an unported Ruby card-mod against the port: CRuby compiled to
// WebAssembly (ruby.wasm, @ruby/wasm-wasi) evaluates the mod's set/**/*.rb
// files through a shim of the Card set-module DSL (card-set-shim.rb), and the
// registrations it records become an ordinary ModSource for the mod loader.
//
// View bodies and event bodies stay in Ruby. When the engine renders a
// registered view, the view function calls into the Ruby VM synchronously;
// when the Ruby body asks for another view (`render_core`, `render :titled`)
// or card data (`card.name`, `card.content`), it calls back into the engine
// through the bridge object installed on globalThis.
//
// Node only for now: the VM boots from the wasm file on disk. A Worker build
// would hand DefaultRubyVM a precompiled WebAssembly.Module instead.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RenderCard, RenderFormat, ViewFn, ViewContext } from "../../render/format.js";
import type {
  DeckoModManifest,
  ModEngineHost,
  ModEventCard,
  ModEventContext,
  ModEventRegistration,
  ModEventStage,
  ModEventTrigger,
  ModSetModuleFile,
  ModViewConfig,
  ModViewDefinition,
} from "../mod-manifest.js";
import type { ModSource } from "../../mod-loader.js";

const SHIM_PATH = fileURLToPath(new URL("./card-set-shim.rb", import.meta.url));

/** The slice of ruby.wasm's RubyVM this module uses. */
interface RubyVMLike {
  eval(code: string): { toString(): string };
}

interface RubyRegistrations {
  set_path: string;
  views: Array<{ format: string; view: string; config: Record<string, unknown> }>;
  events: Array<{
    event: string;
    at: string | null;
    on: string[] | null;
    changed: string[] | null;
    when: string | null;
  }>;
  accessors: string[];
}

/** What a Ruby body sees while it runs: the format being rendered, or the
 *  card an event fires on. One frame per nested call. */
type BridgeFrame =
  | { kind: "view"; fmt: RenderFormat }
  | { kind: "event"; card: ModEventCard; ctx: ModEventContext; setContent: (s: string) => void };

/** One loaded Ruby mod: its VM, its manifest and what the bridge reaches. */
export interface RubyModHandle {
  readonly source: ModSource;
  /** The set files evaluated, relative to the mod's set/ directory. */
  readonly setFiles: readonly string[];
  /** The raw registrations each set file produced (for reporting). */
  readonly registrations: readonly RubyRegistrations[];
}

let vmPromise: Promise<RubyVMLike> | undefined;

/** Boot one CRuby VM (shared by every Ruby mod in the process) and load the
 *  set-module DSL shim into it. */
export function rubyVM(): Promise<RubyVMLike> {
  vmPromise ??= (async () => {
    const [{ DefaultRubyVM }, wasmPath] = await Promise.all([
      import("@ruby/wasm-wasi/dist/node"),
      Promise.resolve(
        fileURLToPath(import.meta.resolve("@ruby/3.4-wasm-wasi/dist/ruby+stdlib.wasm")),
      ),
    ]);
    const module = await WebAssembly.compile(readFileSync(wasmPath));
    const { vm } = await DefaultRubyVM(module, { consolePrint: false });
    installBridge();
    vm.eval(readFileSync(SHIM_PATH, "utf8"));
    return vm as unknown as RubyVMLike;
  })();
  return vmPromise;
}

const frames: BridgeFrame[] = [];
let host: ModEngineHost | undefined;

function top(): BridgeFrame {
  const f = frames[frames.length - 1];
  if (f === undefined) throw new Error("ruby mod bridge called outside a Ruby body");
  return f;
}

function renderCardNamed(name: string): RenderCard | undefined {
  if (name === "") {
    const f = top();
    return f.kind === "view" ? f.fmt.card : undefined;
  }
  return host?.fetchRenderCard(name) as RenderCard | undefined;
}

/** The engine side of the Ruby bodies' calls (CardProxy / FormatProxy in
 *  card-set-shim.rb). Every answer is a string; "" stands for nil. */
function installBridge(): void {
  (globalThis as Record<string, unknown>).__deckoRubyBridge = {
    renderView(view: string): string {
      const f = top();
      if (f.kind !== "view") throw new Error(`render(${view}) outside a view`);
      const result = f.fmt.renderView(view);
      return result === null ? "" : String(result);
    },
    cardName(): string {
      const f = top();
      return f.kind === "view" ? f.fmt.card.name.s : f.card.name;
    },
    cardKey(name: string): string {
      const f = top();
      if (f.kind === "event" && name === f.card.name) return f.card.key ?? "";
      return renderCardNamed(name === cardNameOfTop() ? "" : name)?.key ?? "";
    },
    typeName(name: string): string {
      return renderCardNamed(name === cardNameOfTop() ? "" : name)?.typeName ?? "";
    },
    cardId(name: string): string {
      const f = top();
      if (f.kind === "event" && name === f.card.name) return f.card.id === undefined ? "" : String(f.card.id);
      const id = renderCardNamed(name === cardNameOfTop() ? "" : name)?.id;
      return id === undefined ? "" : String(id);
    },
    content(name: string): string {
      const f = top();
      if (name === "" && f.kind === "event") return f.ctx.saveInput?.pendingContent ?? f.card.dbContent ?? "";
      return renderCardNamed(name)?.dbContent ?? "";
    },
    setContent(value: string): void {
      const f = top();
      if (f.kind !== "event") throw new Error("content= outside an event");
      f.setContent(value);
    },
    action(): string {
      const f = top();
      return f.kind === "event" ? (f.card.action ?? "") : "";
    },
  };
}

function cardNameOfTop(): string {
  const f = top();
  return f.kind === "view" ? f.fmt.card.name.s : f.card.name;
}

function rubyString(s: string): string {
  // A single-quoted Ruby literal: only backslash and quote need escaping.
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function listSetFiles(setDir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(setDir, rel)).sort()) {
    const relPath = rel === "" ? entry : `${rel}/${entry}`;
    if (statSync(path.join(setDir, relPath)).isDirectory()) out.push(...listSetFiles(setDir, relPath));
    else if (entry.endsWith(".rb")) out.push(relPath);
  }
  return out;
}

const STAGES: readonly ModEventStage[] = [
  "initialize", "prepare_to_validate", "validate", "prepare_to_store", "store",
  "finalize", "integrate", "after_integrate", "integrate_with_delay",
];

/**
 * Load the Ruby card-mod at `modDir` (a directory holding set/**.rb, as a
 * mod directory under a deck's mod/ does) and answer a ModSource the mod
 * loader composes like any ported manifest.
 */
export async function loadRubyMod(modDir: string, opts: { name?: string } = {}): Promise<RubyModHandle> {
  const vm = await rubyVM();
  const name = opts.name ?? path.basename(modDir);
  const setDir = path.join(modDir, "set");
  const setFiles = listSetFiles(setDir);
  const registrations: RubyRegistrations[] = [];
  const setModules: ModSetModuleFile[] = [];

  for (const rel of setFiles) {
    const source = readFileSync(path.join(setDir, rel), "utf8");
    const index = Number(
      vm.eval(`DeckoRubyMods.load_set_file(${rubyString(rel)}, ${rubyString(source)})`).toString(),
    );
    const reg = JSON.parse(vm.eval(`DeckoRubyMods.registrations(${index})`).toString()) as RubyRegistrations;
    registrations.push(reg);

    const formats: Record<string, { views: ModViewDefinition[] }> = {};
    for (const v of reg.views) {
      // The base format's views are inherited by html (format.rb); the port's
      // registry is keyed by the concrete format, so base views land on html.
      const target = v.format === "base" ? "html" : v.format;
      const viewFn: ViewFn = (ctx: ViewContext) => {
        frames.push({ kind: "view", fmt: ctx.fmt });
        try {
          return vm
            .eval(`DeckoRubyMods.render_view(${index}, :${target}, ${rubyString(v.view)})`)
            .toString();
        } finally {
          frames.pop();
        }
      };
      (formats[target] ??= { views: [] }).views.push({
        view: v.view,
        viewFn,
        config: v.config as ModViewConfig,
      });
    }

    const events: ModEventRegistration[] = reg.events.map((e, eventIndex) => {
      const at = (STAGES as readonly string[]).includes(e.at ?? "") ? (e.at as ModEventStage) : undefined;
      return {
        event: e.event,
        at,
        on: e.on === null ? undefined : (e.on as ModEventTrigger[]),
        changed: e.changed ?? undefined,
        // `when:` is evaluated inside the Ruby body (CardProxy
        // #event_condition_applies?), so the registration carries none.
        fn: (card: ModEventCard, _host: ModEngineHost, ctx: ModEventContext) => {
          frames.push({
            kind: "event",
            card,
            ctx,
            setContent: (s) => {
              if (ctx.saveInput === undefined) {
                throw new Error(`event ${e.event}: content= needs a save input on this save path`);
              }
              ctx.saveInput.setContent(s);
            },
          });
          try {
            vm.eval(`DeckoRubyMods.run_event(${index}, ${eventIndex})`);
          } finally {
            frames.pop();
          }
        },
      };
    });

    setModules.push({
      setPath: reg.set_path,
      formats: Object.keys(formats).length > 0 ? formats : undefined,
      events: events.length > 0 ? events : undefined,
    });
  }

  const manifest: DeckoModManifest = {
    name,
    setModules,
    prepareEngine: async (h) => {
      host = h;
    },
  };
  return { source: { manifest, group: "custom" }, setFiles, registrations };
}
