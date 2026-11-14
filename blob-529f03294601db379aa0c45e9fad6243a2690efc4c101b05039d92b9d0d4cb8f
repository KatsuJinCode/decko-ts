# reg-redteam-A12 — the nine "grep-absence" Ruby surfaces, audited one at a time

Row: `reg-redteam-A12` in `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`
(verdict UNPORTED or N/A, bucket WORKING ON IT). Its blocker: "Audit the nine still
grep-absence UNPORTED surfaces one at a time, starting with Set::RequiredField, recording port
counterpart or confirmed absence for each in the completeness register the same way the
reconciliation closed the AdvancedApi half."

The register's own A-R12 row admits these are grep verdicts, not audits. This is the audit.
Method per surface: locate the Ruby file in the pinned gemset
(`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`), read it, then grep the whole
gemset for CALLERS (a definition is not a surface), then look for the port counterpart in
`src/` at canonical tree `decko-ts-release-lead` @ `d8050251`.

**Result: two are ported under other names, one is a live mechanism the port deliberately does
not have, one is inert Ruby (`I18nScanner` is entirely commented out), one is an uncalled
library API, two are Rails-side plumbing, and one is dev tooling. Nothing here is a live
behavioral gap.**

| # | Surface | Live callers in the pinned gemset | Port counterpart | Disposition |
|---|---|---|---|---|
| 1 | `Set::RequiredField` (`lib/card/set/required_field.rb`) | **YES, two**: `card-mod-account-0.20.0/set/right/account.rb:8` `require_field :email` and `set/type/signup.rb:5` `require_field :account` | **Yes.** `require_field :email` is enforced in `card-action-engine.ts:5730` (error kind `field-required`, `types.ts:54`) and `require_field :account` in `applyAccountFieldEvents` (`:1475-1493`, "sign up without an account" / `ACCOUNT: required\n+*ACCOUNT: email required`). Both carry citations to the Ruby lines. | **PORTED** — the row's "no port counterpart found" was a grep for the CLASS name; the behavior was ported as direct validation. |
| 2 | `Set::AdvancedApi` (`lib/card/set/advanced_api.rb`) | **YES** (`lib/card/set.rb:127` includes it) | Partly. `setting_opts` → `SettingRegistry.register` (`mod-registrar.ts:263-276`, graded PORTED option-for-option in the register's C2 row). `assign_type` → **deliberately absent**: the render layer documents it (`views.ts:951-953`, "The port has no assign_type surface (the row's typeId drives typeCode)"). `ensure_set` / `define_set_from_error` → Ruby constant resolution (`view :x, set: SomeSet` auto-defining the set module); the port's manifest resolves set references statically. | **PARTIAL by design**, with the one absent piece already named in the port's own comments. `assign_type` is the only live member with no surface, and Ruby's own semantics for it are carried by the row's type id. |
| 3 | `Set::Inheritance` (`lib/card/set/inheritance.rb`) — `include_set Mod, only:/except:` | **NO.** `grep -rn "include_set"` over the gems returns only `include_set_modules` (a different, per-card method: `director/all.rb:16`, `fetch/all.rb:28`, `format.rb:53`). The `include_set` DSL has zero callers in the pinned gemset. | n/a | **INERT in this gemset** — a library API for third-party mods. The port's mod composition is static by construction, so nothing calls it. |
| 4 | `Set::I18nScanner` (`lib/card/set/i18n_scanner.rb`) | **NO — the whole file is commented out.** Lines 1-23 are a comment block (`# class Card ... # ::I18n::Tasks.add_scanner ...`). There is no class. | n/a | **INERT (definitive)** — not merely uncalled, not even defined. |
| 5 | `Set::I18nScope` (`lib/card/set/i18n_scope.rb`) | **YES** (`lib/card/set.rb:130` `extend I18nScope`) | Mechanism only: it infers an I18n scope by parsing a Ruby BACKTRACE for a `/set/` path segment (`find_set_path`, `:84-89`) and stripping the version suffix off the mod dir (`:37-39`). | **NAMED DIVERGENCE (mechanism).** A TS engine has no Ruby backtrace and no `.rb` set path; the messages the scope selects are emitted verbatim English and pinned by the account/auth suites (`tests/card/auth/`). Nothing card-visible differs. |
| 6 | `View::Classy` (`lib/card/view/classy.rb`) | **YES** — `card-mod-history-0.20.0/lib/card/action/action_renderer.rb:30` `@format.classy("action-list")` | **Yes, under another name:** the port's view-options object `voo.classy(...)` (e.g. `views.ts:4875` `voo.classy("bar-right")`), which is the same class-string builder. | **PORTED** (renamed). |
| 7 | `View::Cache::CacheAction` (`lib/card/view/cache/cache_action.rb`, `lib/card/view/cache.rb`) | The `cache:` option is used by ~120 port-side registrations (`cache: "never"`) and by the gems' own view declarations. | The option is DECLARED port-side (`mod-manifest.ts:85` `cache?: string`) and carried, but there is no view-level render cache to disable: no `viewCache` / `cacheKey` anywhere in `src/card/render/`. | **NAMED DIVERGENCE (inert knob).** `cache: :never` excludes a view from Ruby's per-request view cache; with no cache, every view renders fresh — which is what `never` asks for. The register's DSL section already noted this as "parsed-but-dropped at A10". |
| 8 | `Card::Model::SaveHelper` (`lib/card/model/save_helper.rb` + `save_helper/save_helper_helper.rb`) — `Card.create_card`, `Card.update_card!` | **NO.** `grep -rn "Card\.create_card\|Card\.update_card"` over `card-1.110.0/lib`, `decko-0.20.0/lib` and every `card-mod-*/lib` returns zero hits; only the aliases in the file itself (`:54-57`). | The port's equivalent API exists under the engine's own names: `CardActionEngine#createCard` / `#updateCard` (`types.ts` `CreateCardInput` / `UpdateCardInput`). | **INERT library API** (no caller in the gemset); the capability is ported under different method names. |
| 9 | `Cardio::Utils` (`lib/cardio/utils.rb`) — `empty_trash`, `delete_tmp_files!` | **Split.** `delete_tmp_files!` IS called: `card-1.110.0/lib/card/cache/class_methods.rb:84`. `empty_trash` has **no** caller in the gemset (it is a maintenance/rake entry point). | The port's cache layers (`src/card/fetch/cache.ts`) reset in memory; the tmp-file area is the attachment store's business and the port's draft release deletes the specific cached file (`card-action-engine.ts` `cachedUploadAttachment().release`). There is no bulk "delete every tmp file" because the store is host-supplied, so the port cannot enumerate it — and Ruby only calls it while clearing the cache. | **NAMED DIVERGENCE** for the tmp sweep (a filesystem operation over a Rails `files/tmp` directory that a host-supplied blob store does not expose); `empty_trash` is **dev tooling** (a rake task). |

