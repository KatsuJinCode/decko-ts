// Route-gaps lane pin (2026-10-05): the /new/:type arm of the bunny edge
// engine request core (deploy/bunny-worker-src/bunny-edge-engine-request.ts +
// the lineage parsePath's /new/:type grammar).
//
// THE MEASURED GAP (manifest-completion lane,
// tmp/wrong-goal-hunt/manifest-completion-lane.md section 2.1): /new/Sign_up
// — the signup-form route the deck's OWN chrome links twice on every page
// (the *account_links navbar arm and the signin form's "...or sign up!"
// link, both href="/new/Sign_up" in the live-wire capture
// tmp/wrong-goal-hunt/live-signin-ref.html) — answered 404 on the wire
// (capture-log-demo-nav.jsonl seq 97, gc "miss; store=skip-404"): parsePath
// mapped it onto the generic name+view arm, the card "new" does not exist,
// and the render answered the full-chrome not_found page.
//
// THE RUBY REFERENCE (decko 0.20.0, the corpus generator — read from the
// installed gem this lane):
//   - config/engine_routes.rb:22  `get "new/:type" => "card#read", view: "new"`
//     fires BEFORE the generic :mark/:view route (:51) — Rails route
//     precedence, so /new/<anything> never renders the card "new";
//   - lib/card/fetch/card_class.rb:104-133 — the route carries NO mark:
//     uri_fetch_opts sets opts[:type] from params[:type] and implicit_mark
//     resolves to "" (the unknown:true view needs no name), so the rendered
//     card is a NEW (rowless) card of the requested type;
//   - card-mod-format set/all/html/error.rb:81-87 page_view_for_unknown /
//     page_status_for_unknown — an unknown MAIN card renders view :new at
//     status 200 when the viewer may create it;
//   - the deck's rule (trial-deck mirror, rule card 6580)
//     `Sign up+*type+*create` = "Anyone" — the anonymous visitor MAY create
//     Sign up cards, so /new/Sign_up is a 200 page for the deployed edge's
//     anonymous-only viewer;
//   - a type whose create rule admits only signed-in members (the *all
//     fallback, mirror rule 6566) denies anonymous: error.rb:103-104
//     PermissionDenied -> status 403, the loud_denial frame ("Sorry!" +
//     "Please sign in or sign up to create this.").
//
// The same lane's verdicts, pinned so they cannot silently "improve" into
// divergence: /account/signup and /recent_changes are NOT route arms on the
// reference app — the router maps them to the cards "account" / "recent
// changes" (underscore folded to space), neither exists in the deck, and the
// anonymous viewer cannot create them — so the reference answers the
// not_found page at 404, which is exactly what the edge already serves (the
// measured 13,660/13,694 B chrome). The corpus has no capture of any
// /new/:type page, so the form's bytes are a RECONSTRUCTION from the Ruby
// source (new.rb, signup/views.rb, form_elements.rb) with the oracle-pinned
// field shapes the sign-in form capture carries
// (src/card/render/signin-core-form-view.ts); the assertions below pin the
// structural contract (frame title, form action, field names, hidden type,
// buttons), not byte-exact fidelity — see the lane receipt for the labeled
// reconstructions.

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

const SET_TYPE_ID = 2;
const CARDTYPE_TYPE_ID = 5;

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

function realDeck(storage: RenderTestStorage) {
  return { fetcher: storage.fetcher, render: storage.engine };
}

/** The minimal deck the arm renders against: the permission universe the
 *  create-verdict walk reads (parties + set-pattern cards + the two create
 *  rules), the Sign up cardtype, and the error-page chrome rows (the 403 and
 *  404 arms build the full chrome; same rows as
 *  bunny-edge-error-page.test.ts's seedShellHeadDeck). */
