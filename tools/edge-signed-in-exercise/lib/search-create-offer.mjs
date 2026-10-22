// The create offer the navbox search box makes for a name that does not exist,
// graded the way Ruby's own views make it.
//
//   card-mod-search-0.20.0 set/self/search.rb:70-72
//     view :search_box_complete, cache: :never, perms: :none do
//       search_box_items :search_item, :add_item, :goto_items
//     end
//   :82-88  search_box_items: each item is data.merge(action:, value:, label:)
//   :96-98  search_item  -> action :search, value = the term, url = the
//                           results path
//   :100-106 add_item   -> action :add, ONLY when exact.add_autocomplete_ok?
//                           (set/all/autocomplete.rb:1-3: new_card? &&
//                           name.valid? && !virtual? && ok?(:create)); value =
//                           the term; url = the new card's own path
//   :108-126 goto_items -> one item per completed name; the exact name only
//                           when it is KNOWN (:124-126 go_to_exact_match?
//                           exact.known?) - a name that does not exist is
//                           never a goto item
//   set/all/path.rb:35-44 path -> Card::Path#render -> standard (no action
//     means no "new/" prefix): base = mark = the name's url_key, and the
//     json format's contextualize_path is card_url, so the url is ABSOLUTE
//   cardname-0.20.0 lib/cardname/variants.rb:8-13 url_key: the decoded name
//     with every run of non-key characters folded to "_"
//
// The label is the item's own HTML (set/all/autocomplete.rb:35-37
// autocomplete_item; the verbatim template set/all/autocomplete/
// autocomplete_item.haml), and the committed Ruby capture of that view is
// reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl
// (probe-view:500:add_autocomplete_item@set/all/autocomplete.rb).
//
// Registry row cap-C6 (tools/edge-signed-in-exercise/capabilities.json, id C6)
// recorded "Whole-page create/new regex can match unrelated navbar; no
// result-specific link." The harness graded /create|new card|\/new\//i over the
// whole search page, so the navbar's own links satisfied it and no offer was
// ever read. This module reads the offer itself: the item, its action, its
// value, its destination and its label - and the destination it names must
// open the create form (card-mod-format-0.20.0 set/all/html/error.rb:81-87:
// an unknown card renders :new with status 200 when the viewer may create it).
//
// The form's NAME is Ruby's own decode of the mark the path spells
// (card-1.110.0 lib/card/fetch/card_class.rb:128-133 uri_fetch_opts:
// `opts[:name] ||= Name[params[:mark]]&.tr "_", " "`) - see rubyNameFromMark
// below. The fold is in the NAME, never in the lookup: the underscored and
// the space-spelled address are the same cardname key.

/** Ruby's url_key (cardname-0.20.0 lib/cardname/variants.rb:8-13): the
 *  decoded name, every run of characters outside the key set folded to a
 *  single "_". */
export function urlKey(name) {
  const decoded = String(name ?? "");
  const stripped = decoded.replace(/[^a-zA-Z0-9_*+]+/g, " ").trim();
  return stripped.replace(/[\s_]+/g, "_");
}

/** THE NAME AN ABSENT CARD'S CREATE FORM CARRIES, in Ruby's own spelling.
 *
 *  The create offer's destination is the card's own path, and the path is the
 *  card's url_key (cardname-0.20.0 lib/cardname/variants.rb:8-13). The name
 *  the ABSENT-card render displays is not the path segment: it is what
 *  Ruby's own fetch decodes the mark into.
 *
 *  card-1.110.0 lib/card/fetch/card_class.rb:128-133 uri_fetch_opts:
 *
 *      def uri_fetch_opts params
 *        Env.hash(params[:card]).tap do |opts|
 *          opts[:type] ||= params[:type] if params[:type]
 *          opts[:name] ||= Name[params[:mark]]&.tr "_", " "
 *        end
 *      end
 *
 *  `Name[mark]` is a Cardname (lib/cardname.rb initialize: `strip!`), and
 *  `tr "_", " "` replaces every underscore with a space. So the name field of
 *  the create form for the address /zz_no_such_card_harness_mvj8s7ka carries
 *  "zz no such card harness mvj8s7ka" - the SPACED spelling, which is the
 *  same name the space-spelled address would have carried. The fold is in the
 *  NAME, not in the lookup: the key of the two spellings is the same cardname
 *  key (lib/cardname.rb simple_key: `decoded.underscore.gsub(...)`).
 */
