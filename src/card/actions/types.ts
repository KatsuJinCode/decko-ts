// Shared types and errors for the card ACTION layer (Set / Save / Update /
// Delete) — the write-side API that sits on top of the ActWriter history
// machinery (src/card/history/write-path.ts).
//
// Ruby analogues:
// - Card.create! / Card#create        (card-1.110.0 lib/card/director/card_class.rb:5-13)
// - Card#update! / Card#save!         (lib/card/director/all.rb:46-61)
// - Card#delete!                      (mod/core/set/all/trash.rb:11-21)
// - Card::Auth.current_id / Anonymous (lib/card/auth/current.rb:7-9, :43-47)

import type { DeckoName, Nameish } from "../name.js";
import type { CardRecord } from "../fetch/card-record.js";

/** The account performing an action. `null` means "no signed-in account" —
 *  Ruby's Card::Auth.current_id falling back to Card::AnonymousID
 *  (auth/current.rb:7-9). Anonymous sessions act AS the anonymous codename
 *  card through the write verdict: all three write tasks are rule-checked,
 *  because Ruby's permission chain has no signed-in clause for create,
 *  update, or delete (card-mod-permissions set/all/permissions.rb
 *  :120-125 / :148-153 / :155-157 — each arm falls through to the rule
 *  walk rather than short-circuiting on the session). Only a deck that
 *  cannot form the anonymous codename card (a fragment seed) keeps the
 *  legacy signed-in-only rejection. */
export interface Actor {
  id: number;
  name: string;
}

/** Legacy display marker for the anonymous session in host code. NOT the
 *  identity test: Ruby keys actor identity on the ID (`@as_id =
 *  Card.id given_user`, auth/proxy.rb:11; `as_id` proxy.rb:32-35;
 *  `signed_in?` = `current_id != AnonymousID`, auth/current.rb:43-47),
 *  and the engine does the same — an actor is the anonymous session iff
 *  its id is the anonymous codename card's id (or it is null). A card
 *  merely NAMED "*anonymous" is an ordinary account and acts as itself. */
export const ANONYMOUS_ACTOR_NAME = "*anonymous";

/** Machine-readable failure kinds thrown by the action layer. */
export type CardActionErrorCode =
  // write rejected: the session cannot act (no signed-in account and the
  // deck cannot form the anonymous codename card)
  | "anonymous-actor"
  | "permission-denied" // the canWrite hook rejected the actor
  | "name-conflict" // validate_uniqueness_of_name (mod/core/set/all/name_events.rb:19-26)
  | "name-illegal" // validate_legality_of_name (name_events.rb:35-47)
  | "rename-conflict" // validate_renaming (name_events.rb:55-61)
  | "cycle" // the save would make a card its own descendant
  | "not-found" // no such (non-trashed) card
  | "type-unknown" // validate_type (mod/core/set/all/type.rb:24-30)
  | "attachment-missing" // validate_file_exist (card-mod-carrierwave set/abstract/attachment.rb:26-34)
  | "protected-card" // validate_delete (mod/core/set/all/trash.rb:31-49)
  | "conflict" // detect_conflict (card-mod-history set/all/history/events.rb:19-22)
  | "revert-unsupported" // a revert shape the port does not carry out (named in the message)
  | "field-required" // require_field :email (card-mod-account set/right/account.rb:8)
  | "validation-failed" // another :validate event's errors (e.g. card-mod-account password.rb:28-46)
  | "server-error" // a save event failed with an exception Ruby would cardify as Card::Error::ServerError (card/error.rb:45-56: view :server_error, status 500)
  | "recaptcha" // event :recaptcha (card-mod-recaptcha set/all/recaptcha.rb:50-55)
  | "user-error"; // a bare Card::Error::UserError (card-1.110.0 lib/card/error.rb:21), e.g. deleting a card that does not exist

/** Error class for every action-layer rejection. `code` carries the Ruby
 *  event the rejection ports (see CardActionErrorCode). */
