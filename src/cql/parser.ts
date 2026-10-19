/**
 * CQL parser: CQL statement (JSON-ish hash or shorthand) -> QueryNode AST.
 *
 * Interpretation runs in three stages, and the section markers below follow
 * them: NORMALIZATION turns a raw clause into a normalized hash (clauses that
 * are not objects become `{ id: ... }`, `$vars` are substituted, relative
 * names are absolutized against the query context); DISPATCH routes each
 * normalized key by its attribute class (basic / relational / plus_relational
 * / conjunction / custom / ignored / deprecated); and RELATIONAL, CONJUNCTION,
 * TIE and MATCH sections below build the subqueries those routes ask for.
 *
 * Nothing here touches the database — the parser's whole job is to produce a
 * QueryNode tree that src/cql/sql.ts can render. That separation is what lets
 * a statement be re-rendered for a paging count with different mods.
 */

import {
  ConditionNode,
  CqlBadQuery,
  Fasten,
  JoinNode,
  Mods,
  ParseOptions,
  QueryKind,
  QueryNode,
} from "./ast.js";
import {
  CARD_ACTIONS_TABLE,
  CARD_ACTS_TABLE,
  CARD_REFERENCES_TABLE,
  CARDS_TABLE,
  CONJUNCTIONS,
  MATCH_FIELD,
  MODIFIERS,
  OPERATORS,
  REFERENCE_ATTRIBUTES,
  SORT_BY_ITEM_JOIN_MAP,
  SQL_FIELD,
  TABLE_PREFIX,
} from "./constants.js";
import {
  absolutizeName,
  assertSimpleValue,
  defaultNameToKey,
  NEEDS_ABSOLUTIZE_RE,
  parseMatchTermAndPrefix,
  safeSql,
} from "./normalize.js";

/**
 * Every attribute key CQL understands, grouped by how interpretation routes
 * it. A key not in this table is a bad query.
 */
const ATTRIBUTE_LISTS = {
  basic: [
    "id",
    "name",
    "key",
    "type_id",
    "content",
    "left_id",
    "right_id",
    "codename",
    "read_rule_id",
    "created_at",
    "updated_at",
    "creator_id",
    "updater_id",
  ],
  relational: [
    "type",
    "part",
    "left",
    "right",
    "editor_of",
    "edited_by",
    "last_editor_of",
    "last_edited_by",
    "creator_of",
    "created_by",
    "updater_of",
    "updated_by",
    "link_to",
    "linked_to_by",
    "include",
    "included_by",
    "nest",
    "nested_by",
    "refer_to",
    "referred_to_by",
    "member_of",
    "member",
    "found_by",
    "not",
    "sort",
    "match",
    "name_match",
    "complete",
  ],
  plus_relational: ["plus", "left_plus", "right_plus"],
  conjunction: ["and", "or", "all", "any"],
  custom: ["compound"],
  ignore: ["prepend", "append", "vars"],
  deprecated: ["view", "params", "size"],
} as const;

type AttributeType = keyof typeof ATTRIBUTE_LISTS;

const ATTRIBUTES: Record<string, AttributeType> = {};
(Object.entries(ATTRIBUTE_LISTS) as [AttributeType, readonly string[]][]).forEach(
  ([type, keys]) => keys.forEach((key) => (ATTRIBUTES[key] = type)),
);

/** Keys whose values are card-reference lists eligible for the id-set
 *  shortcut below rather than a subquery. */
const ID_LIST_KEY_RE = /^(refer|nest|include|link|member)/;

interface ParsedValue {
  op: string;
  values: Array<string | number | null>;
}

type AttributeHandler = (query: QueryNode, val: unknown) => void;

export function parseCql(statement: unknown, options: ParseOptions = {}): QueryNode {
  return new CqlParser(options).parse(statement);
}

class CqlParser {
  private tableSeq = 0;
  private vars: Record<string, string | number | null | undefined>;
  private readonly nameToKey: (name: string) => string;
  private readonly onWarning?: (message: string) => void;
  private readonly parents = new WeakMap<QueryNode, QueryNode | null>();
  private rootNode: QueryNode | null = null;

  constructor(private readonly opts: ParseOptions) {
    this.vars = opts.vars ?? {};
    this.onWarning = opts.onWarning;
    this.nameToKey = opts.nameToKey ?? defaultNameToKey;
  }

