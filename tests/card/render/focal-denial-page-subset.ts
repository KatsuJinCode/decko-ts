// focal-denial-page-subset.ts -- the focal (loud) denial page census
// population: a fixed, deterministic sample of the expected-v2 page-lane
// entries whose oracle page renders the read-denied MAIN card as the loud
// denial frame (the "-denial-view" slot class, html/error.rb:83-85
// `focal? ? loud_denial : quiet_denial`).
//
// The corpus holds 3,069 such pages (every page-lane entry whose
// page_html carries the denial-view main slot; all Default Layout,
// 12.9-13.2 KB — the frame dominates the page). This module pins a
// stratified slice across the corpus' name families (capped per family so
// the repeated "…+BW+Time Tracking" / "…+BW+RVW" journal junctions cannot
// crowd out other shapes) plus the perm-leak triage's two named exemplars,
// which are the KNOWN BOUNDARY of this suite: they are the
// denial-wrapper-leak class (prepare-render verdict timing, the
// lane-perm-leak / lane-perm-allow territory — prefetch.ts chunking +
// ensurePermissionVerdicts + the page.ts call), not the page-layer
// presentation contract this suite proves. They ride the report-only census
// so the flip is visible once the verdict-timing port merges.

/** The loud-denial exemplars the HARD block byte-compares (typical class:
 *  the denial frame fires when the main verdict resolves at sync-render
 *  time — these pages' closures do not trip the prepare-crash class). */
export const FOCAL_DENIAL_EXEMPLARS: Array<{ name: string; id: number }> = [
  { name: "ABCglobal 20100722 Iris Nick Leon Brandon", id: 1177 },
  { name: "Azzia Zur", id: 1345 },
  { name: "BW 20100704 Itdepends Day", id: 870 },
  { name: "20260412+BW+Time Tracking", id: 52658 },
];

/** Readable pages from the same capture (no denial frame in the oracle):
 *  the over-deny control — the port must keep rendering their bodies and
 *  must not start denying them. */
export const READABLE_CONTROLS: Array<{ name: string; id: number }> = [
  { name: "Brandon WilliamsCraig", id: 393 },
  { name: "the reference deck", id: 637 },
  { name: "Martial Nonviolence", id: 577 },
];

/** The report-only census: 42 stratified loud-denial pages + the two
 *  perm-leak exemplars (boundary: true). Deterministic picks from the
 *  3,069-entry class — every ~n-th page-lane loud entry with at most 6 per
 *  name family, spanning shards 0-47. */
export const FOCAL_DENIAL_CENSUS_SUBSET: Array<{
  name: string;
  id: number;
  boundary?: boolean;
}> = [
  { name: "ABCglobal 20100722 Iris Nick Leon Brandon", id: 1177 },
  { name: "rename", id: 719 },
  { name: "Lost - thoughts", id: 1424 },
  { name: "BW 20110109", id: 3361 },
  { name: "*now", id: 4036 },
  { name: "BW 20110629", id: 4147 },
  { name: "Living in Spin", id: 10042 },
  { name: "Aiki Development Group", id: 10239 },
  { name: "BW 20111106", id: 10388 },
  { name: "SGo Training Journal 20111021", id: 10190 },
  { name: "20120418+BW+RVW", id: 12399 },
  { name: "20120712+BW+Time Tracking", id: 13347 },
  { name: "20120815+BW+Time Tracking", id: 14179 },
  { name: "20120926+BW+Time Tracking", id: 14707 },
  { name: "20121023+BW+Time Tracking", id: 15233 },
  { name: "20121129+BW+Time Tracking", id: 15688 },
  { name: "20121224+BW+Time Tracking", id: 15948 },
  { name: "20130430+BW+RVW", id: 16695 },
  { name: "Pontual Dissertation", id: 17068 },
  { name: "20140131+BW+RVW", id: 18747 },
  { name: "20140409+BW+RVW", id: 19287 },
  { name: "20141027+BW+RVW", id: 21685 },
  {
    name: "MNv+ITM+Preliminary Exercises+2-2 Preparing the Bodymind+2-2-3 Go - Stop (Hajime - Yame)",
    id: 21337,
  },
  { name: "Holland Service", id: 22475 },
  { name: "20150609+BW+RVW", id: 23492 },
  { name: "MNv leadership training - Flight Deck 20150521", id: 23369 },
  { name: "Spa Finder gift certificate use", id: 25749 },
  { name: "Social Media Schedule converted to Google Sheet", id: 26828 },
  { name: "Martha Eddy connection", id: 27562 },
  { name: "RWE TFD Comm Gen Admin", id: 29231 },
  { name: "WilliamsCraig+Family Business+Financial+FTB", id: 30062 },
  { name: "USABP Presentation 20181102", id: 31223 },
  { name: "Jesuit Dallas Teaching Position", id: 31719 },
  { name: "Essilor Manager Corporate Partnerships", id: 32713 },
  { name: "The Center for American and International Law - President", id: 32689 },
  { name: "St Marks Upper School History and English Teacher", id: 33973 },
  {
    name: "Deloitte-Senior Manager-Enabling Areas Learning and Development E20NATSSRMJM101-HRL6",
    id: 34901,
  },
  { name: "WilliamsCraig+Family Business+Financial+TWC", id: 36154 },
  { name: "US Census Employment+Clerk+Grievance", id: 36855 },
  { name: "Create PM paper slips and print", id: 37751 },
  { name: "USPS Employment", id: 39755 },
  { name: "Ireland 20220731-0807", id: 41774 },
  { name: "20120122+BW+RVW", id: 11179, boundary: true },
  { name: "BW 20111201", id: 10623, boundary: true },
];