export class CardActionError extends Error {
  readonly code: CardActionErrorCode;
  /** The message as Ruby's error view shows it to the user: the
   *  `errors.add` key, upcased, then the message (card-mod-format
   *  set/all/html/error.rb standard_errors: "<KEY>: <message>"). Absent when
   *  the throw site has no Ruby counterpart wording; the HTML error surface
   *  then shows `message`. */
  readonly userMessage?: string;
  /** Ruby's card.errors as {attribute => message}, when the attribute is
   *  not the lower-case form of the shown key (an error class name such as
   *  "UserError"). The JSON errors view reports this hash. */
  readonly errorsByAttribute?: Readonly<Record<string, string>>;
  /** The saved card's name — the errors view's heading source
   *  (error.rb:56-62 voo.title = t(:format_problems_name, cardname:
   *  card.name)). Absent when the throw site has no card context. */
  readonly cardName?: string;

  constructor(
    code: CardActionErrorCode,
    message: string,
    userMessage?: string,
    errorsByAttribute?: Readonly<Record<string, string>>,
    cardName?: string,
  ) {
    super(message);
    this.name = "CardActionError";
    this.code = code;
    if (userMessage !== undefined) this.userMessage = userMessage;
    if (errorsByAttribute !== undefined) this.errorsByAttribute = errorsByAttribute;
    if (cardName !== undefined) this.cardName = cardName;
  }
}

/** Type specification accepted by create/update — the `:type_id` /
 *  `:type_code` / `:type` args of Card.new (mod/core/set/all/type.rb:81-92
 *  extract_type_id!). Precedence: typeId > typeCode > typeName > default. */
export interface TypeSpec {
  typeId?: number;
  typeCode?: string;
  typeName?: Nameish;
}

/** One uploaded attachment on a save — the carrierwave mount's file
 *  attribute (card-mod-carrierwave set/type/file.rb:1
 *  `attachment :file` / set/type/image.rb:1 `attachment :image`):
 *  `Card.create name:, type: :file, file: File.new(path)`. When present,
 *  the attachment REPLACES any `content` argument (Ruby
 *  assign_set_specific_attributes resets content when attaching,
 *  attachment.rb:90-97); the engine derives the db_content identifier
 *  itself (~<card_id>/<action_id><ext>, file_card_uploader.rb:164-169). */
export interface AttachmentInput {
  bytes: Uint8Array;
  /** The upload's original filename — saved as the action's comment
   *  (event :save_original_filename, attachment.rb:20-24) and used for
   *  extension/content-type detection (FileCardUploader#extension,
   *  :155-162). */
  originalFilename: string;
  /** The multipart part's declared content type (the LAST arm of
   *  SanitizedFile#content_type's detection order, :240-250). */
  declaredContentType?: string | null;
  /** The bytes come from an earlier preliminary upload (a two-step
   *  upload's action_id_of_cached_upload), not from a file in this request:
   *  the request params carry no uploaded-file object, so Ruby's delayed
   *  integrate stage (the follower notice) is not dropped. */
  fromCachedUpload?: boolean;
  /** Coded file storage (storage_type: :coded — card-mod-carrierwave
   *  set/abstract/attachment/coded.rb): the file is kept in the named
   *  mod's data/files directory, not the deck's, and the card's content
   *  becomes the coded identifier `:<codename parts>/<mod><ext>`. Presence
   *  marks the save as coded; `mod` is the mod the file belongs to, absent
   *  when the save carries none (Ruby's validate_coded_storage_type then
   *  refuses: "mod argument needed to save card as coded"). `decko eat`
   *  sets it for a pod item with storage_type :coded
   *  (Eat::Edibles#handle_attachments). */
  coded?: { mod?: string };
}

/** One subcard in a multi-card save (Card::Subcards — card/lib/card/
 *  subcards.rb:1-16, "API to create/update/delete additional cards
 *  together with the main card"; the values of the form's card[subcards]
 *  hash). Attributes resolve like a card save's; the subcard is CREATED
 *  when no card lives at the resolved name, UPDATED otherwise (the
 *  mod/core/set/all/subcards.rb events). */