  parse(statement: unknown): QueryNode {
    const root = this.newQuery("card", {}, null);
    this.rootNode = root;

    if (isPlainObject(statement)) {
      const hash = { ...statement };

      // The root query's own instance state: context, superquery, fasten,
      // negate. vars and table_suffix are root-only and consumed here.
      const context = takeKey(hash, "context");
      takeKey(hash, "superquery");
      takeKey(hash, "fasten");
      takeKey(hash, "negate");
      const vars = takeKey(hash, "vars");
      takeKey(hash, "table_suffix");
      root.context = context !== undefined ? String(context) : this.opts.context ?? "";
      if (vars !== undefined && isPlainObject(vars)) {
        this.vars = vars as Record<string, string | number | null | undefined>;
      }

      // prepend/append are read after the SQL has run, by result shaping.
      // Interpretation ignores them but carries them through for that caller.
      const prepend = takeKey(hash, "prepend");
      const append = takeKey(hash, "append");
      root.statementExtras = {
        prepend: prepend === undefined ? undefined : String(prepend),
        append: append === undefined ? undefined : String(append),
      };

      this.interpret(root, hash);
    } else {
      // A bare Integer or String is shorthand for `{ id: ... }`.
      root.context = this.opts.context ?? "";
      this.interpret(root, statement);
    }
    return root;
  }

  // ---- query construction (node + table alias) ----

  private newQuery(
    kind: QueryKind,
    args: { fasten?: Fasten; negate?: boolean; conj?: string },
    parent: QueryNode | null,
  ): QueryNode {
    const table =
      kind === "card"
        ? CARDS_TABLE
        : kind === "reference"
          ? CARD_REFERENCES_TABLE
          : kind === "action"
            ? CARD_ACTIONS_TABLE
            : CARD_ACTS_TABLE;
    const fasten = args.fasten ?? (parent ? this.inheritFasten(parent) : "join");
    const node: QueryNode = {
      kind,
      table,
      // fasten :direct shares the superquery's alias; otherwise
      // "#{table_prefix}#{root.table_seq}" with a shared counter
      tableAlias:
        fasten === "direct" && parent ? parent.tableAlias : `${TABLE_PREFIX[table]}${this.tableSeq++}`,
      fasten,
      negate: args.negate ?? false,
      conj: args.conj ?? "and",
      context: parent ? parent.context : "",
      conditions: [],
      joins: [],
      subqueries: [],
      conditionsOnJoin: false,
      mods: {},
      statementExtras: {},
    };
    this.parents.set(node, parent);
    return node;
  }

  /** Inherit the fasten mode from the nearest ancestor that has one: a direct
 *  superquery never carries its own mode to pass down. */
  private inheritFasten(parent: QueryNode): Fasten {
    let node: QueryNode | null = parent;
    while (node !== null && node.fasten === "direct") node = this.parents.get(node) ?? null;
    return node === null ? "join" : node.fasten;
  }

  // ---- normalization ----

  /** Coerce a clause to a hash, then normalize every value in it. `return`
   *  is passed through untouched — it is a view spec, not a card value. */
  private interpret(query: QueryNode, clause: unknown): void {
    let hash: Record<string, unknown>;
    if (isPlainObject(clause)) {
      hash = clause;
    } else if (typeof clause === "number" && Number.isInteger(clause)) {
      hash = { id: clause };
    } else if (typeof clause === "string") {
      // A bare String is an id lookup; -2 is the "unresolved" sentinel.
      hash = { id: this.opts.resolveCardId?.(clause) ?? -2 };
    } else {
      throw new CqlBadQuery(`Invalid clause: ${inspect(clause)}`);
    }
    for (const [key, val] of Object.entries(hash)) {
      this.interpretItem(query, key, key === "return" ? val : this.normalizeValue(val, query.context));
    }
  }

  private normalizeValue(val: unknown, context: string): unknown {
    if (typeof val === "string") return this.normalizeStringValue(val, context);
    if (Array.isArray(val)) return val.map((v) => this.normalizeValue(v, context));
    // Numbers, booleans, nil and nested objects pass through as-is.
    if (val === null || typeof val === "number" || typeof val === "boolean" || isPlainObject(val)) {
      return val;
    }
    throw new CqlBadQuery(`Invalid value type: ${typeof val} (${inspect(val)})`);
  }

