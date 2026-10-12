// D9 (warm-map junction load): the name algebra the engine's
// prepare-phase junction warm and card-mod-edit's :template_nest view now
// SHARE, plus the two pins that make the share load-bearing.
//
// WHY THIS IS A PIN AND NOT A COMMENT: the engine pass
// (render.ts#enrichTemplateLinkSetJunctions) composes the set names it warms
// and the view (card-mod-edit.ts#templateLinkSetNameForRelativeName) composes
// the name it renders, through ONE function —
// templateLinkSetNameFromParts (render/views.ts). If the two ever drift, the
// warm pass seats a junction the view never asks for (harmless dead warm) OR,
// worse, the view asks for a junction the warm pass never seated (the exact
// D9 defect: fabricated unknown card, no data-card-id). The two directions are
// pinned separately below so a drift names itself.
//
// The composition the share exists for, on a type-set template page:
//   page `Role+*type+*default`, content `<p>{{+*members}}</p>`
//     -> on_type_set base `Role` (the trunk `Role+*type`'s left)
//     -> compose `Role+*members`
//     -> +`*type plus right` = `Role+*members+*type plus right`
//     -> that junction EXISTS in the deck; the rendered nest carries its
//        data-card-id and the SELF set-key token.
//   page `Cardtype+*type+*default`, content `<p>{{+description}}</p>`
//     -> base `Cardtype`
//     -> compose `Cardtype+description`
//     -> that junction EXISTS too.
// The same `Role` template's `{{+description}}` composes
// `Role+description+*type plus right`, which has NO row — so the rendered
// nest is an unknown card, which is why the warm pass must seat a junction
// only when one actually exists.
import { afterEach, describe, expect, it } from "vitest";
import { DeckoName } from "../../../src/card/name.js";
import { setNameEnvironment } from "../../../src/card/name/environment.js";
import {
  isTemplatedNestsName,
  templateLinkSetNameFromParts,
} from "../../../src/card/render/views.js";
import { templateLinkSetNameForRelativeName } from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import type { ViewContext } from "../../../src/card/render/format.js";

const NAMES: Record<string, string> = {
  type_plus_right: "*type plus right",
  right: "*right",
  self: "*self",
  description: "description",
};

afterEach(() => setNameEnvironment(undefined));

/** A view context carrying exactly what the mod wrapper's gate reads
 *  (card-mod-edit.ts#onTypeSet): the parent format's card NAME, and a
 *  `fetchRenderCard` that answers the trunk's TAG card with the codename a
 *  real deck carries there. `codenameByName` is the deck's tag lookup —
 *  a name absent from it is Ruby's `Card[...]` returning nil.
 *
 *  Nothing else in the wrapper's path is stubbed: the composition itself is
 *  the real shared function, which is the point of the drift pin. */
function stubCtx(
  parentName: string | undefined,
  codenameByName: Record<string, string>,
): ViewContext {
  return {
    fmt: {
      parent: parentName === undefined ? undefined : { card: { name: DeckoName.parse(parentName) } },
      engine: {
        fetchRenderCard: (name: string) => {
          const codename = codenameByName[name];
          return codename === undefined ? undefined : { record: { codename } };
        },
      },
    },
  } as unknown as ViewContext;
}

function installEnv(): void {
  setNameEnvironment({
    codename: {
      id: (codename) => 1,
      name: (codename) => NAMES[codename],
      nameForId: () => undefined,
    },
    lexicon: { name: () => undefined, id: () => undefined },
  });
}

