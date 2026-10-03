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
 *  card through the write verdict: all three write tasks are rule-checked
 *  (Ruby's permission chain has no signed-in clause for create, update, or
 *  delete — card-mod-permissions set/all/permissions.rb:120-125/:148-153/
 *  :155-157; the recorded site's 694 creator_id=15 cards, 1,808 live
 *  updater_id=15 cards, and 8 trashed updater_id=15 cards prove the
 *  arms). Only a deck that cannot form the anonymous codename card (a
 *  fragment seed) keeps the legacy signed-in-only rejection. */
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
  | "recaptcha"; // event :recaptcha (card-mod-recaptcha set/all/recaptcha.rb:50-55)

/** Error class for every action-layer rejection. `code` carries the Ruby
 *  event the rejection ports (see CardActionErrorCode). */
export class CardActionError extends Error {
  readonly code: CardActionErrorCode;

  constructor(code: CardActionErrorCode, message: string) {
    super(message);
    this.name = "CardActionError";
    this.code = code;
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
}

/** Card#update! arguments. All fields optional; a save that changes nothing
 *  persists nothing (no-op save — history events.rb:34-37). */
export interface UpdateCardInput extends TypeSpec {
  cardId: number;
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
}

/** The result of one action request: one act, the primary card's action,
 *  and the subcard actions recorded in the same act (auto-created side
 *  cards on junction creates, trashed trash-name obstacles on renames,
 *  cascaded children on deletes). */
export interface ActionResult extends CardActionSummary {
  actId: number;
  subactions: CardActionSummary[];
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
