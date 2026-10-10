// The render-side recaptcha config seam: the SAME config the write path's
// captcha guard runs on (CardActionRecaptchaConfig), handed to the render
// layer at host boot so the FORM side can evaluate Ruby's recaptcha?(opts)
// (set/all/recaptcha.rb:96-98) — the hidden_form_tags override that arms
// every card_form's token bytes when the guard is on. Ruby reads
// Card.config + rule(:captcha) synchronously inside the format override;
// the port's form builders read this config plus the mod rule-seed
// registry (mod-rule-seeds.ts — form-side only; the validate side resolves
// its rule content from storage).

export interface RenderRecaptchaConfig {
  siteKey: string;
  secretKey: string;
}

let renderConfig: RenderRecaptchaConfig | undefined;

/** Bind the render-side recaptcha config (host boot; undefined = the guard
 *  is off everywhere — no form renders the token bytes). */
export function setRenderRecaptchaConfig(config: RenderRecaptchaConfig | undefined): void {
  renderConfig = config;
}

/** The render-side recaptcha config, or undefined when unarmed. */
export function renderRecaptchaConfig(): RenderRecaptchaConfig | undefined {
  return renderConfig;
}