export interface SubcardInput extends TypeSpec {
  content?: string | null;
  attachment?: AttachmentInput;
  /** The subcard's own subcards, keyed relative to the subcard ("+*email"
   *  under "+*account"): the sign-up form's nested card[subcards] hash. */
  subcards?: Record<string, SubcardInput>;
  /** A new name for an existing subcard: the subcard is renamed in this act
   *  (a subcard hash with `name:`, subcards.rb). */
  name?: Nameish;
  /** `trash: true` on an existing subcard trashes it in this act, as a
   *  delete action chained to the supercard's action (a history revert's
   *  subcard revisions, card-mod-history revision.rb merge_revert_action!). */
  trash?: boolean;
  /** This subcard's own subcards (card[subcards][+*account][subcards]...),
   *  named relative to it. */
  /** false: the card's set says history? false (password, salt) — the row
   *  is written without an action. */
  history?: boolean;
  /** The content is already an encrypted password (the account field
   *  plan encrypted it with the salt it generated). */
  passwordEncrypted?: boolean;
  /** The subcard is instantiated by an EVENT, not posted: a `field`
   *  assignment (subcards/all.rb:32-39 -> add_field -> add_child ->
   *  new_by_attributes, card/subcards/add.rb:52-54), which builds a real
   *  Card object and saves it in this act — a typed field with blank
   *  content still CREATES its row. The engine sets this on the fields an
   *  event adds (Bootswatch skin `copy_theme`'s +*colors/+*variables,
   *  events.rb:10-12), so the blank-noop skip — which models a POSTED
   *  form's hidden blank field (saveSubcardsInWriter) — does not swallow
   *  it. A posted field never sets this. */
  fromEventField?: boolean;
}

/** Card.create! arguments (Card.create! opts — director/card_class.rb:5-9:
 *  `card = new opts; card.save!`). Name is the mark; everything else is
 *  optional and resolved by the engine. */
export interface CreateCardInput extends TypeSpec {
  name: Nameish;
  content?: string | null;
  /** An uploaded file/image. Requires the engine's attachmentStore. */
  attachment?: AttachmentInput;
  /** Subcards saved in this save's act (subcards.rb:1-16): keys are
   *  RELATIVE names ("+author" -> "<this card>+author", the form's
   *  subfield shape) or absolute names. */
  subcards?: Record<string, SubcardInput>;
  /** false: history? false for this card (card-mod-account password.rb,
   *  salt.rb): the row is written with no act or action. */
  history?: boolean;
  /** The content is already an encrypted password (see SubcardInput). */
  passwordEncrypted?: boolean;
  /** cards.codename passthrough (ActWriter column). Codename writes carry
   *  their own events in Ruby (mod/core/set/all/codename.rb) — the caller
   *  is responsible for legitimacy; the cache reset runs here. */
  codename?: string | null;
  /** card_actions.super_action_id passthrough when this create is itself a
   *  subcard operation (history events.rb:88-92). */
  superActionId?: number | null;
  /** params[:comment] — the add_comment event's input (card-mod-comment
   *  set/all/comment.rb:4-12; the event exists only when the comment mod
   *  is loaded, exactly as in Ruby). */
  comment?: string;
  /** params[:comment_author]. */
  commentAuthor?: string;
  /** params[:recaptcha_token] — the event :recaptcha input
   *  (card-mod-recaptcha set/all/recaptcha.rb:41-44, 57-66). Rides the
   *  save only when the recaptcha mod + config are composed; may be
   *  undefined on a guarded save (the verify posts response: nil and the
   *  endpoint answers "missing-input-response"). */
  recaptchaToken?: string;
  /** card[action_id_of_cached_upload] — the two-step upload's final save
   *  (00_upload_cache.rb:2 attr_accessor via Rails assign_attributes;
   *  save_preliminary_upload? :84-86). The preview_editor round trip's
   *  hidden input: the cached DRAFT action whose stored file becomes this
   *  save's attachment (assign_attachment_on_create :27-34 — the draft's
   *  comment becomes the action comment, the cache bytes move to the
   *  card's files, and the integrate phase deletes the draft action + its
   *  cache file while the act survives, :51-57). Undefined on every save
   *  without the upload detour. */
  actionIdOfCachedUpload?: number | string;
}

/** Card#update! arguments. All fields optional; a save that changes nothing
 *  persists nothing (no-op save — history events.rb:34-37). */
