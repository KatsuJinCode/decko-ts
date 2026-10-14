# SECURITY policy: withheld divergences

NOT PART OF THE SHIPPED PACKAGE. This file holds, verbatim, the text removed
from `docs/SECURITY.md` on 2026-10-14 because it identified the areas of Ruby
Decko the withheld flaws are in. Keep it out of every release package.

Until the maintainers have been told privately: because of the nature of the
security concern, these will not be disclosed here until a private channel is
established to disclose it responsibly.

## Reporting a vulnerability (removed text)

```text
responsibly. Three Ruby Decko flaws are withheld on those terms, each marked where it is
material:

1. the account-holder name-change authorization gap;
2. the crash that follows from it on a production deck;
3. the stored-HTML sanitiser gap.

None of the three is described anywhere in this repository beyond the name above
and the entry that governs the port's own behaviour on it: no upstream file, line,
guard name, request shape or payload, and no explanation of what Ruby does with
it. The entries below say what the port does, not what Ruby accepts.
```

## Classes of the approved divergences (removed text)

```text
There are six exceptions to that parity rule, listed below, in three classes:

1. **Security holes.** Where Ruby's behaviour lets one user act against another (run script in their browser, act with their session, read or guess their credentials, forge a request under a visitor's session, write to the deck's storage without permission), the port does not copy it. Divergences 1, 3, 5 and 6.
2. **Credential and secret handling.** Where Ruby stores or compares a secret in a way that is weaker than it needs to be, the port stores or compares it more strongly. Divergences 2 and 4.
3. **Crashes.** Where Ruby fails with an internal error, the port gives the error Ruby intended.
```

## The persistence oracle's third class of deliberate difference (removed item 3)

```text
3. **Row-level differences the persistence oracle declares**, in the same file. Divergence 1 below ("Stored HTML is sanitised safely") accounts for the stored-HTML entries of the withheld set, which are withheld until disclosure and not described here; the remainder concern Ruby's own bugs, which are reproduced on purpose.
```

## Approved divergence 1 (removed entry, verbatim)

