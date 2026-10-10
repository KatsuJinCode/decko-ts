// raw-corpus-escape-family-pages.ts -- the escape/encoding family subset,
// pinned for the escape-family sweep
// (raw-corpus-escape-family-page-sweep.test.ts).
//
// PROVENANCE. The 82 rows are exactly the entries an earlier page-fail
// triage (WORK_DIR/pass15-page-fail-classes.md,
// 2026-09-29) booked under the four escape/encoding primary classes at the
// graded tip 017b182: byte-family:double-escape (58),
// byte-family:quote-style (9), byte-family:attr-target-placement (11),
// byte-family:html-entity-escape (4). Per-entry evidence: an earlier
// fail-dump JSONLs (decko-ts-pass15-int tmp/fail-dump/); each row carries
// the oracle page-lane shard file its id lives in
// (tmp/raw-ground-truth/expected-v2/page-lane/).
//
// The ports that touched this surface BEFORE base 71eb7e1
// already flip part of the class: census-tail2 (9d334ea) fixed the two
// wikilink external emitters' attribute order (attr-target class) and the
// plain_text core CGI.escapeHTML branch (entity-escape class). The sweep
// therefore measures flips against the 71eb7e1 base, not 017b182.

export interface EscapeFamilyEntry {
  phase: string;
  id: number;
  name: string;
  /** the triage's primary class the page was booked under */
  escapeClass: 'double-escape' | 'quote-style' | 'attr-target' | 'entity-escape';
  /** the oracle page-lane shard file holding the entry */
  shard: string;
}

