// The Card::Content::Diff engine: TypeScript port of card-1.110.0
// lib/card/content/diff.rb (+ diff/l_c_s.rb, diff/l_c_s/processor.rb,
// diff/result.rb, diff/summary.rb) and the diff-lcs-1.6.2 subset the
// processor drives (Diff::LCS::Internals.lcs + Diff::LCS.traverse_balanced
// over word ARRAYS - the string fast paths never run here because the
// processor always hands arrays).
//
// Consumers: the card-mod-history html views (action_summary/action_expanded
// diffs, the act header's name/type diffs) and the legends
// (render_added_chunk / render_deleted_chunk, diff.rb:16-21).
//
// Byte contracts this port reproduces: summary ellipsis/truncation ("..."),
// cut_with_joint
// (" with inclusion {{History Probe R..."), the all-added create diff, and
// the name diff `<ins class='diffins diff-added'> Renamed</ins>`.

/** diff.rb:16-18. */
export function renderAddedChunk(text: string): string {
  return `<ins class='diffins diff-added'>${text}</ins>`;
}

/** diff.rb:20-21 (the second param `_count=true` is unread). */
export function renderDeletedChunk(text: string): string {
  return `<del class='diffdel diff-deleted'>${text}</del>`;
}

/** diff.rb:29-35 - `:format => :html|:text|:pointer|:raw` plus the summary
 *  opts `{length:, joint:}`. HISTORY_DIFF_ARGS pins diff_format :text; the
 *  name/cardtype diffs pass NO opts -> the `else` :raw branch
 *  (differ.rb:74-76 diff_object(field, opts) with opts {}). */
export interface ContentDiffOptions {
  diffFormat?: "html" | "text" | "pointer" | "raw";
  summary?: { length?: number; joint?: string };
}

// ---------------------------------------------------------------------------
// diff/summary.rb - the Summary object
// ---------------------------------------------------------------------------

type SummaryAction = "added" | "deleted" | "ellipsis" | string;

interface SummaryChunk {
  action: SummaryAction;
  text: string;
}

/** summary.rb:5-132 - verbatim algorithm, including the JOINT_REPLACEMENT
 *  `:ellipis` typo (summary.rb:120) which lands in render_chunk's else
 *  branch and emits the joint bytes UNSTYLED. */
export class DiffSummary {
  private remainingChars: number;
  private readonly joint: string;
  private readonly chunks: SummaryChunk[] = [];
  private contentOmitted: boolean | undefined;
  private renderedCache: string | undefined;

  constructor(opts?: { length?: number; joint?: string }) {
    this.remainingChars = opts?.length ?? 50;
    this.joint = opts?.joint ?? "...";
  }

  /** summary.rb:13-15 (@rendered ||= render). */
  get rendered(): string {
    if (this.renderedCache === undefined) this.renderedCache = this.render();
    return this.renderedCache;
  }

  add(text: string): void {
    this.addChunk(text, "added");
  }

  delete(text: string): void {
    this.addChunk(text, "deleted");
  }

  /** summary.rb:25-29. */
  omit(): void {
    if (this.chunks.length === 0 || this.chunks[this.chunks.length - 1]!.action !== "ellipsis") {
      this.addChunk(this.joint, "ellipsis");
    }
  }

  /** summary.rb:31-33 - reads the raw state exactly like Ruby: the
   *  @content_omitted flag is only set by render(), so callers must render
   *  the summary first (the action flow does: actions.rb:51-56 content_diff
   *  reads diff.present? before actions.rb:64-66 checks the toggle). */
  omitsContent(): boolean {
    return this.contentOmitted === true || this.remainingChars < 0;
  }

  /** summary.rb:37-43. */
  private render(): string {
    this.truncateOverlap();
    const out = this.chunks.map((chunk) => {
      if (chunk.action === "ellipsis") this.contentOmitted = true;
      return this.renderChunk(chunk.action, chunk.text);
    });
    return out.join("");
  }

