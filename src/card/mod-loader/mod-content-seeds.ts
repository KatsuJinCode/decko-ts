// The mod content-seed registry: the four mod data/real.yml CONTENT entries
// the completeness register grades UNPORTED or DIVERGENT for missing seed
// bodies (docs/reports/decko-completeness-register-2026-10-18.md, the
// events-settings section's *-card universe rows: *Ace, *tinyMCE, *getting
// started, *contextual class), carried as flattened create-or-update rows
// the boot seed runs through the same Card.ensure! machinery the account
// layer uses.
//
// Ruby source of the shape: Cardio::Mod::Eat (eat.rb:22-33) runs
// Card.ensure! over every data/real.yml entry; Subcards::Args
// (subcards/args.rb:22-39) turns `:fields:` symbol keys into subcard names
// through Card::Codename.name! + the joint, so :shark: becomes the subcard
// *getting started+Shark (codename shark belongs to the account layer's
// Shark role card - account real.yml:47-49) and :right:/:input_type:/
// :content_options: become the +*right rule chain under *contextual class.
// Field hashes carry no :type:, so Ruby creates them at the default type -
// the port's ensure does the same (typeId undefined).
//
// The two cardtype rows at the top are the entries' own type dependencies
// (JSON / HTML are seeded by card-mod-format's real.yml, not by core), the
// same dependency-row pattern the account layer uses for User / Email
// template. Rows are in ingestion order: a cardtype row precedes any row
// typed by it, and a parent precedes its fields.

/** One data/real.yml entry (or flattened field row): name, codename, type
 *  codename, content - verbatim real.yml bytes. */
export interface ModContentSeedCard {
  readonly name: string;
  readonly codename?: string;
  readonly typeCodename?: string;
  readonly content?: string;
}

export const MOD_CONTENT_SEED_CARDS: readonly ModContentSeedCard[] = [
  // card-mod-format-0.20.0/data/real.yml:3-5 - the JSON cardtype the
  // *Ace and *tinyMCE entries type by (:type: json).
  { name: "JSON", codename: "json", typeCodename: "cardtype" },
  // card-mod-format-0.20.0/data/real.yml:24-27 - the HTML cardtype the
  // *getting started entry types by (:type: html), with its seeded
  // +*description field.
  { name: "HTML", codename: "html", typeCodename: "cardtype" },
  { name: "HTML+*description", content: "<p>These cards allow unrestricted HTML. [[http://decko.org/wagn/HTML|more]]</p>" },

  // card-mod-ace_editor-0.20.0/data/real.yml:1-12 - the *Ace entry (the
  // whole file): name, codename, json type, config body.
  { name: "*Ace", codename: "ace", typeCodename: "json", content: "{\n  \"default\": {\n  \"showGutter\": true,\n  \"theme\": \"ace/theme/github\",\n  \"printMargin\": false,\n  \"tabSize\": 2,\n  \"useSoftTabs\": true,\n  \"maxLines\": 30\n  }\n}\n" },
];