  /** A whole-string `$name` substitutes the variable's value, trimmed; a
   *  value carrying a contextual marker is absolutized against the context. */
  private normalizeStringValue(val: string, context: string): string {
    const varMatch = /^\$(\w+)$/.exec(val);
    if (varMatch) {
      // A missing var is an empty string, not an error.
      const raw = this.vars[varMatch[1] ?? ""];
      return String(raw ?? "").trim();
    }
    if (NEEDS_ABSOLUTIZE_RE.test(val)) {
      return absolutizeName(val, context, this.onWarning);
    }
    return val;
  }

  // ---- interpretation dispatch ----

  private interpretItem(query: QueryNode, key: string, val: unknown): void {
    // An operator key that is not an attribute becomes a content condition.
    // "match" is the one name that is both, and it routes to the attribute
    // handler instead.
    if (key in OPERATORS && !ATTRIBUTES[key]) {
      this.addCondition(query, "content", this.buildValue([key, this.normalizeValue(val, query.context)]));
      return;
    }
    // A modifier key with a non-Hash value is a mod, not an attribute clause.
    if ((MODIFIERS as readonly string[]).includes(key) && !isPlainObject(val)) {
      this.interpretModifier(query, key, val);
      return;
    }
    this.interpretAttributes(query, key, val);
  }

  /** Mod values are stringified; an array stays an array. */
  private interpretModifier(query: QueryNode, key: string, val: unknown): void {
    const mods: Mods = query.mods;
    const list = Array.isArray(val) ? val.map(String) : [String(val)];
    switch (key) {
      case "conj":
        // The effective conjunction is kept on the node itself, since every
        // later join decision reads it from there.
        query.conj = String(val);
        break;
      case "return":
        mods.return = String(val);
        break;
      case "index":
        mods.index = String(val);
        break;
      case "sort_by":
        mods.sortBy = list;
        break;
      case "sort_as":
        mods.sortAs = String(val);
        break;
      case "sort_dir":
        mods.sortDir = list;
        break;
      case "sort":
        mods.sort = list;
        break;
      case "dir":
        mods.dir = list;
        break;
      case "group":
        mods.group = String(val);
        break;
      case "limit":
        mods.limit = String(val);
        break;
      case "offset":
        mods.offset = String(val);
        break;
    }
  }

  private interpretAttributes(query: QueryNode, key: string, val: unknown): void {
    const type = ATTRIBUTES[key];
    if (!type) {
      throw new CqlBadQuery(`Invalid attribute: ${key}`);
    }
    switch (type) {
      case "basic":
        this.addCondition(query, key, this.buildValue(val));
        break;
      case "relational":
        this.relate(query, key, val);
        break;
      case "plus_relational":
        this.relateCompound(query, key, val);
        break;
      case "conjunction":
        // bare "in" never reaches here (operator-key interception)
        this.conjoin(query, val, CONJUNCTIONS[key] ?? "and");
        break;
      case "custom":
        // `compound` is a raw null test on left_id, optionally negated.
        query.conditions.push({ kind: "raw", sql: `left_id IS ${val ? "NOT " : ""}NULL` });
        break;
      case "ignore":
        break;
      case "deprecated":
        this.onWarning?.(`Card queries no longer support ${key} attribute`);
        break;
    }
  }

  // ---- values ----

  /** Turn a raw attribute value into an operator plus its operands. */
  private buildValue(rawvalue: unknown): ParsedValue {
    if (Array.isArray(rawvalue)) {
      return this.parseArrayValue(rawvalue);
    }
    if (rawvalue === null) {
      return { op: "is", values: [null] };
    }
    return { op: "=", values: [assertSimpleValue(rawvalue)] };
  }

  /** An array value leads with an optional operator word. */
  private parseArrayValue(array: unknown[]): ParsedValue {
    const rest = [...array];
    let op = "in";
    if (typeof rest[0] === "string" && rest[0] in OPERATORS) {
      op = OPERATORS[rest.shift() as string];
    }
    const values = rest.flat(Infinity).map((v) => assertSimpleValue(v));
    this.canonicalizeOperator(op);
    return { op, values };
  }

  /** Every operator the tables can produce must be one SQL can render. */
  private canonicalizeOperator(op: string): void {
    if (!Object.values(OPERATORS).includes(op)) {
      throw new CqlBadQuery(`Invalid operator: ${op}`);
    }
  }

