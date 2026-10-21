// The bytes the port SERVES for the TinyMCE nest plugin, compared with the
// bytes Ruby serves.
//
//   npx vitest run tests/card/mod-loader/tinymce-nest-plugin-parity.test.ts
//
// Ruby's file is
// card-mod-tinymce_editor-0.20.0/public/plugins/nest/plugin.min.js, vendored
// verbatim at fixtures/vendor/card-mod-tinymce_editor-0.20.0/public/plugins/
// nest/plugin.min.js (sha256
// 089c94a67f8f9862be068ec95010004c320105e1fc217b84f7b05a91a36ed6da — the gem's
// own, and the test asserts that digest so the vendored copy cannot drift
// silently).
//
// The port must serve those bytes with exactly ONE documented difference. The
// stock callback is `nest.openNestEditor(t)`, which reads data-card-id and then
// a `card-id` attribute; on this engine it requests /~undefined and edits
// another type's nest rules. So the button action is replaced with the public
// entry point for the FIELD'S OWN owning card
// (nest.openNestEditorForSlot($(owner), $(field)), preserving the selection
// params and the editor id). That repair is what
// card-mod-tinymce-editor-harness-probe.test.ts exercises; this test is the
// byte half - it fails if anything ELSE drifts, which is the part a single
// behavioural test cannot see.
//
// The route itself is deploy/bunny-worker-src/bunny-edge-engine-handler.ts,
// which answers /mod/tinymce_editor/plugins/nest/plugin.min.js with this
// constant and redirects every other path under the prefix to the published
// distribution. The distribution has no nest plugin, so this constant is the
// whole nest feature on this host.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { TINYMCE_NEST_PLUGIN_JS } from "../../../deploy/bunny-worker-src/bunny-edge-tinymce-nest-plugin.js";

const RUBY_PLUGIN = readFileSync(
  fileURLToPath(
    new URL(
      "../../../fixtures/vendor/card-mod-tinymce_editor-0.20.0/public/plugins/nest/plugin.min.js",
      import.meta.url,
    ),
  ),
  "utf8",
);

const STOCK_CALLBACK = "nest.openNestEditor(t)";

/** The port's replacement callback, transcribed from the module that builds
 *  it (deploy/bunny-worker-src/bunny-edge-tinymce-nest-plugin.ts:11). */
const OWNED_CALLBACK =
  'function(t){var field=document.getElementById(t.id);if(!field)throw Error("Nest editor field is unavailable");var owner=field.closest(".card-editor[data-card-link-name]")||field.closest(".card-slot[data-card-link-name]");if(!owner||!owner.getAttribute("data-card-link-name"))throw Error("Nest editor owning card is unavailable");nest.openNestEditorForSlot($(owner),$(field),nest.editParams(t)+"&tinymce_id="+encodeURIComponent(t.id))}';

describe("the nest plugin the port serves", () => {
  it("vendors the gem's own file, byte for byte", () => {
    expect(createHash("sha256").update(RUBY_PLUGIN, "utf8").digest("hex")).toBe(
      "089c94a67f8f9862be068ec95010004c320105e1fc217b84f7b05a91a36ed6da",
    );
  });

  it("differs from Ruby's file in exactly the documented field-owner repair", () => {
    expect(RUBY_PLUGIN.split(STOCK_CALLBACK)).toHaveLength(2); // the callback occurs once
    expect(TINYMCE_NEST_PLUGIN_JS).toBe(
      RUBY_PLUGIN.replace(STOCK_CALLBACK, `(${OWNED_CALLBACK})(t)`),
    );
    // And the repair is still in force: no stock call survives anywhere.
    expect(TINYMCE_NEST_PLUGIN_JS).not.toContain(STOCK_CALLBACK);
    expect(TINYMCE_NEST_PLUGIN_JS).toContain("nest.openNestEditorForSlot");
  });

  it("keeps every registration Ruby makes", () => {
    for (const registration of [
      'tinymce.PluginManager.add("nest"',
      't.ui.registry.addIcon("deckolink","[[]]")',
      't.ui.registry.addIcon("nest","{{}}")',
      'addToggleButton("deckolink",{text:"[[]]",tooltip:"Insert/edit link"',
      'addToggleButton("nest",{text:"{{}}",tooltip:"Insert/edit nest"',
      'addToggleButton("image",{text:"image",tooltip:"insert image"',
      'addMenuItem("deckolink",{text:"Link...",context:"insert",icon:"deckolink"',
      'addMenuItem("nest",{icon:"nest",text:"Nest...",context:"insert"',
      'addMenuItem("image",{icon:"image",text:"Image...",context:"insert"',
      'addContextMenu("nest"',
      'addCommand("mceNest"',
      'addShortcut("Meta+Z"',
    ]) {
      expect(TINYMCE_NEST_PLUGIN_JS, registration).toContain(registration);
    }
  });
});
