// raw-corpus-p20-help-content-pages.ts -- the p20-help-content suite's page
// subset: the 38 corpus pages the mm-escape-residue receipt attributed to the
// help-content resolver gap (its residual table, "38 | help-content resolver
// gap"). Two mechanisms:
//
// - setting-card (4): the Setting-type card pages (*style, *on create, *on
//   update, *on delete) whose oracle body opens with the card-mod-rules
//   set/rule/editor.rb:24-28 rule_help alert ("<div class="alert alert-info
//   rule-instruction">") and the engine rendered the bare
//   "All X rules that apply to" h3 (the alert half of set/type/setting.rb
//   core.haml:1-12 missing on the loader-less graded path).
//
// - mod-child (34): the Abstract::ModAssets child cards "mod: X+*style" /
//   "mod: X+*script" (card-mod-style set/type_plus_right/mod/style.rb,
//   card-mod-script set/type_plus_right/mod/script.rb) whose oracle :core is
//   the group_list haml (mod_assets.rb:171-182) and the engine rendered the
//   List cardtype's pointer-list wrapper.
//
// Page ids/names/shards are the escape-family sweep's rows for the same ids
// (raw-corpus-escape-family-pages.ts), so the shard lookup is identical.
// helpClass separates the two mechanisms for the per-class flip counts.

export interface P20HelpContentPage {
  phase: string;
  id: number;
  name: string;
  helpClass: "setting-card" | "mod-child";
  shard: string;
}

export const P20_HELP_CONTENT_PAGE_SUBSET: P20HelpContentPage[] = [
  { phase: "000012", id: 17450, name: "*style", helpClass: "setting-card", shard: "recapture-raw-shard-000012.jsonl" },
  { phase: "000016", id: 21757, name: "*on create", helpClass: "setting-card", shard: "recapture-raw-shard-000016.jsonl" },
  { phase: "000016", id: 21765, name: "*on delete", helpClass: "setting-card", shard: "recapture-raw-shard-000016.jsonl" },
  { phase: "000016", id: 21761, name: "*on update", helpClass: "setting-card", shard: "recapture-raw-shard-000016.jsonl" },
  { phase: "000039", id: 45465, name: "mod: account+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45476, name: "mod: ace editor+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45479, name: "mod: api key+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45483, name: "mod: bar and box+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45485, name: "mod: bar and box+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45487, name: "mod: bootstrap+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45489, name: "mod: bootstrap+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45469, name: "mod: carrierwave+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45471, name: "mod: carrierwave+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45491, name: "mod: comment+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45459, name: "mod: edit+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45461, name: "mod: edit+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45495, name: "mod: follow+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45497, name: "mod: follow+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45438, name: "mod: format+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45440, name: "mod: format+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45449, name: "mod: help+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45467, name: "mod: history+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45503, name: "mod: layout+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45505, name: "mod: layout+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45442, name: "mod: list+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45444, name: "mod: list+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45447, name: "mod: permissions+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45507, name: "mod: recaptcha+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45455, name: "mod: rules+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45457, name: "mod: rules+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45451, name: "mod: search+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45453, name: "mod: search+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45481, name: "mod: style+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45500, name: "mod: tabs+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45510, name: "mod: tinymce editor+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45512, name: "mod: tinymce editor+*style", helpClass: "mod-child", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000043", id: 49305, name: "mod: account+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000043.jsonl" },
  { phase: "000043", id: 49309, name: "mod: shades+*script", helpClass: "mod-child", shard: "recapture-raw-shard-000043.jsonl" },];