  /** Attach a parsed value to the query, choosing the match shape or the
   *  plain value shape. */
  private addCondition(query: QueryNode, field: string, value: ParsedValue): void {
    if (value.op === "~") {
      // MatchValue: term parsed from the joined values; field stays the
      // physical column (match on name hits the `name` column, not `key`)
      const rawTerm = value.values.map((v) => (v === null ? "" : String(v))).join(" ");
      const { prefix, term } = parseMatchTermAndPrefix(rawTerm);
      query.conditions.push({
        kind: "match",
        cqlField: field,
        field: field in MATCH_FIELD ? MATCH_FIELD[field] : this.standardizeField(field),
        term,
        termKey: this.nameToKey(term),
        prefix,
      });
      return;
    }
    query.conditions.push({
      kind: "value",
      field: this.standardizeField(field),
      op: value.op,
      values: this.standardizeValues(field, value.op, value.values),
    });
  }

  /**
   * Values of a `name` condition are mapped to key form ("Joe Admin" ->
   * "joe_admin") for every operator except match, which keeps its own
   * mapping because it also matches against content.
   */
  private standardizeValues(
    field: string,
    op: string,
    values: Array<string | number | null>,
  ): Array<string | number | null> {
    if (field === "name" && op !== "~") {
      return values.map((v) =>
        v === null ? null : this.nameToKey(String(v)),
      );
    }
    return values;
  }

  /** Map a CQL field name to its physical column, refusing unsafe names. */
  private standardizeField(field: string): string {
    return field in SQL_FIELD ? SQL_FIELD[field] : safeSql(field);
  }

  // ---- relational dispatch ----

  private relate(query: QueryNode, key: string, val: unknown, opts?: { multiple?: boolean }): void {
    const multiple = opts?.multiple ?? Array.isArray(val);
    if (multiple) {
      this.relateMultiValue(query, key, val as unknown[]);
    } else {
      this.relationalHandler(key)(query, val);
    }
  }

  /** A plus_relational value is multi-valued only when it really is — an array
   *  of values, or one that leads with a conjunction word. */
  private relateCompound(query: QueryNode, key: string, val: unknown): void {
    const hasMultipleValues =
      Array.isArray(val) &&
      (Array.isArray(val[0]) || (typeof val[0] === "string" && val[0] in CONJUNCTIONS));
    this.relate(query, key, val, { multiple: hasMultipleValues });
  }

  /** Fan a multi-valued relational attribute out. A leading conjunction word
   *  picks how the remaining values combine: the same conjunction as the
   *  query is ANDed straight into this query's conditions, a different one
   *  becomes a subquery. */
  private relateMultiValue(query: QueryNode, key: string, val: unknown[]): void {
    const items = [...val];
    let conj = "and";
    if (typeof items[0] === "string" && items[0] in CONJUNCTIONS) {
      conj = CONJUNCTIONS[items.shift() as string];
    }
    if (this.asListOfIds(conj, key, items)) {
      this.relate(query, key, items, { multiple: false });
    } else if (conj === query.conj) {
      for (const item of items) this.relationalHandler(key)(query, item);
    } else {
      this.conjoin(query, items.map((item) => ({ [key]: item })), conj);
    }
  }

  private asListOfIds(conj: string, key: string, val: unknown[]): boolean {
    return conj === "or" && ID_LIST_KEY_RE.test(key) && this.listOfIds(val);
  }

  /** Every value resolves to an id. */
  private listOfIds(val: unknown[]): boolean {
    return val.every((v) => this.idFromVal(v) !== null);
  }

  /** Resolve one value to a card id, or null when it is not id-able. An
   *  unresolvable name gets -999, the never-matching sentinel. */
  private idFromVal(val: unknown): number | null {
    if (typeof val === "number" && Number.isInteger(val)) return val;
    if (typeof val === "string") return this.opts.resolveCardId?.(val) ?? -999;
    return null;
  }

  // ---- relational attributes ----

  private relationalHandler(key: string): AttributeHandler {
    const handler = this.relationalHandlers[key];
    if (!handler) {
      throw new CqlBadQuery(`Invalid attribute: ${key}`);
    }
    return handler;
  }

