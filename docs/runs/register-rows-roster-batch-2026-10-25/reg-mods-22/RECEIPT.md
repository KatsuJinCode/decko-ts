# reg-mods-22

- The pinned Ruby gem: `card-mod-list-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`).
- The row's own label: `card-mod-list (PARTIAL)`.
- The port file: `src/card/mod-loader/mods/card-mod-list.ts`.
- The declaration census at this tree: 18 gem set files, 14 gem view names
  and 5 gem event names. Every set file and every event name is registered
  port-side; the 3 view names the census leaves open (`:core`, `:content`,
  `:titled`) are the engine's own view-table names, and each is named with
  its reason.

## Verdict: WORKING ON IT

The two validate events have no port body. Ruby's `validate_item_type`
(`set/abstract/01_list/events.rb:13-23`) reads the card type's
`ok_item_types` and adds a `:content` error for an item whose type is
outside it, and Ruby's `validate_item_uniqueness` (`:29-33`) adds a
`:content` error for a duplicate item name. The port's write path has no
`errors.add` seam and no `ok_item_types` / `item_cards` /
`duplicate_item_names` surface, so both bodies are documented stubs
(`src/card/mod-loader/mods/card-mod-list.ts:1276-1309`) and a wrong item
type is saved where Ruby refuses it.

IMPLEMENTED IN THIS LANE (2026-10-25, `port/regfix-2-20261025`, register
fixes 2). Landed: the errors.add seam
(`src/card/mod-loader/mod-validation-errors.ts`) - a validate-stage body
adds every message the way Ruby's errors array does and the throw refuses
the save, the alert carrying Ruby's standard_errors lines and the JSON
errors hash the last message per attribute. Both bodies are implemented
(`card-mod-list.ts`): validate_item_type reads ok_item_types off the same
three type_plus_right sets the state source resolves (style.rb:5-7,
script.rb:3-5, stylesheets.rb:3-5), walks item_cards through the deck
read (a missing item answers Ruby's fetch-miss card, default-typed Basic:
the deck carries no *content_options rules, so Abstract::Items' options
walk bottoms at nil and new_unknown_item_args adds no type), and adds one
:content error per out-of-set item with the gem's en.yml string verbatim;
validate_item_uniqueness answers the duplicates sentence, the dead arm
Ruby's own comment describes (unique_items? is false with no override in
the tree). The membership arm (`abstractListEventsSetMember`,
`mod-event-set-membership.ts`) resolves the abstract set path for the
thirteen concrete Abstract::List includer sets the generated include
graph names, gated to the validate pair only (the prepare_to_validate
pair is the route's own: Ruby's own recorded order runs check_permissions
BEFORE add_and_drop_items, and firing the dispatcher's stubs would record
them a stage earlier). The end-to-end behavior is pinned through a real
save (`register-row-22-card-mod-list-validate-events.test.ts`): a
`<set>+*style` pointer save with an out-of-set item is refused at
validate with the verbatim message and stores nothing.

THE REMAINING MECHANISM: the arm is not wired into the serving walk
(`write-routes.ts setMember`), and wiring it today would refuse
site-script edits on this port's deck state where the recorded Ruby run
answered 303. MEASURED: the recorded oracle's own event list fires
validate_item_type on that save (the write-battery-v1 ruby trace,
admin-edit-site-script) and passes, because Ruby's boot creates the
fifteen `mod: <name>+*script` input cards the rule's content names (the
oracle's get-home carries the boot-refresh saves on them, 1187 events;
the port's get-home carries none, and the port's final deck holds no such
rows - the port models the inputs as asset-input virtuals of ids with no
cards row). On the port's state the items are missing, Ruby's own
fetch-miss semantics answer Basic, and the validator refuses - correct
semantics on a divergent state. The dependency is the boot asset-input
cascade; the arm wires into the serving walk when it lands.

RESIDUAL NAMED, NOT CLOSED HERE: the when-gate's state source
(mod-event-state-sources.ts hasOkItemTypes) resolves its bootswatch arm
by the RIGHT card's codename ("right codename bootswatch_skin"), while
Ruby's third override module is TypePlusRight::BootswatchSkin::Stylesheets
- a `<skin-typed>+*stylesheets` card. For those cards Ruby answers
validate_item_type? true and (the chain carrying Abstract::List through
the pointer type) runs the validator; the port's source answers false and
the event stays silent. Closing it means re-shaping the arm on the
left-type + right-codename pair and measuring the skin saves it would
start refusing - a change with its own blast radius, filed here so the
gap keeps a name.