  /** summary.rb:45-50. */
  private addChunk(text: string, action: SummaryAction): void {
    if (this.remainingChars <= 0) return;
    this.chunks.push({ action, text });
    this.remainingChars -= text.length;
  }

  /** summary.rb:56-64 ("+", :added / "-", :deleted / else text as-is). */
  private renderChunk(action: SummaryAction, text: string): string {
    if (action === "+" || action === "added") return renderAddedChunk(text);
    if (action === "-" || action === "deleted") return renderDeletedChunk(text);
    return text;
  }

  /** summary.rb:66-72. */
  private truncateOverlap(): void {
    if (this.remainingChars >= 0) return;
    this.processEllipsis();
    let index = this.chunks.length - 1;
    while (this.processRemaining(index)) {
      if (this.processOverlap(index)) break;
      index -= 1;
    }
  }

  /** summary.rb:74-80 - `process_overlap(index) ? break : (index -= 1)
   *  while process_remaining? index`. */
  private processRemaining(index: number): boolean {
    return this.remainingChars < this.joint.length && index >= 0;
  }

  /** summary.rb:86-92. */
  private processEllipsis(): void {
    if (this.chunks[this.chunks.length - 1]?.action !== "ellipsis") return;
    this.chunks.pop();
    this.contentOmitted = true;
    this.remainingChars += this.joint.length;
  }

  /** summary.rb:94-100. */
  private processOverlap(index: number): boolean {
    if (this.overlapFinished(index)) return true;
    this.remainingChars += this.chunks[index]!.text.length;
    this.chunks.splice(index, 1);
    return false;
  }

  /** summary.rb:102-112. */
  private overlapFinished(index: number): boolean {
    const overlapSize = this.remainingChars + this.chunks[index]!.text.length;
    if (overlapSize === this.joint.length) {
      this.replaceWithJoint(index);
    } else if (overlapSize > this.joint.length) {
      this.cutWithJoint(index);
    } else {
      return false;
    }
    return true;
  }

  /** summary.rb:114-118: `chunk[0..(@remaining_chars - @joint.size - 1)]` -
   *  the negative-end Ruby range (end counted from the string end). The
   *  reachable cases guarantee the chunk is longer than the cut, so the
   *  Ruby nil result (range start past the string) cannot occur. */
  private cutWithJoint(index: number): void {
    // Ruby 0..(remaining - joint - 1) is END-INCLUSIVE: str[0..-14] keeps
    // length - 14 + 1 chars.
    const cutEndFromEnd = -(this.remainingChars - this.joint.length - 1);
    this.chunks[index]!.text =
      this.chunks[index]!.text.slice(0, this.chunks[index]!.text.length - cutEndFromEnd + 1) +
      this.joint;
  }

  /** summary.rb:120-128 (JOINT_REPLACEMENT verbatim, typo included). */
  private replaceWithJoint(index: number): void {
    this.chunks.pop();
    if (index <= 0) return;
    const previousAction = this.chunks[index - 1]!.action;
    const replacement =
      previousAction === "added" ? "ellipis" : previousAction === "deleted" ? "added" : undefined;
    if (replacement === undefined) return;
    this.chunks.push({ action: replacement, text: this.joint });
  }
}

// ---------------------------------------------------------------------------
// diff/result.rb
// ---------------------------------------------------------------------------

/** result.rb:4-45. */
export class DiffResult {
  complete = "";
  delsCnt = 0;
  addsCnt = 0;
  private readonly summaryObj: DiffSummary;

  constructor(summaryOpts?: { length?: number; joint?: string }) {
    this.summaryObj = new DiffSummary(summaryOpts);
  }

  get summary(): string {
    return this.summaryObj.rendered;
  }

  get summaryOmitsContent(): boolean {
    return this.summaryObj.omitsContent();
  }

  writeAddedChunk(text: string): void {
    this.addsCnt += 1;
    this.complete += renderAddedChunk(text);
    this.summaryObj.add(text);
  }