  private readonly relationalHandlers: Record<string, AttributeHandler> = {
    // Attributes whose value restricts a card column directly.
    type: (q, val) => this.restrict(q, "type_id", val),
    left: (q, val) => this.restrict(q, "left_id", val),
    right: (q, val) => this.restrict(q, "right_id", val),
    last_edited_by: (q, val) => this.restrict(q, "updater_id", val),
    created_by: (q, val) => this.restrict(q, "creator_id", val),

    part: (q, val) => {
      // `part: X` means left is X OR right is X.
      this.relationalHandlers.any(q, { left: val, right: val });
    },

    editor_of: (q, val) => this.tieAct(q, "action_on", val),
    updater_of: (q, val) => this.tieAct(q, "update_action_on", val),
    edited_by: (q, val) => this.tieAction(q, "action_by", val),
    updated_by: (q, val) => this.tieAction(q, "update_action_by", val),
    last_editor_of: (q, val) => this.tie(q, "card", val, { to: "updater_id" }),
    creator_of: (q, val) => this.tie(q, "card", val, { to: "creator_id" }),

    left_plus: (q, val) => this.junction(q, val, "left", "right_id"),
    right_plus: (q, val) => this.junction(q, val, "right", "left_id"),
    plus: (q, val) => {
      this.relationalHandlers.any(q, { left_plus: val, right_plus: val });
    },

    // Grouping attributes; "and"/"or" are aliases for "all"/"any".
    all: (q, val) => this.conjoin(q, val, "and"),
    and: (q, val) => this.conjoin(q, val, "and"),
    any: (q, val) => this.conjoin(q, val, "or"),
    or: (q, val) => this.conjoin(q, val, "or"),

    not: (q, val) => {
      // `not: X` is a negated tie on card id.
      this.tie(q, "card", val, { from: "id", to: "id" }, { negate: true });
    },

    // The three match attributes.
    match: (q, val) => this.matchAttribute(q, val),
    complete: (q, val) => this.completeAttribute(q, val),
    name_match: (q, val) => this.nameMatchAttribute(q, val),

    // Reference attributes, generated from the REFERENCE_ATTRIBUTES table.
    ...Object.fromEntries(
      Object.entries(REFERENCE_ATTRIBUTES).map(([name, spec]) => [
        name,
        (query: QueryNode, val: unknown) => {
          this.tie(
            query,
            "reference",
            { [spec.refMethod]: { reftype: spec.reftypes, card: val } },
            { to: spec.refField },
          );
        },
      ]),
    ),

    member_of: (q, val) => {
      // `member_of: X` is membership expressed as an inbound reference.
      this.interpret(q, { referred_to_by: { left: val, right: { codename: "members" } } });
    },
    member: (q, val) => {
      // `member` needs the role card's id, resolved from its codename.
      const roleId = this.opts.resolveCodename?.("role");
      if (roleId === undefined || roleId === null) {
        throw new CqlBadQuery(
          "member requires codename resolution (Card::RoleID); provide ParseOptions.resolveCodename (deferred)",
        );
      }
      this.interpret(q, {
        type_id: roleId,
        right_plus: [{ codename: "members" }, { refer_to: val }],
      });
    },

    found_by: (q, val) => {
      // The value rides to execution: execute.ts's resolveFoundByConditions
      // resolves the target card's own statement and translates it to the
      // id-set constraint. Interpretation only records it.
      q.conditions.push({ kind: "foundBy", value: val });
    },

    sort: (q, val) => this.sortAttribute(q, val),
  };

  /** Restrict a card column: an id-able value becomes a condition, anything
   *  else ties a subquery. */
  private restrict(query: QueryNode, idField: string, val: unknown): void {
    const id = this.idFromVal(val);
    if (id !== null) {
      this.addCondition(query, idField, { op: "=", values: [id] });
    } else {
      this.tie(query, "card", val, { from: idField });
    }
  }

  private tieAct(query: QueryNode, action: string, val: unknown): void {
    this.tie(query, "act", { [action]: val }, { to: "actor_id" });
  }

  private tieAction(query: QueryNode, action: string, val: unknown): void {
    this.tie(query, "action", { [action]: val }, { to: "card_id" });
  }

  /** A junction ties a subquery that must satisfy the part clause and, when
   *  given, a second junction clause. */
  private junction(query: QueryNode, val: unknown, side: string, field: string): void {
    const [partClause, junctionClause] = Array.isArray(val) ? [val[0], val[1] ?? {}] : [val, {}];
    // The junction clause is normalized, then the part clause is merged in on
    // its own side. The part wins when the junction clause uses that same
    // side key.
    const merged = {
      ...this.interpretToHash(junctionClause, query.context),
      [side]: partClause,
    };
    this.tie(query, "card", merged, { to: field });
  }

  // ---- conjunctions ----