async function seedNewRouteDeck(s: RenderTestStorage): Promise<void> {
  // Parties + set machinery (the read-gate pin's shape).
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 3, name: "*create", codename: "create" });
  await seedCard(s, { id: 4, name: "Basic", typeId: CARDTYPE_TYPE_ID });
  await seedCard(s, { id: 5, name: "Anyone", codename: "anyone", typeId: 7 });
  await seedCard(s, { id: 6, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 7 });
  await seedCard(s, { id: 7, name: "Role", codename: "role", typeId: CARDTYPE_TYPE_ID });
  await seedCard(s, { id: 8, name: "Anonymous", codename: "anonymous", typeId: 7 });
  await seedCard(s, { id: 15, name: "*type", codename: "type" });
  // The type the signup journey creates: "Sign up" is a Cardtype-typed card
  // (mirror card 12) — the /new/:type mark resolves to it.
  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: CARDTYPE_TYPE_ID });
  await seedCard(s, {
    id: 12, name: "Sign up", codename: "signup", typeId: CARDTYPE_TYPE_ID,
  });
  // *all+*create -> [[Anyone Signed In]] (mirror rule 6566): the fallback
  // denies anonymous for every type without a more specific rule.
  await seedCard(s, { id: 20, leftId: 1, rightId: 3, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 20, 6, "anyone_signed_in");
  // Sign up+*type+*create -> [[Anyone]] (mirror rule 6580): self-signup is
  // open to the anonymous visitor.
  await seedCard(s, { id: 21, leftId: 12, rightId: 15, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 22, leftId: 21, rightId: 3, dbContent: "[[Anyone]]" });
  await seedReference(s, 22, 5, "anyone");
  // The chrome rows (error-page pin's shell).
  await seedCard(s, { id: 55, name: "*title", codename: "title", typeId: 52, dbContent: "Test Site" });
  await seedCard(s, { id: 103, name: "*favicon", codename: "favicon", typeId: 19, dbContent: "(my_bucket)/103/3649.jpg" });
  await seedCard(s, { id: 50, name: "Html", codename: "html", typeId: 5 });
  await seedCard(s, { id: 600, name: "*layout", codename: "layout", typeId: 52 });
  await seedCard(s, { id: 22746, name: "*all+*layout", leftId: 1, rightId: 600, typeId: 52, dbContent: "Default Layout" });
  await seedCard(s, {
    id: 22747, name: "Default Layout", typeId: 50,
    dbContent: `<body class="d-flex flex-column h-100">\n  <header>{{:header|core}}</header>\n  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n</body>`,
  });
  await seedCard(s, { id: 22748, name: "*header", codename: "header", typeId: 50, dbContent: `<nav class="navbar navbar-expand-lg"><a class="navbar-brand" href="/">Site</a></nav>` });
  await seedCard(s, { id: 22749, name: "*footer", codename: "footer", typeId: 50, dbContent: `<footer class="footer mt-auto py-3"><a href="/:latest">Decko v</a></footer>` });
}