export const ESCAPE_FAMILY_PAGE_SUBSET: EscapeFamilyEntry[] = [
  { phase: "000000", id: 472, name: "Epworth UMC Berkeley", escapeClass: "attr-target", shard: "recapture-raw-shard-000000.jsonl" },
  { phase: "000000", id: 755, name: "Martial Nonviolence+Pages", escapeClass: "double-escape", shard: "recapture-raw-shard-000000.jsonl" },
  { phase: "000000", id: 665, name: "Paula Craig", escapeClass: "double-escape", shard: "recapture-raw-shard-000000.jsonl" },
  { phase: "000001", id: 1812, name: "Carol Swann", escapeClass: "attr-target", shard: "recapture-raw-shard-000001.jsonl" },
  { phase: "000001", id: 1861, name: "Werkshop Museum", escapeClass: "quote-style", shard: "recapture-raw-shard-000001.jsonl" },
  { phase: "000002", id: 2844, name: "David K Weinstock", escapeClass: "quote-style", shard: "recapture-raw-shard-000002.jsonl" },
  { phase: "000002", id: 3179, name: "Montessori Council - benefits", escapeClass: "double-escape", shard: "recapture-raw-shard-000002.jsonl" },
  { phase: "000002", id: 2928, name: "Ms Paula writing poetry and other creations", escapeClass: "double-escape", shard: "recapture-raw-shard-000002.jsonl" },
  { phase: "000002", id: 2985, name: "Paula Craig+musings", escapeClass: "double-escape", shard: "recapture-raw-shard-000002.jsonl" },
  { phase: "000002", id: 3475, name: "Richard Page", escapeClass: "attr-target", shard: "recapture-raw-shard-000002.jsonl" },
  { phase: "000004", id: 8460, name: "Mikko's Blog+*self", escapeClass: "double-escape", shard: "recapture-raw-shard-000004.jsonl" },
  { phase: "000005", id: 9271, name: "Paula Craig - Father's Day+*self", escapeClass: "double-escape", shard: "recapture-raw-shard-000005.jsonl" },
  { phase: "000005", id: 9653, name: "Steven Goldin", escapeClass: "quote-style", shard: "recapture-raw-shard-000005.jsonl" },
  { phase: "000006", id: 10113, name: "Mikko's Blog+*self+*layout", escapeClass: "double-escape", shard: "recapture-raw-shard-000006.jsonl" },
  { phase: "000006", id: 11081, name: "What Americans Keep Ignoring About Finland's School Success", escapeClass: "double-escape", shard: "recapture-raw-shard-000006.jsonl" },
  { phase: "000007", id: 11251, name: "IT'S ALL ABOUT ANGELS by Paula Craig", escapeClass: "double-escape", shard: "recapture-raw-shard-000007.jsonl" },
  { phase: "000007", id: 12250, name: "Windows - JS", escapeClass: "quote-style", shard: "recapture-raw-shard-000007.jsonl" },
  { phase: "000007", id: 12195, name: "media+GBA+youtube videos", escapeClass: "double-escape", shard: "recapture-raw-shard-000007.jsonl" },
  { phase: "000008", id: 12591, name: "Charles Red Hawk Thom", escapeClass: "attr-target", shard: "recapture-raw-shard-000008.jsonl" },
  { phase: "000009", id: 13573, name: "Aurora Shooting 201200720 ABC GMA Justin Davis", escapeClass: "double-escape", shard: "recapture-raw-shard-000009.jsonl" },
  { phase: "000009", id: 13455, name: "VBS TV staff - Lonely carnage abounds in Japan's suicide forest", escapeClass: "double-escape", shard: "recapture-raw-shard-000009.jsonl" },
  { phase: "000011", id: 16520, name: "Paula Craig - Pure Love", escapeClass: "quote-style", shard: "recapture-raw-shard-000011.jsonl" },
  { phase: "000011", id: 16517, name: "Paula Craig - The Easter Egg", escapeClass: "quote-style", shard: "recapture-raw-shard-000011.jsonl" },
  { phase: "000011", id: 16525, name: "Paula Craig - To Huston - Easter 2013", escapeClass: "quote-style", shard: "recapture-raw-shard-000011.jsonl" },
  { phase: "000012", id: 16585, name: "*css+*self+*help", escapeClass: "attr-target", shard: "recapture-raw-shard-000012.jsonl" },
  { phase: "000012", id: 17450, name: "*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000012.jsonl" },
  { phase: "000013", id: 17849, name: "20131018+CM+RVW+Plans", escapeClass: "entity-escape", shard: "recapture-raw-shard-000013.jsonl" },
  { phase: "000013", id: 18560, name: "Kimberly Richardson", escapeClass: "entity-escape", shard: "recapture-raw-shard-000013.jsonl" },
  { phase: "000013", id: 18210, name: "Taylor - Krampus: Saint Nicholas' Dark Companion", escapeClass: "double-escape", shard: "recapture-raw-shard-000013.jsonl" },
  { phase: "000013", id: 18294, name: "mythoclasm", escapeClass: "entity-escape", shard: "recapture-raw-shard-000013.jsonl" },
  { phase: "000015", id: 19928, name: "Don't Send Your Kid to the Ivy League", escapeClass: "entity-escape", shard: "recapture-raw-shard-000015.jsonl" },
  { phase: "000015", id: 19707, name: "I'd be more inclined to support the pro side...", escapeClass: "double-escape", shard: "recapture-raw-shard-000015.jsonl" },
  { phase: "000016", id: 21757, name: "*on create", escapeClass: "double-escape", shard: "recapture-raw-shard-000016.jsonl" },
  { phase: "000016", id: 21765, name: "*on delete", escapeClass: "double-escape", shard: "recapture-raw-shard-000016.jsonl" },
  { phase: "000016", id: 21761, name: "*on update", escapeClass: "double-escape", shard: "recapture-raw-shard-000016.jsonl" },
  { phase: "000016", id: 21610, name: "John O'Connell", escapeClass: "double-escape", shard: "recapture-raw-shard-000016.jsonl" },
  { phase: "000017", id: 21944, name: "Free Aiki Dojo and Golden Bears Aikido training schedule - week of 2014 11 24", escapeClass: "attr-target", shard: "recapture-raw-shard-000017.jsonl" },
  { phase: "000018", id: 23595, name: "Jordan Warman", escapeClass: "attr-target", shard: "recapture-raw-shard-000018.jsonl" },
  { phase: "000021", id: 26844, name: "Don't Wait For The Study", escapeClass: "attr-target", shard: "recapture-raw-shard-000021.jsonl" },
  { phase: "000024", id: 30074, name: "Roundtable+How To Connect+discussion", escapeClass: "attr-target", shard: "recapture-raw-shard-000024.jsonl" },
  { phase: "000025", id: 30526, name: "Depth Psychology and Somatics--Learning Frontiers", escapeClass: "quote-style", shard: "recapture-raw-shard-000025.jsonl" },
  { phase: "000025", id: 30533, name: "Depth Psychology and Somatics--Learning Frontiers+discussion", escapeClass: "quote-style", shard: "recapture-raw-shard-000025.jsonl" },
  { phase: "000025", id: 31311, name: "Joni Mitchell - Turbulent Indigo - The Sire of Sorrow Job's Sad Song", escapeClass: "double-escape", shard: "recapture-raw-shard-000025.jsonl" },
  { phase: "000026", id: 31367, name: "Rebecca Solnit: Whose Story (and Country) Is This? ON THE MYTH OF A \"REAL\" AMERICA", escapeClass: "double-escape", shard: "recapture-raw-shard-000026.jsonl" },
  { phase: "000032", id: 37957, name: "TSYR Mythology Denki RFP - Karl Garrison", escapeClass: "double-escape", shard: "recapture-raw-shard-000032.jsonl" },
  { phase: "000033", id: 38978, name: "TSYR+Q_A_with_Takamura_Yukioshi", escapeClass: "double-escape", shard: "recapture-raw-shard-000033.jsonl" },
  { phase: "000039", id: 45129, name: "Kayla Feder 20230902", escapeClass: "attr-target", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45465, name: "mod: account+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45476, name: "mod: ace editor+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45479, name: "mod: api key+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45483, name: "mod: bar and box+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45485, name: "mod: bar and box+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45487, name: "mod: bootstrap+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45489, name: "mod: bootstrap+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45469, name: "mod: carrierwave+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45471, name: "mod: carrierwave+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45491, name: "mod: comment+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45459, name: "mod: edit+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45461, name: "mod: edit+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45495, name: "mod: follow+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45497, name: "mod: follow+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45438, name: "mod: format+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45440, name: "mod: format+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45449, name: "mod: help+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45467, name: "mod: history+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45503, name: "mod: layout+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45505, name: "mod: layout+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45442, name: "mod: list+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45444, name: "mod: list+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45447, name: "mod: permissions+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45507, name: "mod: recaptcha+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45455, name: "mod: rules+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45457, name: "mod: rules+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45451, name: "mod: search+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45453, name: "mod: search+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45481, name: "mod: style+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45500, name: "mod: tabs+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45510, name: "mod: tinymce editor+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000039", id: 45512, name: "mod: tinymce editor+*style", escapeClass: "double-escape", shard: "recapture-raw-shard-000039.jsonl" },
  { phase: "000043", id: 49677, name: "Conflict Done Well+WE Greiner", escapeClass: "attr-target", shard: "recapture-raw-shard-000043.jsonl" },
  { phase: "000043", id: 49305, name: "mod: account+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000043.jsonl" },
  { phase: "000043", id: 49309, name: "mod: shades+*script", escapeClass: "double-escape", shard: "recapture-raw-shard-000043.jsonl" },
];