  private conjoin(query: QueryNode, val: unknown, conj: string): void {
    const sub = this.newQuery("card", { fasten: "direct", conj }, query);
    query.subqueries.push(sub);
    // A single Hash value conjoins as its own key/value pairs.
    const items = Array.isArray(val)
      ? val
      : Object.entries(this.interpretToHash(val, query.context)).map(([k, v]) => ({ [k]: v }));
    for (const item of items) {
      this.interpret(sub, item);
    }
  }

  // ---- ties ----

  private tie(
    query: QueryNode,
    kind: QueryKind,
    val: unknown,
    fields: { from?: string; to?: string },
    args: { fasten?: Fasten; negate?: boolean } = {},
  ): QueryNode {
    const sub = this.newQuery(kind, args, query);
    query.subqueries.push(sub);
    this.interpretSubqueryClause(sub, val);
    const mergedFields = { from: "id", to: "id", ...fields };

    switch (sub.fasten) {
      case "join": {
        // An OR-conjoined or negated tie must be a LEFT join: an inner join would
        // drop the outer rows that have no match.
        const side: "LEFT" | undefined = query.conj === "or" || sub.negate ? "LEFT" : undefined;
        const join: JoinNode = {
          side,
          fromAlias: query.tableAlias,
          fromField: mergedFields.from,
          toTable: sub.table,
          toAlias: sub.tableAlias,
          toField: mergedFields.to,
          to: sub,
        };
        if (sub.negate) {
          // A negated join puts its conditions in the ON clause and adds
          // an is-null test on the superquery — that is what makes the
          // negation survive the join.
          sub.conditionsOnJoin = true;
          query.conditions.push({
            kind: "raw",
            sql: `${sub.tableAlias}.${mergedFields.to} is null`,
          });
        }
        query.joins.push(join);
        break;
      }
      case "in":
        // An "in" tie becomes a subselect: its return becomes the compared
        // field, and the in-field is remembered for the WHERE walk.
        sub.mods.return = mergedFields.to;
        sub.mods.inField = `${query.tableAlias}.${mergedFields.from}`;
        break;
      case "exist":
        // An "exist" tie needs nothing here; it renders from the subqueries walk.
        break;
      case "direct":
        // conditions render through the subqueries walk; joins hoist at render
        break;
    }
    return sub;
  }

  // ---- per-kind clause interpretation for subqueries ----
  // Reference, action and act subqueries each accept their own clause keys;
  // card subqueries use the regular interpretation.

  private interpretSubqueryClause(query: QueryNode, clause: unknown): void {
    if (query.kind === "card") {
      this.interpret(query, clause);
      return;
    }
    const hash = isPlainObject(clause) ? clause : {};
    for (const [key, val] of Object.entries(hash)) {
      if (query.kind === "reference") {
        this.interpretReferenceKey(query, key, val);
      } else if (query.kind === "action") {
        this.interpretActionKey(query, key, val);
      } else {
        this.interpretActKey(query, key, val);
      }
    }
  }

  private interpretReferenceKey(query: QueryNode, key: string, val: unknown): void {
    // `referer`/`referee` become conditions on referer_id/referee_id.
    const outfield = key === "referer" ? "referer_id" : key === "referee" ? "referee_id" : null;
    if (!outfield || !isPlainObject(val)) {
      throw new CqlBadQuery(`Invalid attribute: ${key}`);
    }
    const reftype = val["reftype"];
    const card = val["card"];
    // A single reftype is an equality; several are an IN.
    if (reftype !== undefined && reftype !== null && reftype !== "") {
      const letters = (Array.isArray(reftype) ? reftype : [reftype]).map(String);
      query.conditions.push({
        kind: "value",
        field: "ref_type",
        op: letters.length === 1 ? "=" : "IN",
        values: letters,
      });
    }
    this.addOutfieldCondition(query, outfield, card);
  }

  /** Constrain one side of the reference: `_none` tests absence, an id-able
   *  card becomes a condition, anything else ties a subquery. */
  private addOutfieldCondition(query: QueryNode, outfield: string, outcard: unknown): void {
    const idOp = this.opAndIdOrIdsFromVal(outcard);
    if (outcard === "_none") {
      // `_none` is spelled as an explicit not-present marker.
      query.conditions.push({ kind: "value", field: "is_present", op: "=", values: [0] });
    } else if (idOp) {
      // An id-able value constrains the column directly.
      query.conditions.push({ kind: "value", field: outfield, op: idOp.op, values: idOp.ids });
    } else {
      this.tie(query, "card", outcard, { from: outfield });
    }
  }