export interface UpdateCardInput extends TypeSpec {
  cardId: number;
  /** The content is already an encrypted password (see SubcardInput). */
  passwordEncrypted?: boolean;
  /** A new name — the Save/Update rename path (name_events.rb events on
   *  `changed: :name`). Compound names rewire left_id/right_id; simple
   *  names rewrite the cards.name/key columns. */
  name?: Nameish;
  content?: string;
  /** An uploaded file/image replacing the card's current attachment
   *  (Ruby: assign_attachment + write_identifier on an :update save).
   *  Requires the engine's attachmentStore. */
  attachment?: AttachmentInput;
  /** Subcards saved in this save's act (subcards.rb:1-16) — the multiedit
   *  shape: the plusses ride the main card's submission. Missing subcards
   *  are created, existing ones updated; a subcard whose save changes
   *  nothing produces no action (events.rb:34-37). */
  subcards?: Record<string, SubcardInput>;
  superActionId?: number | null;
  /** params[:comment] — the add_comment event's input (card-mod-comment
   *  set/all/comment.rb:4-12). */
  comment?: string;
  /** params[:comment_author]. */
  commentAuthor?: string;
  /** The edit form's stale-revision field: the :conflict_tracker hidden
   *  input (card-mod-edit-0.20.0 set/all/form.rb:27-31,
   *  `hidden_field :last_action_id_before_edit, class:
   *  "current_revision_id"`), posted as card[last_action_id_before_edit].
   *  The save path validates it against the card's current revision -
   *  detect_conflict (card-mod-history set/all/history/events.rb:19-22,
   *  when: :edit_conflict?). Omitted by callers that never rendered the
   *  edit form (the API saves, the autosave's callers) = never a conflict
   *  (events.rb:66 short-circuits on nil). */
  lastActionIdBeforeEdit?: number | string | null;
  /** `Env.params["draft"] == "true"` (mod/core/set/all/content.rb:20-22) -
   *  the autosave POST's flag (card-mod-edit-0.20.0
   *  assets/script/autosave.js.coffee:20). A draft save records history
   *  and then aborts the act at the :store stage
   *  (content.rb:8-15 `save_content_draft content; abort :success`), so
   *  the cards row is NOT written. UPDATE-only in Ruby (`on: :update`). */
  draft?: boolean;
  /** params[:recaptcha_token] — the event :recaptcha input
   *  (card-mod-recaptcha set/all/recaptcha.rb:41-44, 57-66). Same shape as
   *  the create-side field. */
  recaptchaToken?: string;
  /** card[action_id_of_cached_upload] on an update — the two-step upload's
   *  replace arm (00_upload_cache.rb:36-42 assign_attachment_on_update):
   *  the cached draft's file (stored under the card's own files dir) is
   *  read back with the draft action selected, its comment becomes the new
   *  action's comment, and the integrate phase deletes the draft action +
   *  its stored file while the act survives (:66-72). */
  actionIdOfCachedUpload?: number | string;
  /** Work the request triggered for this save's :integrate stage
   *  (`trigger: :required` events such as send_verification_email and
   *  send_welcome_email): run after the save's rows are written and before
   *  the delayed follower notice. */
  triggeredIntegrate?: () => Promise<void>;
  /** The save is an event another card's save triggered (for example
   *  use_as_current_skin updating *all+*style): it rides that card's act,
   *  whose card is the one observers and followers hear about, so this save
   *  sends no notices of its own. */
  withinOtherAct?: boolean;
  /** Fetch the card with `look_in_trash` (card-1.110.0 lib/card/fetch.rb
   *  :49-51, retrieve.rb:31): the update may reach a trashed row. Without
   *  it a trashed card is "no such card", as Card[id] filters trash. */
  lookInTrash?: boolean;
  /** An explicit trash assignment. `false` pulls a trashed card back as an
   *  ordinary :update save (Card#update!(trash: false)); requires
   *  lookInTrash. `true` is accepted only with withinRollback; trashing is
   *  otherwise deleteCard. */
  trash?: boolean;
  /** The save is the :rollback_actions event's nested `update!`
   *  (card-mod-history set/all/history/events.rb:40-46). It runs inside the
   *  outer update's director, whose action was already identified as
   *  :update (card-1.110.0 lib/card/director/all.rb:19-28), so even a
   *  revision that trashes the card records an :update action and runs no
   *  `on: :delete` events (no delete_children cascade). */
  withinRollback?: boolean;
  /** `card[skip]=validate_renaming`: the save skips the validate_renaming
   *  event (mod/core/set/all/name_events.rb:55-61), so a rename may carry a
   *  content or type change. The history pane's revert links send it
   *  (card-mod-history set/all/history/actions.rb:81-89). */
  skipValidateRenaming?: boolean;
  /** `card[skip]` / `update!(skip: ...)`: further events this save's act
   *  skips (lib/card/set/event/skip_and_trigger.rb). The rename form's
   *  "do not update references to this name" box sends
   *  `update_referer_content`: referers keep their content, their reference
   *  rows are rebuilt from it, and rows pointing at the renamed card lose
   *  its id (reference_events.rb:7-25). */
  skip?: string[];
}

