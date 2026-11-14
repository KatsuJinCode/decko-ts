// The write-path action layer (Set / Save / Update / Delete). The Ruby
// grounding is per-behaviour and lives with the behaviour:
// name-validation.ts (the save-time name events), list-content.ts (content
// assigned to a card in a list set), refresh-references-in.ts and
// refresh-references-out.ts (the two directions of the reference table), and
// junction-cycle-detection.ts (self-ancestor rejection, including the Ruby
// divergence it deliberately introduces).

export { CardActionEngine, type CardActionEngineOptions } from "./card-action-engine.js";
export {
  ANONYMOUS_ACTOR_NAME,
  CardActionError,
  type ActionRequest,
  type Actor,
  type ActionResult,
  type CanWriteHook,
  type CardActionErrorCode,
  type CardActionSummary,
  type CreateCardInput,
  type DeleteCardInput,
  type TypeSpec,
  type UpdateCardInput,
} from "./types.js";
export {
  assertNameAvailable,
  findTrashedCardByLex,
  findTrashedKeyObstacle,
  MAX_NAME_LENGTH,
  validateNameLegality,
} from "./name-validation.js";
export { defaultTypeId, resolveTypeId } from "./type-resolution.js";
export { assertNotOwnAncestor } from "./junction-cycle-detection.js";