describe("bunny edge — the /new/:type arm (route-gaps lane)", () => {
  it("GET /new/Sign_up renders the signup create form at 200 (the 404-then-200 transition)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedNewRouteDeck(storage);
      const res = await handleEngineRequest(edgeGet("/new/Sign_up"), realDeck(storage));
      const body = await res.text();
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      // The full-chrome document (the same wrapWithLayout shell the error
      // pages build), titled from the deck's *title.
      expect(body.startsWith(`      <!DOCTYPE HTML>\n      <html class="h-100">\n        <head>\n`)).toBe(true);
      expect(body).toContain(`<title>Sign up - Test Site</title>`);
      // The frame header carries the new view's voo.title
      // (set/type/signup/views.rb:6-10: t(:account_sign_up) = "Sign up").
      expect(body).toContain(`<span class="card-title" title="Sign up">Sign up</span>`);
      // The create form (card_form :create -> new_card, action /card/create,
      // no _method spoof) with the main-success attr (new.rb:76-78).
      expect(body).toContain(`<form class="card-form slotter" id="new_card"`);
      expect(body).toContain(`data-main-success="{&quot;redirect&quot;:true}"`);
      expect(body).toContain(`action="/card/create"`);
      expect(body).toContain(`method="post"`);
      // The name prompt (name blank, no autoname rule -> new_name_formgroup
      // + the hidden name_prompt flag).
      expect(body).toContain(`name="card[name]"`);
      expect(body).toContain(`name="name_prompt"`);
      // The type is PRESET by the route (new_type_preset? -> params[:type]):
      // hidden type_id, no type select.
      expect(body).toContain(`name="card[type_id]"`);
      // The account formgroups: the oracle-pinned email/password editor
      // shapes (the same editors the sign-in form capture pins), keyed to
      // the unnamed new card's subcards.
      expect(body).toContain(`name="card[subcards][+*email][content]"`);
      expect(body).toContain(`name="card[subcards][+*password][content]"`);
      expect(body).toContain(`_pw-input`);
      // The buttons (standard_create_button + standard_cancel_button).
      expect(body).toContain(`create-submit-button`);
      expect(body).toContain(`>Submit</button>`);
      expect(body).toContain(`>Cancel</a>`);
      // NOT a not_found page: no "Could not find", no sign-up invitation.
      expect(body).not.toContain(`Could not find`);
      expect(body).not.toContain(`not_found-view`);
    } finally {
      storage.close();
    }
  });

  it("GET /new/Basic denies the anonymous viewer at 403 (PermissionDenied; loud denial)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedNewRouteDeck(storage);
      const res = await handleEngineRequest(edgeGet("/new/Basic"), realDeck(storage));
      const body = await res.text();
      // error.rb:103-104 PermissionDenied -> status_code 403; the loud
      // denial frame (error.rb:191-197) with the sign-in-or-sign-up line
      // for a signed-out viewer (error.rb:211-213, format_denied_task:
      // "to create this").
      expect(res.status).toBe(403);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(body).toContain(`<h1>Sorry!</h1>`);
      expect(body).toContain(`href="/*signin/titled">sign in</a>`);
      expect(body).toContain(`href="/new/Sign_up">sign up</a>`);
      expect(body).toContain(`to create this.`);
    } finally {
      storage.close();
    }
  });

  it("GET /new/NoSuchType answers the not_found chrome at 404", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedNewRouteDeck(storage);
      const res = await handleEngineRequest(edgeGet("/new/NoSuchType"), realDeck(storage));
      const body = await res.text();
      expect(res.status).toBe(404);
      // The type mark never resolves to a card: the not_found page (the
      // route arm's labeled deviation — Ruby's exact unknown-type error
      // shape has no capture; the 404 class is the reference answer class).
      expect(body).toContain(`Could not find`);
      expect(body).toContain(`NoSuchType`);
    } finally {
      storage.close();
    }
  });
});

describe("route-gaps verdicts — the two measured 404s are the Ruby-faithful answers", () => {
  // /account/signup and /recent_changes are NOT /new/:type arms: the
  // reference router maps them onto the cards "account" / "recent changes"
  // (decko folds URL underscores to spaces), neither card exists in the
  // deck, and the anonymous viewer cannot create them — so the reference
  // app (the corpus generator, decko 0.20.0 over this deck) answers
  // not_found at 404, with the sign-in-or-sign-up line. The edge already
  // serves exactly this (the measured 13,660/13,694 B chrome); these pins
  // hold the lane's verdict so a future route "fix" cannot silently diverge
  // from the reference.
  it("GET /account/signup -> 404 not_found chrome for the card 'account'", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedNewRouteDeck(storage);
      const res = await handleEngineRequest(edgeGet("/account/signup"), realDeck(storage));
      const body = await res.text();
      expect(res.status).toBe(404);
      expect(body).toContain(`Could not find`);
      expect(body).toContain(`account`);
      expect(body).toContain(`href="/*signin/titled">sign in</a>`);
      expect(body).toContain(`href="/new/Sign_up">sign up</a>`);
      expect(body).toContain(`to create it.`);
    } finally {
      storage.close();
    }
  });

  it("GET /recent_changes -> 404 not_found chrome for the card 'recent changes'", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedNewRouteDeck(storage);
      const res = await handleEngineRequest(edgeGet("/recent_changes"), realDeck(storage));
      const body = await res.text();
      expect(res.status).toBe(404);
      // The URL display form folds the underscore to a space
      // (urlDisplayNameForSlug) — Ruby's Name[mark].tr("_", " ").
      expect(body).toContain(`Could not find`);
      expect(body).toContain(`recent changes`);
      expect(body).toContain(`href="/new/Sign_up">sign up</a>`);
      expect(body).toContain(`to create it.`);
    } finally {
      storage.close();
    }
  });
});