  /** The operator and ids a value implies, or null when it is not (a list of)
   *  ids and therefore needs a subquery. */
  private opAndIdOrIdsFromVal(val: unknown): { op: string; ids: number[] } | null {
    const single = this.idFromVal(val);
    if (single !== null) return { op: "=", ids: [single] };
    if (Array.isArray(val) && this.listOfIds(val)) {
      return { op: "in", ids: val.map((v) => this.idFromVal(v) as number) };
    }
    return null;
  }

  private interpretActionKey(query: QueryNode, key: string, val: unknown): void {
    switch (key) {
      case "action_by":
        this.tie(query, "act", { act_by: val }, { from: "card_act_id" });
        break;
      case "update_action_by":
        this.addUpdateCondition(query);
        this.tie(query, "act", { act_by: val }, { from: "card_act_id" });
        break;
      case "action_on":
        this.tie(query, "card", val, { from: "card_id" });
        break;
      case "update_action_on":
        this.addUpdateCondition(query);
        this.tie(query, "card", val, { from: "card_id" });
        break;
      default:
        throw new CqlBadQuery(`Invalid attribute: ${key}`);
    }
  }

  /** "last edited by" means the update action specifically — action_type 1. */
  private addUpdateCondition(query: QueryNode): void {
    query.conditions.push({ kind: "raw", sql: `${query.tableAlias}.action_type = 1` });
  }

  private interpretActKey(query: QueryNode, key: string, val: unknown): void {
    switch (key) {
      case "action_on":
        this.tie(query, "action", { action_on: val }, { to: "card_act_id" });
        break;
      case "update_action_on":
        this.tie(query, "action", { update_action_on: val }, { to: "card_act_id" });
        break;
      case "act_by":
        this.tie(query, "card", val, { from: "actor_id" });
        break;
      default:
        throw new CqlBadQuery(`Invalid attribute: ${key}`);
    }
  }

  // ---- match attributes ----

  /** `match: X` is an OR over name and content. */
  private matchAttribute(query: QueryNode, val: unknown): void {
    // Blank values (false, "", null) contribute no condition.
    if (val === null || val === undefined || val === "" || val === false) return;
    const conditions: ConditionNode[] = (["name", "content"] as const).map((field) => {
      const parsed = this.buildValue(["match", val]);
      const rawTerm = parsed.values.map((v) => (v === null ? "" : String(v))).join(" ");
      const { prefix, term } = parseMatchTermAndPrefix(rawTerm);
      return {
        kind: "match" as const,
        cqlField: field,
        field: MATCH_FIELD[field],
        term,
        termKey: this.nameToKey(term),
        prefix,
      };
    });
    query.conditions.push({ kind: "group", conj: "or", conditions });
  }

  /** `name_match: X` is the name-only half of `match`, still excluding
   *  nameless cards. */
  private nameMatchAttribute(query: QueryNode, val: unknown): void {
    if (val !== null && val !== undefined && val !== "" && val !== false) {
      this.addCondition(query, "name", this.buildValue(["match", val]));
    }
    this.nameNotNull(query);
  }

  /** `complete: X` is a prefix match on the key; a compound name recurses
   *  into each of its parts. */
  private completeAttribute(query: QueryNode, val: unknown): void {
    const name = String(val);
    if (name.includes("+")) {
      // A compound name splits at the last joint; the left side is matched as
      // written and the right side recurses.
      const parts = name.split("+");
      const left = parts.slice(0, -1).join("+");
      const right = parts.at(-1) ?? "";
      this.interpret(query, { left });
      if (right !== "") {
        this.interpret(query, { right: { complete: right } });
      }
      return;
    }
    if (name !== "") {
      query.conditions.push({ kind: "like", field: "key", value: this.nameToKey(name) });
    }
    this.nameNotNull(query);
  }

  /** Every name-match attribute excludes nameless (compound) cards. */
  private nameNotNull(query: QueryNode): void {
    query.conditions.push({ kind: "raw", sql: `${query.tableAlias}.key IS NOT NULL` });
  }

  // ---- sorting ----

  /** A query is "full" when it is the root and is not asking for a count. */
  private isFull(query: QueryNode): boolean {
    return this.rootNode === query && query.mods.return !== "count";
  }