describe("D9 template-link junction composition (the view/warm shared function)", () => {
  it("composes the page-105 witness: base Role + *members + *type plus right", () => {
    installEnv();
    // template_nest.rb:23-25 `name = name.fully_stripped; [type, name].to_name`
    const base = DeckoName.parse("Role+*type+*default").trunkName.leftName;
    expect(base?.s).toBe("Role");
    const nest = DeckoName.parse("+*members");
    expect(nest.fieldOnly).toBe(true);
    expect(templateLinkSetNameFromParts(base, nest).s).toBe("Role+*members+*type plus right");
    // the key the render map is read by, and the id-lookup form the
    // Lexicon path resolves through (lexicon.rb:112-128)
    expect(templateLinkSetNameFromParts(base, nest).key).toBe("role+*member+*type_plu_right");
  });

  it("composes the page-88 witness: base Cardtype + description + *type plus right", () => {
    installEnv();
    const base = DeckoName.parse("Cardtype+*type+*default").trunkName.leftName;
    expect(base?.s).toBe("Cardtype");
    expect(templateLinkSetNameFromParts(base, DeckoName.parse("+description")).s).toBe(
      "Cardtype+description+*type plus right",
    );
    expect(templateLinkSetNameFromParts(base, DeckoName.parse("+description")).key).toBe(
      "cardtype+description+*type_plu_right",
    );
  });

  it("takes the non-type-set arm (template_nest.rb:29) when on_type_set is nil", () => {
    installEnv();
    expect(templateLinkSetNameFromParts(undefined, DeckoName.parse("+description")).s).toBe(
      "description+*right",
    );
    // the two arms are genuinely different names: an on_type_set miss must
    // not silently fall through to the `*right` form, or the warm pass would
    // seat a card the view never renders.
    expect(templateLinkSetNameFromParts(DeckoName.parse("Role"), DeckoName.parse("+description")).s).toBe(
      "Role+description+*type plus right",
    );
  });

  it("agrees with the mod view's own path: the shared function IS that path", () => {
    installEnv();
    // card-mod-edit.ts#templateLinkSetNameForRelativeName delegates to
    // templateLinkSetNameFromParts; this pins the shape it delegates with
    // for every relative name shape the corpus carries, so a future edit to
    // the mod wrapper that stops delegating (or delegates with a different
    // base) breaks here rather than at render time.
    //
    // BOTH sides are called: the wrapper, over a context whose parent is the
    // template set whose trunk's TAG is the `type` codename card (so the
    // wrapper's own on_type_set gate answers a real base), and the shared
    // function, over the base that gate resolves. Calling only the shared
    // function would leave the drift this title advertises invisible: a
    // wrapper that stopped delegating, or delegated with another base, would
    // still pass.
    for (const [baseName, nest] of [
      ["Role", "+*members"],
      ["Cardtype", "+description"],
      ["Contributors", "+Discussion"],
      ["Item", "+*type cards"],
    ] as const) {
      const base = DeckoName.parse(baseName);
      const name = DeckoName.parse(nest);
      // the wrapper, with the gate ANSWERING: `${baseName}+*type`'s tag is
      // `*type`, and the deck carries the `type` codename card there.
      const throughWrapper = templateLinkSetNameForRelativeName(
        stubCtx(`${baseName}+*type+*default`, { "*type": "type" }),
        name,
      );
      // the shared function, over the base the gate resolves to.
      const direct = templateLinkSetNameFromParts(base, name);
      expect(throughWrapper.s).toBe(direct.s);
      expect(throughWrapper.key).toBe(direct.key);
      expect(throughWrapper.s.endsWith("+*type plus right")).toBe(true);
      expect(throughWrapper.s.startsWith(`${baseName}+${nest.slice(1)}`)).toBe(true);
    }
  });

  it("agrees through the on_type_set gate MISS too, not only its hit", () => {
    installEnv();
    // The gate (card-mod-edit.ts#onTypeSet, template_nest.rb:33-41) has three
    // ways to answer nil besides a hit, and each one flips the composition to
    // the `*right` arm. If the wrapper and the shared function disagreed on
    // ANY of them, the warm pass would seat a junction the view never asks
    // for. Each row below pairs the wrapper's answer with the shared
    // function's answer for the SAME (base-or-undefined, nest) pair.
    const name = DeckoName.parse("+description");
    const misses = [
      // no parent format at all — the bare nest has no rule set to ask
      ["no parent", stubCtx(undefined, {})],
      // the trunk's tag card is missing from the deck (Ruby's Card[...] nil)
      ["tag card absent", stubCtx("Role+*missing+*default", {})],
      // the trunk's tag card exists but is not the `type` codename card
      ["tag card is not `type`", stubCtx("Role+description+*default", { description: "field" })],
    ] as const;
    for (const [label, ctx] of misses) {
      const throughWrapper = templateLinkSetNameForRelativeName(ctx, name);
      const direct = templateLinkSetNameFromParts(undefined, name);
      expect(throughWrapper.s, label).toBe(direct.s);
      expect(throughWrapper.s, label).toBe("description+*right");
    }
  });

  it("gates the warm sweep on the templated-nests right tag (isTemplatedNestsName)", () => {
    // card-mod-content set/right/{default,structure}.rb include_set
    // Abstract::TemplatedNests; the :template nest mode (and therefore the
    // :template_nest composition) is entered only for those right tags. The
    // engine's junction warm sweeps the whole prepared closure, so this gate
    // is what keeps the sweep off every non-templated card in the deck.
    expect(isTemplatedNestsName(DeckoName.parse("Role+*type+*default"))).toBe(true);
    expect(isTemplatedNestsName(DeckoName.parse("Role+*type+*structure"))).toBe(true);
    expect(isTemplatedNestsName(DeckoName.parse("Contributor+Dashboard"))).toBe(false);
    expect(isTemplatedNestsName(DeckoName.parse("Role+*members+*type plus right"))).toBe(false);
    expect(isTemplatedNestsName(DeckoName.parse("Role"))).toBe(false);
  });
});
