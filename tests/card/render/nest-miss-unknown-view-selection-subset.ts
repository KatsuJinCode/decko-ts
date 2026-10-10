/**
 * The p20-nest-selection port's page population: the 34 pages of the
 * an earlier pass c-structural class whose mechanism is the nest-selection
 * disagreement (mm-cstructural receipt §4 #2 missing-slot / #3
 * phantom-slot — WORK_DIR/mm-cstructural-lane.md).
 *
 * 19 Project pages missing the `+discussion` titled-view slot; 2 BWjournal
 * pages missing seven mini_bar slots each; 10 Research pages with a phantom
 * `+Articles` open nest; 3 outliers (2 HTML `*head` pages, 1 Pointer Notes
 * page). Every entry was verified against an earlier triage
 * ( tmp/cstruct-index/triage.json) — the slot
 * ids named here are the exact card-slot ids the two sides disagreed on.
 */
export const NEST_MISS_PAGE_SUBSET: readonly string[] = [
  // missing-slot, Project cardtype (19): the +discussion titled-view
  "Associative Inquiry",
  "Center for Embodied Change",
  "the reference deck",
  "Healing Friction",
  "NXDD",
  "Nonviolent Peaceforce",
  "Online Learning",
  "Peace Training Project",
  "AsIn Project Management Training",
  "Guardians of Peace",
  "Earth House Center",
  "Peoplegreen",
  "Open Source Aikido Lab",
  "AVX",
  "CodePink",
  "Family Support Network",
  "Center for Story-based Strategies",
  "Earthlandia Thought Experiment",
  "Champagne Hughes+training",
  // missing-slot, journal cardtype (2): seven mini_bar slots inside +body
  "CM 20100717 Sat",
  "CM_20100526_ReferenceDeck_Notes_born",
  // phantom-slot, Research cardtype (10): the +Articles open nest
  "Diddly Squat",
  "death and bereavement",
  "self as such",
  "Police State USA",
  "GIV-the god of intimate violence",
  "NSAID",
  "aikido+political",
  "Democratic Socialism",
  "ecosystem",
  "July 4th",
  // phantom-slot outliers (3)
  "*all+*head",
  "PCTS+*self+*head",
  "Learning Pool+training+Notes",
];