Also carried from the register's row: **`Card::Content::Clean`** is near-dead in Ruby — its
only consumer in the gemset is the autoload trigger `content.rb:10` — while the port ships a
full `src/card/actions/content-clean.ts`. Porting a near-dead surface is harmless; it is
recorded here so the asymmetry is not read as an omission.

## Why nothing was ported

Six of the nine have no live caller in the pinned gemset (or no definition at all), so a port
would be unreachable code. Two (`RequiredField`, `Classy`) are already ported and were missed
because the grep looked for Ruby class names instead of behavior. One (`I18nScope`) is a
mechanism for Ruby's own backtraces. Under the parity law — matches the source = done — the
audit's product is this table, not nine new modules.

## Commands run (this tree, base d8050251)

- `find <gems>/card-1.110.0/lib <gems>/decko-0.20.0/lib -name "*<name>*"` for each of the seven file names (locations as cited).
- `grep -rn "require_field" <gems>/card-1.110.0 <gems>/card-mod-*/` → the two mod call sites plus the trait definition.
- `cat -n <gems>/card-1.110.0/lib/card/set/i18n_scanner.rb` → 23 lines, all comments.
- `grep -rn "include_set" <gems>` → only `include_set_modules` hits.
- `grep -rn "AdvancedApi\|Inheritance" <gems>/*/lib` → `set.rb:124,127` (the includes).
- `grep -rn "classy" <gems>/card-mod-*/lib` → `action_renderer.rb:30`.
- `grep -rn "Card\.create_card\|Card\.update_card" <gems>/*/lib` → zero hits.
- `grep -rn "Cardio::Utils" <gems>/*/lib` → `cache/class_methods.rb:84` only.
- `grep -rn 'cache: "never"' src/ | wc -l` → 120 registrations carry the option; `grep -rn "viewCache\|cacheKey\|cachedView" src/card/render/` → no hits (no view-level cache exists).
- `grep -rn "rescue_all_in_controller" src/` → 1 hit, a citation comment (see the railtie-keys disposition report).

No test was added by this row: no source file changed, so there is nothing new to pin.

Suites run as the baseline behind the "messages are pinned" and "registry is graded" claims:

- `npx vitest run tests/card/mod-loader/card-mod-rules.test.ts tests/card/auth/` → 19 files, 235 passed, 29 skipped, **3 files failed**: `signin-endpoint.test.ts`, `reset-flow-endpoint.test.ts`, `first-run-setup-endpoint.test.ts`, each with `staging-server dist bootstrap: tsc -p tsconfig.json failed (status 2)`. Those three are pre-existing, not caused by this row: the same file run on the pristine canonical tree (`npx vitest run tests/card/auth/signin-endpoint.test.ts` in `C:/localProjects/decko-ts-release-lead`) fails identically ("1 failed | 10 skipped"), and `npx tsc --noEmit` reports the same 3 errors in `tests/card/actions/write-path-races.test.ts` on both trees. That is the build the staging-server bootstrap runs.
