/**
 * The page subset whose nest-selection disagreement this suite pins:
 * pages missing a `+discussion` titled-view slot (Project cardtype),
 * pages missing seven mini_bar slots each inside +body (journal
 * cardtype), pages with a phantom `+Articles` open nest (Research
 * cardtype), and three outliers (2 HTML `*head` pages, 1 Pointer Notes
 * page). The slot ids named in the consuming test are the exact
 * card-slot ids the two sides disagreed on.
 */
export const NEST_MISS_PAGE_SUBSET: readonly string[] = [
  // missing-slot, Project cardtype (19): the +discussion titled-view
  "Associative Inquiry",
  "Center for Systems Change",
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
  "Sample Card 081",
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
  "fieldwork+political",
  "Democratic Socialism",
  "ecosystem",
  "July 4th",
  // phantom-slot outliers (3)
  "*all+*head",
  "ZQVT+*self+*head",
  "Practice Pool+training+Notes",
];
