// The views the compiled HTML_VIEWS record ships before any mod loads.
//
// Since commit 9cadf48f the board/edit closure (:input, :edit, :edit_form,
// :help, :guide and the rest) is compiled into HTML_VIEWS: the production
// worker binds no mod deck, so those views must render without one. A mod
// suite's "without the mod" arm therefore expects a compiled view to render
// (as it does in a real Ruby deck, where card-mod-edit is always loaded) and
// every other mod view to raise UnsupportedViewError.
//
// Captured when this module is first imported, which is before any test
// constructs a ModLoader (loaders register into the same record).

import { expect } from "vitest";
import { HTML_VIEWS } from "../../src/card/render/views.js";
import { UnsupportedViewError } from "../../src/card/render/format.js";

export const NATIVE_HTML_VIEWS: ReadonlySet<string> = new Set(Object.keys(HTML_VIEWS));

/** Without the view's mod: a compiled view renders a string, any other view
 *  raises UnsupportedViewError. */
export async function expectViewWithoutMod(render: Promise<string>, view: string): Promise<void> {
  if (NATIVE_HTML_VIEWS.has(view)) {
    await expect(render).resolves.toEqual(expect.any(String));
  } else {
    await expect(render).rejects.toThrow(UnsupportedViewError);
  }
}