  /** The `sort` attribute with a Hash value. */
  private sortAttribute(query: QueryNode, val: unknown): void {
    if (!this.isFull(query)) return; // eg, no sorting on simple count queries
    if (!isPlainObject(val)) {
      throw new CqlBadQuery(`Invalid clause: ${inspect(val)}`);
    }
    // "item" names the join side and "return" the sort column; both are
    // consumed here and the rest is interpreted as the join's clause.
    const spec = { ...val };
    const item = spec["item"] !== undefined ? String(spec["item"]) : "left";
    const sortField = spec["return"] !== undefined ? String(spec["return"]) : "db_content";
    delete spec["item"];
    delete spec["return"];

    if (sortField === "count") {
      // Ruby Sorting#sort_by_count_referred_to (sorting.rb:57-69) — the ONE
      // experimental count sort the gemset ships (sorting.rb:51 marks it
      // "EXPERIMENTAL!"; :10-14 warns the subquery-sort syntax is likely to
      // change). sort_by_count (sorting.rb:52-55) dispatches
      // sort_by_count_<item>; only referred_to responds — every other item
      // raises "sorting by #count/<item> not yet implemented"
      // (sort_method_not_implemented, :57-59).
      if (item !== "referred_to") {
        throw new CqlBadQuery(`sorting by #count/${item} not yet implemented`);
      }
      // count_subselect (sorting.rb:79-81): the val clause runs as an id
      // subquery (return: "id", superquery: self — relative values inherit
      // this query's context). The subselect renders inside the derived
      // table the join builds (sql.ts renderJoin's countSortSubquery case);
      // it is NOT a WHERE subquery of its own.
      const sub = this.newQuery("card", {}, query);
      this.interpret(sub, spec);
      sub.mods.return = "id"; // count_subselect's val.merge(return: "id")
      // join_count_sort_query (sorting.rb:71-77): the outer query LEFT
      // JOINs the grouped count under the literal alias srtbl on
      // sort_join_field, and the order field is "coalesce(count,0)"
      // (sorting.rb:58) — unqualified exactly as Ruby renders it, resolving
      // to the joined count column (the Oracle "needed for postgres"
      // coalesce reads NULL join rows as 0).
      query.mods.sortBy = ["coalesce(count,0)"];
      query.joins.push({
        side: "LEFT",
        fromAlias: query.tableAlias,
        fromField: "id",
        toTable: CARD_REFERENCES_TABLE,
        toAlias: "srtbl",
        toField: "sort_join_field",
        countSortSubquery: sub,
      });
      return;
    }
    const joinField = SORT_BY_ITEM_JOIN_MAP[item];
    if (!joinField) {
      // A guard, not a deferral: every join item this module supports is
      // in the map above. The one non-join sort — by count — took its own
      // arm above (only item referred_to implements it, as in Ruby).
      throw new CqlBadQuery(`sorting by #join/${item} not yet implemented`);
    }
    // The join is always a LEFT join whose conditions ride in the ON
    // clause, so rows with no sort partner survive the join.
    const sub = this.newQuery("card", {}, query);
    query.subqueries.push(sub);
    const join: JoinNode = {
      side: "LEFT",
      fromAlias: query.tableAlias,
      fromField: "id",
      toTable: CARDS_TABLE,
      toAlias: sub.tableAlias,
      toField: joinField,
      to: sub,
    };
    query.joins.push(join);
    sub.conditionsOnJoin = true;
    this.interpret(sub, spec);
    if (!query.mods.sortBy) {
      query.mods.sortBy = [`${sub.tableAlias}.${sortField}`];
    }
  }

  /** clause_to_hash without the interpret loop (used by junction/conjoin) */
  private interpretToHash(clause: unknown, context: string): Record<string, unknown> {
    if (isPlainObject(clause)) {
      const normalized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(clause)) {
        normalized[key] = key === "return" ? val : this.normalizeValue(val, context);
      }
      return normalized;
    }
    if (typeof clause === "number" && Number.isInteger(clause)) return { id: clause };
    if (typeof clause === "string") return { id: this.opts.resolveCardId?.(clause) ?? -2 };
    throw new CqlBadQuery(`Invalid clause: ${inspect(clause)}`);
  }
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function takeKey(hash: Record<string, unknown>, key: string): unknown {
  const val = hash[key];
  delete hash[key];
  return val;
}

function inspect(val: unknown): string {
  try {
    return JSON.stringify(val) ?? String(val);
  } catch {
    return String(val);
  }
}
