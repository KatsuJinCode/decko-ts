// The compiled *all+*script bundle — the port of the OUTPUT side of the
// decko asset pipeline for script assets. Ruby's serving bytes are the
// stored content of the `*all+*script+*asset output` file card, written by:
//
//   asset_outputter.rb:20-25 update_asset_output:
//     `lock { store_output input_from_item_cards }`
//   asset_outputter.rb:32-34 input_from_item_cards (joint "\n"):
//     `input_item_cards.map(&:asset_input_content).compact.join(joint)`
//
// where on a compress_assets=TRUE deck (the production state — cardio
// railtie default, lib/cardio/railtie.rb:35) each item's asset_input_content
// bottoms out in the script `:compressed` view:
//
//   00_script.rb:9-13  view :compressed -> js = compress(_render_core)
//                                             comment_with_source js
//   00_script.rb:20-22 comment_with_source: "// #{card.name}\n#{js}"
//                      (the leaf card's name IS the file basename — the
//                      group builds virtual file cards with
//                      name = File.basename(path), asset_group.rb)
//   00_script.rb:25-27 compress -> try_compress under compress?:
//                      `Uglifier.new(harmony: true).compile(input)`
//   asset_group.rb     render_items_and_compress: leaves join "\n"
//
// THE OUTPUT CONTRACT this module mirrors: the compiled bundle is the
// assembled script input republished per leaf as
// `"// <basename>\n" + Uglifier(harmony)(core)`, leaves joined "\n". The
// `// basename` headers are line-anchored and unique in the deck's real
// assets (oracle-verified across all 49 leaves), so the leaf split over the
// assembled input is deterministic and the per-leaf compression is the
// SAME function Ruby runs — running it here reproduces the production
// bytes without the mod asset directories the assembly originally read.
//
// Assembled-input pin: fixtures/captured/all-script-assembled-input.js
// (1,050,887 bytes, sha256 36a3d55df942e04f... — the LIVE
// oracle pin of the deck's *all+*script assembled input, the same bytes the
// production bundle was compiled from).
// Compiled-output oracle: fixtures/captured/script-compile-oracle-leaves.json
// (the live production bundle's per-leaf bytes — 48/49 shared leaves
// byte-exact; the named divergences live in that fixture's _provenance).
//
// The port (asset-input-assembly.ts) owns the ASSEMBLY side
// (the mod walk + leaf renders); this module owns the COMPRESSION side of
// the same pipeline, driven from the assembled text.

import { uglifyHarmonyCompile } from "./uglify-harmony-compile-engine.js";

/** One `// <basename>` leaf of the assembled script input (00_script.rb:20-22
 *  comment_with_source grammar). The core is everything to the next leaf
 *  header (or the end), minus its own header line. */
export interface AssembledScriptLeaf {
  /** The leaf card's name as commented — the file basename ("decko.js.coffee",
   *  "script_tinymce.js"). */
  name: string;
  /** The leaf's JS core — the bytes the :compressed view compresses. */
  core: string;
}

/** The leaf-header grammar: a line that is exactly `// <something>.js` or
 *  `// <something>.js.coffee` (the card names the group's walk produces —
 *  File.basename of .js/.coffee paths, script_group.rb valid_file_extensions
 *  %w[js coffee]). Line-anchored so in-code "http://..." strings and block
 *  comments never split a leaf (oracle: 49/49 real leaves split clean). */
const LEAF_HEADER = /^\/\/ (.+\.(?:js|coffee))\s*$/gm;

/** Split the assembled *all+*script input into its leaves, in bundle order. */
export function splitAssembledScriptLeaves(assembled: string): AssembledScriptLeaf[] {
  const leaves: AssembledScriptLeaf[] = [];
  const headers: { name: string; idx: number }[] = [];
  LEAF_HEADER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LEAF_HEADER.exec(assembled)) !== null) {
    headers.push({ name: match[1] as string, idx: match.index });
  }
  for (let i = 0; i < headers.length; i += 1) {
    const start = headers[i]!.idx;
    const end = i + 1 < headers.length ? headers[i + 1]!.idx : assembled.length;
    const leafText = assembled.slice(start, end);
    const newlineAt = leafText.indexOf("\n");
    // A header with no body line is not a leaf header (never occurs in the
    // oracle deck — every leaf carries its core).
    if (newlineAt === -1) continue;
    leaves.push({
      name: headers[i]!.name,
      core: leafText.slice(newlineAt + 1),
    });
  }
  return leaves;
}

/** The compiled bundle: per leaf `"// <basename>\n" + uglifyHarmonyCompile(core)`,
 *  joined "\n" — 00_script.rb's comment_with_source over try_compress, with
 *  asset_group.rb's render_items_and_compress join. Each leaf compiles
 *  independently (Ruby compresses per item card, not per bundle), so mangle
 *  dictionaries restart per leaf — the oracle-verified shape. */
export function compileScriptBundle(assembled: string): string {
  return splitAssembledScriptLeaves(assembled)
    .map((leaf) => `// ${leaf.name}\n${uglifyHarmonyCompile(leaf.core)}`)
    .join("\n");
}
