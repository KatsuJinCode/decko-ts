// CodeRay alpha theme token-kind -> inline style map.
//
// Truth source: coderay-1.1.3 lib/coderay/styles/alpha.rb (the default theme
// registered as `:alpha` in lib/coderay/styles/_map.rb). Encoders::HTML with
// :css => :style (the `div` encoder default - coderay-1.1.3
// lib/coderay/encoders/div.rb) reads these to emit `style="..."` instead of
// class="...". The deck calls `CodeRay.scan(content, :LANG).div`, so the
// values below are what the HTML view wraps each token span in.
//
// This is the minimum surface the corpus fixtures exercise. The full alpha
// table is much larger; add kinds as new cardtypes land.

/** A literal kind/style pair as the HTML encoder writes it. */
export interface StyleEntry {
  /** CodeRay token kind symbol (encoder.rb#make_span_for_kinds). */
  readonly kind: string;
  /** The encoded `style="..."` value, sans surrounding markup. */
  readonly style: string;
}

/** The full kind table the HTML encoder consults. Order does not matter;
 *  the encoder uses this map directly. */
export const ALPHA_STYLES: readonly StyleEntry[] = [
  { kind: "error", style: "color:#F00;background-color:#FAA" },
  { kind: "tag", style: "color:#070;font-weight:bold" },
  { kind: "doctype", style: "color:#34b" },
  { kind: "inline", style: "background-color:hsla(0,0%,0%,0.07);color:black" },
];