export function rubyNameFromMark(mark) {
  const decoded = decodeURIComponent(String(mark ?? ""));
  return decoded.trim().replace(/_/g, " ");
}

/** The absolute url a card path renders in the json format: card_url. */
function cardUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return url.startsWith("/") ? url : `/${url}`;
}

/** The label's own bytes, read as the item's HTML. */
function labelParts(label) {
  const html = String(label ?? "");
  const classMatch = /class='([^']*)'/.exec(html);
  const icon = /<div class='autocomplete-icon'>([\s\S]*?)<\/div>/.exec(html);
  const text = /<div class='autocomplete-label'>([\s\S]*?)<\/div>/.exec(html);
  return {
    html,
    classes: classMatch === null ? [] : classMatch[1].split(/\s+/).filter(Boolean),
    icon: icon === null ? null : icon[1].replace(/\s+/g, " ").trim(),
    text: text === null ? null : text[1].replace(/\s+/g, " ").trim(),
  };
}

/**
 * The offer the typeahead makes for `term`, read off the JSON body Ruby
 * renders. Returns the legs it found, and the failures by name.
 */
export function createOfferFor(items, term) {
  const list = Array.isArray(items) ? items : [];
  const add = list.find((item) => item?.action === "add") ?? null;
  const search = list.find((item) => item?.action === "search") ?? null;
  const gotoSameName = list.find(
    (item) => item?.action === "goto" && (item?.value === term || item?.value === urlKey(term)),
  ) ?? null;
  const failures = [];
  if (add === null) failures.push("noAddItem");
  if (add !== null) {
    if (add.value !== term) failures.push("addValue");
    // The destination is the card's own path - Ruby renders the standard path
    // (no "new/" prefix) because add_autocomplete_item_path passes no action.
    const expected = cardUrl(`/${urlKey(term)}`);
    if (typeof add.url !== "string" || !add.url.endsWith(expected)) failures.push("addUrl");
    const label = labelParts(add.label);
    if (!label.classes.includes("autocomplete-item-add")) failures.push("addLabelClass");
    if (!label.classes.includes("autocomplete-item")) failures.push("addLabelBaseClass");
    if (label.text !== term) failures.push("addLabelText");
    if (label.icon === null) failures.push("addLabelIcon");
  }
  // The search item is always there (search.rb:96-98): the typeahead's
  // "search for this" entry, distinct from the create offer.
  if (search === null) failures.push("noSearchItem");
  // A name that does not exist is never a goto item (search.rb:108-126).
  if (gotoSameName !== null) failures.push("gotoItemForMissingName");
  return {
    ok: failures.length === 0,
    failures,
    add,
    search,
    gotoSameName,
    label: add === null ? null : labelParts(add.label),
  };
}

/**
 * The destination leg: the offer's url must open the CREATE FORM for that
 * name, not a 404 and not some other page. `destination` is
 * {status, formOffered, nameFieldValue, createFormAction} as read off the
 * page (card-mod-edit-0.20.0 set/all/new.rb:4-6 `view :new -> framed_create_form`
 * renders the form with the card's name field).
 *
 * The name the form carries is the NAME Ruby derives from the mark the
 * destination's path spells (rubyNameFromMark above), not the path segment
 * itself: the address /A_B is the address of the card named "A B", and the
 * create form for it says "A B".
 */
export function createOfferDestination(destination, term) {
  const failures = [];
  const status = destination?.status ?? null;
  if (status !== 200) failures.push("destinationStatus");
  if (destination?.formOffered !== true) failures.push("destinationHasNoForm");
  const value = destination?.nameFieldValue ?? null;
  const expected = rubyNameFromMark(urlKey(term)).trim();
  if (typeof value !== "string" || value.trim() !== expected) {
    failures.push("destinationNameField");
  }
  return { ok: failures.length === 0, failures, expectedName: expected };
}

/** The check's own predicate: the offer exists and the destination creates. */
export function offersCreateLink(items, term, destination) {
  const offer = createOfferFor(items, term);
  const dest = createOfferDestination(destination, term);
  return {
    ok: offer.ok && dest.ok,
    offerFailures: offer.failures,
    destinationFailures: dest.failures,
    add: offer.add,
    label: offer.label,
  };
}