/** A history revert request — the history pane's "revert to this" and
 *  "revert to previous" links (card-mod-history set/all/history/actions.rb
 *  :81-89, lib/card/act/act_renderer/relative_act_renderer.rb:50-54,
 *  absolute_act_renderer.rb:17-19). The :rollback_actions event
 *  (set/all/history/events.rb:40-46) reverts the named actions' cards to
 *  their revisions (revision.rb). */
export interface RevertActionsInput {
  /** The card the request updates (the URL mark, fetched look_in_trash). */
  cardId: number;
  /** params[:revert_actions] — explicit action ids ("revert to this"). */
  actionIds?: (number | string)[];
  /** params[:revert_act] — every action of one act ("revert to previous").
   *  Takes precedence over actionIds (revision.rb actions_to_revert). */
  actId?: number | string;
  /** params[:revert_to] == "previous": revert each action to the revision
   *  BEFORE it (revision_before_action). */
  revertToPrevious?: boolean;
}

/** Card#delete! arguments (trash.rb:11-21 — an update save with trash:
 *  true). Children are deleted recursively in the same act
 *  (trash.rb:52-59 delete_children). */
export interface DeleteCardInput {
  cardId: number;
  superActionId?: number | null;
  /** params[:recaptcha_token] — the event :recaptcha input
   *  (card-mod-recaptcha set/all/recaptcha.rb:41-44, 50-55). The event has
   *  NO `on:` clause and Ruby's delete! IS an update save with trash: true
   *  (trash.rb:11-21 add_to_trash -> update!), so the guard reaches the
   *  delete save exactly as it reaches create/update. Same shape as the
   *  create/update-side field. */
  recaptchaToken?: string;
}

/** The shared entry's request union (applyAction — one dispatch for the
 *  Set/Save/Update/Delete verbs). */
export type ActionRequest =
  | ({ verb: "create" } & CreateCardInput)
  | ({ verb: "update" } & UpdateCardInput)
  | ({ verb: "delete" } & DeleteCardInput);

/** One card's action within the act. */
export interface CardActionSummary {
  cardId: number;
  actionId: number;
  verb: "create" | "update" | "delete";
  /** The card's composed name after the action (best effort; undefined when
   *  the lexicon cannot resolve it, e.g. a side card was deleted). */
  name?: DeckoName;
  /** name_before_act (lib/card/dirty.rb DirtyNames) — the composed name the
   *  card answered to before this act, on renames. The response's expiry
   *  fan-out needs it: Ruby's expire_names (cache/all.rb:104-108) expires
   *  BOTH key versions via name_before_act, and the host render-map half of
   *  that expire only reaches the names the response carries. */
  nameBeforeAct?: DeckoName;
}

/** The result of one action request: one act, the primary card's action,
 *  and the subcard actions recorded in the same act (auto-created side
 *  cards on junction creates, trashed trash-name obstacles on renames,
 *  cascaded children on deletes, subcard saves on subcards-bearing
 *  submissions). */
export interface ActionResult extends CardActionSummary {
  actId: number;
  subactions: CardActionSummary[];
  /** True when the ACT CARD itself recorded no action (its save was a
   *  no-op) while subcards changed — the act still exists naming the main
   *  card (Ruby: act.card; main_action falls to the act's first action,
   *  mod/history lib/card/act.rb). The notify dispatch then carries only
   *  the subcard actions. */
  actCardActionOmitted?: boolean;
}

/** The host-side EXTRA permission gate. The rule-based ok? enforcement
 *  (card-mod-permissions ok_to_create?/ok_to_update?/ok_to_delete?, ported
 *  in view-task-rules.ts and enforced inside the engine before this hook)
 *  decides first; `canWrite` may then deny further but is never consulted
 *  to ALLOW what the rules denied. Consulted for every session — an
 *  anonymous session's actor is the anonymous codename card, the same id
 *  its writes are attributed to (a port-only seam: Ruby's permission
 *  chain is the :check_permissions event walk alone and has no host
 *  hook). */
export type CanWriteHook = (
  card: CardRecord,
  actor: Actor,
) => boolean | Promise<boolean>;