  writeDeletedChunk(text: string): void {
    this.delsCnt += 1;
    this.complete += renderDeletedChunk(text);
    this.summaryObj.delete(text);
  }

  writeUnchangedChunk(text: string): void {
    this.complete += text;
    this.summaryObj.omit();
  }

  writeExcludedChunk(text: string): void {
    this.complete += text;
  }
}

// ---------------------------------------------------------------------------
// diff-lcs-1.6.2 - the subset the processor drives
// ---------------------------------------------------------------------------

/** One internals.rb links entry: [previous link or null, a index, b index]. */
type Link = [Link | null, number, number];

/** internals.rb:298-306 position_hash over an array (the string fast path
 *  never runs - the processor hands arrays). */
function positionHash(seq: string[], start: number, finish: number): Map<string, number[]> {
  const hash = new Map<string, number[]>();
  for (let i = start; i <= finish; i++) {
    const key = seq[i]!;
    const list = hash.get(key);
    if (list === undefined) hash.set(key, [i]);
    else list.push(i);
  }
  return hash;
}

/** internals.rb:252-278 replace_next_larger. */
function replaceNextLarger(enum_: number[], value: number, lastIndex: number | undefined): number | null {
  if (enum_.length === 0 || value > enum_[enum_.length - 1]!) {
    enum_.push(value);
    return enum_.length - 1;
  }
  let last = lastIndex ?? enum_.length - 1;
  let first = 0;
  while (first <= last) {
    const i = (first + last) >> 1;
    const found = enum_[i]!;
    if (value === found) return null;
    if (value > found) first = i + 1;
    else last = i - 1;
  }
  enum_[first] = value;
  return first;
}

/** internals.rb:41-93 lcs - the match vector (vector[i] = the b index a[i]
 *  matches, sparse). */
function lcsVector(a: string[], b: string[]): (number | undefined)[] {
  let aStart = 0;
  let bStart = 0;
  let aFinish = a.length - 1;
  let bFinish = b.length - 1;
  const vector: (number | undefined)[] = [];

  while (aStart <= aFinish && bStart <= bFinish && a[aStart] === b[bStart]) {
    vector[aStart] = bStart;
    aStart += 1;
    bStart += 1;
  }
  while (aStart <= aFinish && bStart <= bFinish && a[aFinish] === b[bFinish]) {
    vector[aFinish] = bFinish;
    aFinish -= 1;
    bFinish -= 1;
  }

  const bMatches = positionHash(b, bStart, bFinish);
  const thresh: number[] = [];
  const links: (Link | undefined)[] = [];

  for (let i = aStart; i <= aFinish; i++) {
    const ai = a[i]!;
    const bm = bMatches.get(ai);
    let k: number | null = null;
    if (bm !== undefined) {
      for (let r = bm.length - 1; r >= 0; r--) {
        const j = bm[r]!;
        if (k !== null && thresh[k]! > j && thresh[k - 1]! < j) {
          thresh[k] = j;
        } else {
          k = replaceNextLarger(thresh, j, k ?? undefined);
        }
        if (k !== null) {
          links[k] = [k > 0 ? links[k - 1] ?? null : null, i, j] as Link;
        }
      }
    }
  }

  if (thresh.length > 0) {
    let link = links[thresh.length - 1];
    while (link !== undefined) {
      vector[link[1]] = link[2];
      // link[0] IS the previous link (internals.rb:88-91: link = link[0])
      link = link[0] ?? undefined;
    }
  }
  return vector;
}

/** One traverse_balanced event (ContextChange): action "=", "-", "+", "!"
 *  with the old/new elements. */
export interface LcsEvent {
  action: "=" | "-" | "+" | "!";
  oldElement: string | undefined;
  newElement: string | undefined;
}

/** lcs.rb:476-560 traverse_balanced over arrays with the block form (the
 *  default BalancedCallbacks are no-ops; the Processor's block does the
 *  work). */
