// notify/index.ts — public surface of the notify module.
//
// Consumers that need only the follow-notification wire-up:

export type {
  MailMessage,
  NotifyActor,
  NotifyCardRef,
  NotifyContext,
  NotifyTransport,
  SavePathEvent,
  SavePathIntegrationHook,
} from "./types.js";

export {
  CaptureTransport,
  LoggingTransport,
  NoopTransport,
  defaultTransport,
  type CapturedMail,
} from "./transport.js";

export {
  renderMail,
  mailToString,
  type EmailTemplate,
  type FollowNotice,
} from "./mail.js";

export {
  buildFollowNotifyHook,
  fixedAuthAs,
  fixedFollowerResolver,
  fixedTemplateResolver,
  type FollowerRef,
  type FollowerResolver,
  type EmailTemplateResolver,
  type FollowNotifyDeps,
} from "./follow-notify.js";

export {
  runIntegrationHooks,
  savePathEventFromAction,
  expandActionResultToSavePathEvents,
  makeNotifyContext,
  type IntegrationDispatchInput,
  type IntegrationHookReceipt,
} from "./dispatch.js";

export {
  deckEmailTemplateResolver,
} from "./deck-resolvers.js";

export {
  defaultFollowerResolver,
  defaultFollowNotifyDeps,
  resolveFollowers,
} from "./follower-resolver.js";