```text
### 1. Stored HTML is sanitised safely

| | |
|---|---|
| **Ruby** | Ruby Decko 0.20.0 differs from the port here deliberately, for a security reason that is withheld until a private channel is established to disclose it responsibly. Nothing about what Ruby accepts is described in this repository. |
| **Port** | The same tag and attribute allowlists, and the same tag-finding expression, so the same tags are kept and dropped. Attributes are read with the HTML tokenizer's rules; URL attributes (`href`, `src`, `cite`) must be relative or use a non-script scheme (`http`, `https`, `mailto`, `tel`, `sms`, `ftp`, `skype`, `callto`, `webcal`, `irc`, `ircs`, `xmpp`, `geo`, `news`, `nntp`, `feed`), plus `data:image/*` for `img src` with SVG excluded; `style` values may not contain `expression()`, `behavior:`, `-moz-binding`, `@import` or a script URL; values are escaped; comments are removed only where they lie in text; a stray `<` that would open markup is written as `&lt;`. When a browser reads exactly the same attributes from Ruby's output as the port keeps, Ruby's bytes are stored unchanged. |
| **Why** | Without it, one user's edit to a RichText card could store script that runs for every reader of that card. |
| **Compatibility** | Ordinary content is stored byte for byte as Ruby stores it. Measured over the stored HTML of a real 19,000-card deck, 7,208 of 7,354 HTML-bearing cards clean identically. The other 146 are cards whose stored form differs under the two cleaners; which of those a card is follows from the withheld Ruby behaviour, so the count is reported without the shapes that identify it. Existing content changes only when it is saved again. |
| **Configuration** | None. Card types that Ruby does not clean (HTML, layout, email template, script and style types, `+*html_message`) are not cleaned by the port either; editing those types should be limited to trusted roles, as in Ruby. |
| **Tests** | `tests/card/actions/content-clean-security.test.ts`: a corpus built from the OWASP XSS Filter Evasion Cheat Sheet and the cleaner's own edge cases, checked by an independent browser-tokenizer verifier, alone and followed by page markup; 4,000 random hostile mixtures; ordinary content stable under a second pass and leaving nothing a browser acts on. The comparisons with the upstream cleaner's own output, on hostile markup and on ordinary content, and the write-probe set that declares the resulting row differences, are withheld until disclosure (`tests/withheld/` and `reference-harness/fixtures/write-battery-v1/withheld/`); when that directory is absent, `tests/card/actions/content-clean.test.ts` prints a `[withheld until disclosure] NOT RUN` line for them. |

```

## Approved divergence 5 (removed entry, verbatim)

```text
### 5. An account holder's name may be changed only by its holder or Help Desk

| | |
|---|---|
| **Ruby** | Ruby Decko 0.20.0 differs from the port here deliberately, for a security reason that is withheld until a private channel is established to disclose it responsibly. Nothing about what Ruby accepts is described in this repository. |
| **Port** | `assertMayRenameAccountHolder` (`src/card/actions/card-action-engine.ts:1051`) implements the check's evident intent: an account holder's name change is refused before anything is written, with Ruby's own error (`NAME: cannot rename Account Holder`, HTTP 422), unless the actor is the account holder or a member of Help Desk. Those two cases are the whole allowance — administrators are not among them, and the check has no always-allow arm. |
| **Why** | Renaming another user's account holder acts against that user: it changes the name their session, their notification mail and the references pointing at them answer to, without their involvement. |
| **Compatibility** | A rename Ruby accepts, the port refuses; nothing else changes, because the port's allowance (own account, Help Desk) is the check's evident intent. |
| **Configuration** | None. |
| **Tests** | The scenario-battery steps that exercise this rename are withheld from the public package until the disclosure described under "Reporting a vulnerability"; when they are absent, `tests/tools/side-effects-scenario-battery.test.ts` prints a `[withheld until disclosure] NOT RUN` line for them. The public battery's other 88 steps run without them. |

```

## Approved divergence: upload permission order (removed 2026-10-14)

Removed from `docs/SECURITY.md`, where it was divergence 4, because it describes an action Ruby Decko permits against a stock site. Its suite moved with it, from `tests/server/write-routes-preliminary-upload-permission.test.ts` to `tests/withheld/upload-order.test.ts`.

### 4. An upload is refused before it is stored

| | |
|---|---|
| **Ruby** | A two-step (preliminary) upload is answered at the `:prepare_to_validate` stage (`card-mod-carrierwave set/abstract/attachment/00_upload_cache.rb:8-25`), one stage before `check_permissions` runs at `:validate` (`mod/permissions/set/all/permissions.rb:22-26`). The event stores the file and files a draft action, then ends the act with `abort :success`, which does not roll back (`card/mod/core/set/all/result.rb:63-71`). So an actor with no permission on the card still gets the file into the deck's storage and leaves draft `card_actions`, `card_changes` and `card_acts` rows behind. |
| **Port** | The port checks `ok_to_update?` / `ok_to_create?` before anything is stored (`src/card/actions/card-action-engine.ts`), and a refused upload writes no file and no rows. A permitted two-step upload behaves as Ruby's does: the bytes are stored and the draft action is filed. |
| **Why** | Storing a file for an actor who may not change the card lets anyone who can reach the upload route write to the deck's storage. |
| **Compatibility** | Only refused uploads differ: Ruby answers them with the preview and leaves the file and draft rows; the port answers with its permission error and leaves nothing. |
| **Configuration** | None. |
| **Tests** | The upload permission suites added with this entry pin a denied update (403, no file, draft, change or act), a denied create (403, upload cache empty), a granted update and a granted create, and an ordinary one-step upload denial. |

## Flaws added to the withheld list on 2026-10-14

The public count of withheld Ruby Decko flaws rose from three to five:

4. the two-step upload permission order: an actor with no permission on a card gets a file into the deck storage and leaves draft action rows (the entry above);
5. the Bootswatch skin `+*colors` update permission gap: `ok_to_update?` on a skin's `+*colors` is `left.parent? && super`, so on a skin with no parent the permission check never runs and an anonymous visitor can change the site colours. The scenario-battery step `anon-update-skin-colors` that reproduces it moved to `tools/parity-side-effects/withheld/scenarios.json`, and its Ruby recording to `reference-harness/fixtures/write-battery-v1/withheld/side-effects-ruby-steps.json`.

The public class line for security holes now reads "Divergence 2" and the credential line "Divergences 1 and 3", matching the renumbered entries.