export function traverseBalanced(seq1: string[], seq2: string[], fn: (event: LcsEvent) => void): void {
  const matches = lcsVector(seq1, seq2);
  const aSize = seq1.length;
  const bSize = seq2.length;
  let ai = 0;
  let bj = 0;
  let mb = 0;
  let ma = -1;

  const at = (seq: string[], i: number): string | undefined => seq[i];

  for (;;) {
    for (;;) {
      ma += 1;
      if (!(ma < matches.length && matches[ma] === undefined)) break;
    }
    if (ma >= matches.length) break;
    mb = matches[ma]!;

    while (ai < ma || bj < mb) {
      const ax = at(seq1, ai);
      const bx = at(seq2, bj);
      if (ai < ma && bj < mb) {
        fn({ action: "!", oldElement: ax, newElement: bx });
        ai += 1;
        bj += 1;
      } else if (ai < ma) {
        fn({ action: "-", oldElement: ax, newElement: bx });
        ai += 1;
      } else {
        fn({ action: "+", oldElement: ax, newElement: bx });
        bj += 1;
      }
    }

    fn({ action: "=", oldElement: at(seq1, ai), newElement: at(seq2, bj) });
    ai += 1;
    bj += 1;
  }

  while (ai < aSize || bj < bSize) {
    const ax = at(seq1, ai);
    const bx = at(seq2, bj);
    if (ai < aSize && bj < bSize) {
      fn({ action: "!", oldElement: ax, newElement: bx });
      ai += 1;
      bj += 1;
    } else if (ai < aSize) {
      fn({ action: "-", oldElement: ax, newElement: bx });
      ai += 1;
    } else {
      fn({ action: "+", oldElement: ax, newElement: bx });
      bj += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// diff/l_c_s.rb + diff/l_c_s/processor.rb
// ---------------------------------------------------------------------------

/** l_c_s.rb:15 - the word splitters. */
const SPLITTERS = ["<[^>]+>", "\\[\\[[^\\]]+\\]\\]", "\\{\\{[^}]+\\}\\}", "\\s+"];

function escapeHtmlRuby(word: string): string {
  // CGI.escapeHTML: & " ' < >
  return word
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** l_c_s.rb:65-70 split_and_preprocess: split keeping the separator tokens,
 *  drop empties, apply the :text reject pattern, then the preprocess. */
function splitAndPreprocess(
  text: string,
  opts: { reject?: RegExp; preprocess?: (word: string) => string },
): string[] {
  const splitRegex = new RegExp(`(${SPLITTERS.join("|")})`, "g");
  let pieces = text.split(splitRegex);
  // Ruby's String#split drops trailing empty strings (JS keeps them).
  while (pieces.length > 0 && pieces[pieces.length - 1] === "") pieces.pop();
  pieces = pieces.filter((s) => s !== "" && (opts.reject === undefined || !opts.reject.test(s)));
  const preprocess = opts.preprocess;
  return preprocess !== undefined ? pieces.map((s) => preprocess(s)) : pieces;
}

/** l_c_s.rb:55-69 lcs_opts_for_format. */
interface LcsOpts {
  reject?: RegExp;
  exclude?: RegExp;
  preprocess?: (word: string) => string;
  postprocess?: (text: string) => string;
}

function lcsOptsForFormat(diffFormat: ContentDiffOptions["diffFormat"]): LcsOpts {
  const opts: LcsOpts = {};
  switch (diffFormat) {
    case "html":
      opts.exclude = /^</;
      break;
    case "text":
      opts.reject = /^</;
      opts.postprocess = (word) => word.replace(/\n/g, "<br>");
      break;
    case "pointer":
      opts.preprocess = (word) => word.replace(/\[\[/g, "").replace(/\]\]/g, "<br>");
      break;
    default: // :raw (also the no-format default)
      opts.preprocess = escapeHtmlRuby;
      break;
  }
  return opts;
}

/** processor.rb:124-161 ExcludeeIterator (inert for :text - no exclude
 *  pattern - but ported for the :html branch parity). */
class ExcludeeIterator {
  private index = 0;
  private chunkIndex = 0;

  constructor(private readonly list: { chunkIndex: number; element: string; type: "disjunction" | "excludee" }[]) {}

  wordStep(): void {
    this.chunkIndex += 1;
  }

  next(): { chunkIndex: number; element: string; type: "disjunction" | "excludee" } | undefined {
    if (this.index < this.list.length && this.list[this.index]!.chunkIndex === this.chunkIndex) {
      const res = this.list[this.index]!;
      this.index += 1;
      this.chunkIndex += 1;
      return res;
    }
    return undefined;
  }

  scanAndRecord(recordArray: string[], yieldFn: (element: string) => void): void {
    for (;;) {
      const ex = this.next();
      if (ex === undefined) break;
      if (ex.type === "disjunction") recordArray.push(ex.element);
      else yieldFn(ex.element);
    }
  }
}

/** l_c_s.rb:42-63 separate_comparables_from_excludees. */
function separateComparablesFromExcludees(
  text: string,
  opts: LcsOpts,
): { words: string[]; excludees: { chunkIndex: number; element: string; type: "disjunction" | "excludee" }[] } {
  const list = splitAndPreprocess(text, opts);
  if (opts.exclude === undefined) return { words: list, excludees: [] };
  const words: string[] = [];
  const excludees: { chunkIndex: number; element: string; type: "disjunction" | "excludee" }[] = [];
  const disjunction = /^\s/;
  list.forEach((element, index) => {
    if (disjunction.test(element)) excludees.push({ chunkIndex: index, element, type: "disjunction" });
    else if (opts.exclude!.test(element)) excludees.push({ chunkIndex: index, element, type: "excludee" });
    else words.push(element);
  });
  return { words, excludees };
}

/** processor.rb:8-121. */
class DiffProcessor {
  private adds: string[] = [];
  private dels: string[] = [];
  private readonly excludees: { old: ExcludeeIterator; new: ExcludeeIterator };

  constructor(
    private readonly result: DiffResult,
    oldWords: string[],
    newWords: string[],
    oldEx: { chunkIndex: number; element: string; type: "disjunction" | "excludee" }[],
    newEx: { chunkIndex: number; element: string; type: "disjunction" | "excludee" }[],
  ) {
    this.excludees = { old: new ExcludeeIterator(oldEx), new: new ExcludeeIterator(newEx) };
    this.oldWords = oldWords;
    this.newWords = newWords;
  }

  private readonly oldWords: string[];
  private readonly newWords: string[];

  run(): DiffResult {
    let prevAction: string | null = null;
    traverseBalanced(this.oldWords, this.newWords, (event) => {
      this.processWord(event, prevAction);
      prevAction = event.action;
    });
    this.writeAll();
    return this.result;
  }

  private processWord(event: LcsEvent, prevAction: string | null): void {
    if (prevAction !== null) this.interpretAction(prevAction, event.action);
    else this.writeExcludees();
    this.processElement(event);
  }

  private interpretAction(prevActn: string, wordActn: string): void {
    if (this.handleActionP(wordActn, prevActn)) this.handleAction(wordActn);
    else this.writeAll();
  }

  /** processor.rb:37-41. */
  private handleActionP(wordAction: string, prevAction: string): boolean {
    return (
      prevAction === wordAction ||
      (prevAction === "-" && wordAction === "!") ||
      (prevAction === "!" && wordAction === "+")
    );
  }

  private handleAction(action: string): void {
    if (action === "-") this.delOldExcludees();
    else if (action === "+") this.addNewExcludees();
    else if (action === "!") {
      this.delOldExcludees();
      this.addNewExcludees();
    } else {
      this.writeExcludees();
    }
  }

  private writeAll(): void {
    this.writeDels();
    this.writeAdds();
    this.writeExcludees();
  }

  private writeDels(): void {
    if (this.dels.length === 0) return;
    this.result.writeDeletedChunk(this.dels.join(""));
    this.dels = [];
  }

  private writeAdds(): void {
    if (this.adds.length === 0) return;
    this.result.writeAddedChunk(this.adds.join(""));
    this.adds = [];
  }

  private writeExcludees(): void {
    for (;;) {
      const ex = this.excludees.new.next();
      if (ex === undefined) break;
      this.result.writeExcludedChunk(ex.element);
    }
  }

  private delOldExcludees(): void {
    this.excludees.old.scanAndRecord(this.dels, (element) => {
      this.writeDels();
      this.result.writeExcludedChunk(element);
    });
  }

  private addNewExcludees(): void {
    this.excludees.new.scanAndRecord(this.adds, (element) => {
      this.writeAdds();
      this.result.complete += element;
    });
  }

  private processElement(event: LcsEvent): void {
    switch (event.action) {
      case "-":
        this.minus(event.oldElement!);
        break;
      case "+":
        this.plus(event.newElement!);
        break;
      case "!":
        this.minus(event.oldElement!);
        this.plus(event.newElement!);
        break;
      default:
        this.result.writeUnchangedChunk(event.newElement!);
        this.excludees.new.wordStep();
        break;
    }
  }

  private plus(newElement: string): void {
    this.adds.push(newElement);
    this.excludees.new.wordStep();
  }

  private minus(oldElement: string): void {
    this.dels.push(oldElement);
    this.excludees.old.wordStep();
  }
}

// ---------------------------------------------------------------------------
// diff.rb:6-72 - the Diff facade
// ---------------------------------------------------------------------------

/** Card::Content::Diff. Construct with (old, new, opts); `new_version` nil
 *  skips the walk entirely (diff.rb:39 - the result stays empty). */
export class ContentDiff {
  readonly result: DiffResult;
  private readonly lcsOpts: LcsOpts;

  constructor(
    oldVersion: string | null | undefined,
    newVersion: string | null | undefined,
    opts: ContentDiffOptions = {},
  ) {
    this.result = new DiffResult(opts.summary);
    this.lcsOpts = lcsOptsForFormat(opts.diffFormat);
    if (newVersion === null || newVersion === undefined) return;
    this.run(oldVersion, newVersion);
  }

  static complete(a: string | null | undefined, b: string, opts: ContentDiffOptions = {}): string {
    return new ContentDiff(a, b, opts).complete;
  }

  static summary(a: string | null | undefined, b: string, opts: ContentDiffOptions = {}): string {
    return new ContentDiff(a, b, opts).summary;
  }

  get complete(): string {
    // diff.rb:42 - the :text postprocess runs on the COMPLETE diff only
    // (l_c_s.rb:21-23; the summary never postprocesses - l_c_s.rb:36-37).
    const post = this.lcsOpts.postprocess;
    return post !== undefined ? post(this.result.complete) : this.result.complete;
  }

  get summary(): string {
    return this.result.summary;
  }

  get summaryOmitsContent(): boolean {
    return this.result.summaryOmitsContent;
  }

  get red(): boolean {
    return this.result.delsCnt > 0;
  }

  get green(): boolean {
    return this.result.addsCnt > 0;
  }

  private run(oldText: string | null | undefined, newText: string): void {
    if (oldText !== null && oldText !== undefined) {
      const oldSide = separateComparablesFromExcludees(oldText, this.lcsOpts);
      const newSide = separateComparablesFromExcludees(newText, this.lcsOpts);
      new DiffProcessor(this.result, oldSide.words, newSide.words, oldSide.excludees, newSide.excludees).run();
    } else {
      // l_c_s.rb:33-39 - the no-old case: everything added (no exclude
      // filtering - the exclude branch is :html-only), no postprocess on
      // the summary side.
      const list = splitAndPreprocess(newText, this.lcsOpts);
      this.result.writeAddedChunk(list.join(""));
    }
    // l_c_s.rb:22 - `@result.complete = postprocess @result.complete` ran
    // at run end in Ruby; the port applies it lazily in the complete getter
    // (single postprocess, same bytes).
  }
}

