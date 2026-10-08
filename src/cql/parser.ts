/**
 * CQL parser: CQL statement (JSON-ish hash or shorthand) -> QueryNode AST.
 *
 * A line-by-line port of card-1.110.0 interpretation:
 *   lib/card/query.rb                          (attribute/operator tables)
 *   lib/card/query/card_query/normalization.rb (clause/value normalization)
 *   lib/card/query/card_query/interpretation.rb (dispatch)
 *   lib/card/query/card_query/{relational,reference,match}_attributes.rb
 *   lib/card/query/card_query/{conjunctions,custom,sorting,found_by}.rb
 *   lib/card/query/abstract_query{,/query_helper,/tie}.rb
 *   lib/card/query/{value,value/match_value}.rb
 * Each ported behavior cites its Ruby method.
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
 * query.rb Card::Query @attributes — key -> attribute type, built with the
 * exact membership lists of the Ruby hash.
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

/** Interpretation#as_list_of_ids? key prefix */
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

      // AbstractQuery#initialize — init_instance_vars :context, :superquery,
      // :fasten, :negate; init_root_vars consumes vars/table_suffix (root only)
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

      // Run#alter_results? reads statement[:prepend]/[:append] after SQL has
      // run; they are ignored keys for interpretation but kept for callers.
      const prepend = takeKey(hash, "prepend");
      const append = takeKey(hash, "append");
      root.statementExtras = {
        prepend: prepend === undefined ? undefined : String(prepend),
        append: append === undefined ? undefined : String(append),
      };

      this.interpret(root, hash);
    } else {
      // shorthand clause (Integer/String) -> { id: ... } via clause_to_hash
      root.context = this.opts.context ?? "";
      this.interpret(root, statement);
    }
    return root;
  }

  // ---- query construction (AbstractQuery#initialize + QueryHelper#table_alias) ----

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

  /** Tie#inherit_fasten: skip :direct superqueries */
  private inheritFasten(parent: QueryNode): Fasten {
    let node: QueryNode | null = parent;
    while (node !== null && node.fasten === "direct") node = this.parents.get(node) ?? null;
    return node === null ? "join" : node.fasten;
  }

  // ---- normalization (CardQuery::Normalization) ----

  /** Normalization#normalize_clause: clause_to_hash + normalize_value (skip :return) */
  private interpret(query: QueryNode, clause: unknown): void {
    let hash: Record<string, unknown>;
    if (isPlainObject(clause)) {
      hash = clause;
    } else if (typeof clause === "number" && Number.isInteger(clause)) {
      hash = { id: clause };
    } else if (typeof clause === "string") {
      // String -> { id: Card::Lexicon.id(clause) || -2 }
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
    // OK_VALUE_CLASSES: Integer, Float, Hash, Symbol, booleans, nil, relation
    if (val === null || typeof val === "number" || typeof val === "boolean" || isPlainObject(val)) {
      return val;
    }
    throw new CqlBadQuery(`Invalid value type: ${typeof val} (${inspect(val)})`);
  }

  /** Normalization#normalize_string_value */
  private normalizeStringValue(val: string, context: string): string {
    const varMatch = /^\$(\w+)$/.exec(val);
    if (varMatch) {
      // string_value_from_var: @vars[name].to_s.strip (missing -> "")
      const raw = this.vars[varMatch[1] ?? ""];
      return String(raw ?? "").trim();
    }
    if (NEEDS_ABSOLUTIZE_RE.test(val)) {
      return absolutizeName(val, context, this.onWarning);
    }
    return val;
  }

  // ---- interpretation dispatch (CardQuery::Interpretation) ----

  private interpretItem(query: QueryNode, key: string, val: unknown): void {
    // interpret_as_content?: operator key that is not an attribute ("match"
    // IS an attribute, so it routes to the attribute handler instead)
    if (key in OPERATORS && !ATTRIBUTES[key]) {
      this.addCondition(query, "content", this.buildValue([key, this.normalizeValue(val, query.context)]));
      return;
    }
    // interpret_as_modifier?: modifier key with a non-Hash value
    if ((MODIFIERS as readonly string[]).includes(key) && !isPlainObject(val)) {
      this.interpretModifier(query, key, val);
      return;
    }
    this.interpretAttributes(query, key, val);
  }

  /** Interpretation#interpret_modifier: values stringified (arrays kept) */
  private interpretModifier(query: QueryNode, key: string, val: unknown): void {
    const mods: Mods = query.mods;
    const list = Array.isArray(val) ? val.map(String) : [String(val)];
    switch (key) {
      case "conj":
        // Conjunctions#current_conjunction reads mods[:conj]; we keep the
        // effective value on the node itself
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
        // INTERPRET_METHOD[:basic] = :add_condition
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
        // Custom#compound: "left_id IS #{'NOT' if val} NULL" (Ruby emits a
        // double space in the false branch; normalized here)
        query.conditions.push({ kind: "raw", sql: `left_id IS ${val ? "NOT " : ""}NULL` });
        break;
      case "ignore":
        break;
      case "deprecated":
        this.onWarning?.(`Card queries no longer support ${key} attribute`);
        break;
    }
  }

  // ---- values (Card::Query::Value) ----

  /** Value#initialize: parse_value + canonicalize_operator */
  private buildValue(rawvalue: unknown): ParsedValue {
    if (Array.isArray(rawvalue)) {
      return this.parseArrayValue(rawvalue);
    }
    if (rawvalue === null) {
      return { op: "is", values: [null] };
    }
    return { op: "=", values: [assertSimpleValue(rawvalue)] };
  }

  /** Value#parse_array_value */
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

  /** Value#canonicalize_operator */
  private canonicalizeOperator(op: string): void {
    if (!Object.values(OPERATORS).includes(op)) {
      throw new CqlBadQuery(`Invalid operator: ${op}`);
    }
  }

  /** QueryHelper#add_condition + Value#to_sql dispatch */
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
   * Value#standard_sql: values of `name` conditions are mapped to key form
   * ("Joe Admin" -> "joe_admin") for every non-match operator. (The match
   * operator branches to MatchValue before this and keeps its own mapping.)
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

  /** Value#standardize_field */
  private standardizeField(field: string): string {
    return field in SQL_FIELD ? SQL_FIELD[field] : safeSql(field);
  }

  // ---- relational dispatch (Interpretation#relate + relate_multi_value) ----

  private relate(query: QueryNode, key: string, val: unknown, opts?: { multiple?: boolean }): void {
    const multiple = opts?.multiple ?? Array.isArray(val);
    if (multiple) {
      this.relateMultiValue(query, key, val as unknown[]);
    } else {
      this.relationalHandler(key)(query, val);
    }
  }

  /** Interpretation#relate_compound */
  private relateCompound(query: QueryNode, key: string, val: unknown): void {
    const hasMultipleValues =
      Array.isArray(val) &&
      (Array.isArray(val[0]) || (typeof val[0] === "string" && val[0] in CONJUNCTIONS));
    this.relate(query, key, val, { multiple: hasMultipleValues });
  }

  /** Interpretation#relate_multi_value */
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

  /** Tie#list_of_ids? */
  private listOfIds(val: unknown[]): boolean {
    return val.every((v) => this.idFromVal(v) !== null);
  }

  /** Tie#id_from_val */
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
    // RelationalAttributes (restrict-able)
    type: (q, val) => this.restrict(q, "type_id", val),
    left: (q, val) => this.restrict(q, "left_id", val),
    right: (q, val) => this.restrict(q, "right_id", val),
    last_edited_by: (q, val) => this.restrict(q, "updater_id", val),
    created_by: (q, val) => this.restrict(q, "creator_id", val),

    part: (q, val) => {
      // part = any(left: val, right: val.clone)
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

    // Conjunctions#all/#any (+ and/or aliases)
    all: (q, val) => this.conjoin(q, val, "and"),
    and: (q, val) => this.conjoin(q, val, "and"),
    any: (q, val) => this.conjoin(q, val, "or"),
    or: (q, val) => this.conjoin(q, val, "or"),

    not: (q, val) => {
      // Conjunctions#not: tie :card, val, { id: :id }, { negate: true }
      this.tie(q, "card", val, { from: "id", to: "id" }, { negate: true });
    },

    // MatchAttributes
    match: (q, val) => this.matchAttribute(q, val),
    complete: (q, val) => this.completeAttribute(q, val),
    name_match: (q, val) => this.nameMatchAttribute(q, val),

    // ReferenceAttributes#define_reference_method table
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
      // ReferenceAttributes#member_of
      this.interpret(q, { referred_to_by: { left: val, right: { codename: "members" } } });
    },
    member: (q, val) => {
      // ReferenceAttributes#member needs Card::RoleID (codename constant)
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
      // FoundBy#found_by — the value rides to execution (execute.ts
      // resolveFoundByConditions resolves the target card's cql_hash and
      // translates to the id-set constraint); interpretation records it.
      q.conditions.push({ kind: "foundBy", value: val });
    },

    sort: (q, val) => this.sortAttribute(q, val),
  };

  /** Tie#restrict: id-able values become conditions, others tie a subquery */
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

  /** RelationalAttributes#junction + junction_val */
  private junction(query: QueryNode, val: unknown, side: string, field: string): void {
    const [partClause, junctionClause] = Array.isArray(val) ? [val[0], val[1] ?? {}] : [val, {}];
    // clause_to_hash(junction_clause).merge(side => part_clause); the part
    // wins when the junction clause uses the same side key (oracle-verified)
    const merged = {
      ...this.interpretToHash(junctionClause, query.context),
      [side]: partClause,
    };
    this.tie(query, "card", merged, { to: field });
  }

  // ---- conjunctions (CardQuery::Conjunctions) ----

  private conjoin(query: QueryNode, val: unknown, conj: string): void {
    const sub = this.newQuery("card", { fasten: "direct", conj }, query);
    query.subqueries.push(sub);
    // Conjunctions#conjoinable_val
    const items = Array.isArray(val)
      ? val
      : Object.entries(this.interpretToHash(val, query.context)).map(([k, v]) => ({ [k]: v }));
    for (const item of items) {
      this.interpret(sub, item);
    }
  }

  // ---- ties (AbstractQuery::Tie) ----

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
        // Tie#tie_with_join; Join#side -> left_join?
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
          // Tie#negate_join: explicit conditions move into the ON clause and
          // the superquery gains "<sub>.<to> is null"
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
        // Tie#tie_with_in — the subquery's return becomes the to-field and
        // the in-field is remembered for Where#in_condition
        sub.mods.return = mergedFields.to;
        sub.mods.inField = `${query.tableAlias}.${mergedFields.from}`;
        break;
      case "exist":
        // Tie#tie_with_exist — rendered from the subqueries walk
        break;
      case "direct":
        // conditions render through the subqueries walk; joins hoist at render
        break;
    }
    return sub;
  }

  // ---- per-kind clause interpretation for subqueries ----
  // ReferenceQuery (reference_query.rb), ActionQuery (action_query.rb),
  // ActQuery (act_query.rb) interpret their own clause keys; card subqueries
  // use the regular interpretation.

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
    // ReferenceQuery#referer/#referee -> add_conditions(outfield, hash)
    const outfield = key === "referer" ? "referer_id" : key === "referee" ? "referee_id" : null;
    if (!outfield || !isPlainObject(val)) {
      throw new CqlBadQuery(`Invalid attribute: ${key}`);
    }
    const reftype = val["reftype"];
    const card = val["card"];
    // ReferenceQuery#add_reftype_condition — single reftype "=", several "IN"
    // (uppercase, interpolated directly by Ruby)
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

  /** ReferenceQuery#add_outfield_condition */
  private addOutfieldCondition(query: QueryNode, outfield: string, outcard: unknown): void {
    const idOp = this.opAndIdOrIdsFromVal(outcard);
    if (outcard === "_none") {
      // ReferenceQuery#non_outfield
      query.conditions.push({ kind: "value", field: "is_present", op: "=", values: [0] });
    } else if (idOp) {
      // ReferenceQuery#outfield_id
      query.conditions.push({ kind: "value", field: outfield, op: idOp.op, values: idOp.ids });
    } else {
      this.tie(query, "card", outcard, { from: outfield });
    }
  }

  /** Tie#op_and_id_or_ids_from_val — null when val is not (a list of) ids */
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

  /** ActionQuery#add_update_condition: "#{fld :action_type} = 1" */
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

  // ---- match attributes (CardQuery::MatchAttributes) ----

  /** MatchAttributes#match: term matched against name OR content */
  private matchAttribute(query: QueryNode, val: unknown): void {
    // val.present? — false and "" are blank in Rails
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
    query.conditions.push({ kind: "group", conj: "or", conditions }); // or_join
  }

  /** MatchAttributes#name_match */
  private nameMatchAttribute(query: QueryNode, val: unknown): void {
    if (val !== null && val !== undefined && val !== "" && val !== false) {
      this.addCondition(query, "name", this.buildValue(["match", val]));
    }
    this.nameNotNull(query);
  }

  /** MatchAttributes#complete */
  private completeAttribute(query: QueryNode, val: unknown): void {
    const name = String(val);
    if (name.includes("+")) {
      // MatchAttributes#complete_compound
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

  /** MatchAttributes#name_not_null */
  private nameNotNull(query: QueryNode): void {
    query.conditions.push({ kind: "raw", sql: `${query.tableAlias}.key IS NOT NULL` });
  }

  // ---- sorting (CardQuery::Sorting) ----

  /** CardQuery#full?: the root query whose return is not "count" */
  private isFull(query: QueryNode): boolean {
    return this.rootNode === query && query.mods.return !== "count";
  }

  /** Sorting#sort — the `sort` attribute with a Hash value */
  private sortAttribute(query: QueryNode, val: unknown): void {
    if (!this.isFull(query)) return; // eg, no sorting on simple count queries
    if (!isPlainObject(val)) {
      throw new CqlBadQuery(`Invalid clause: ${inspect(val)}`);
    }
    // Sorting#interpret_sort_hash
    const spec = { ...val };
    const item = spec["item"] !== undefined ? String(spec["item"]) : "left";
    const sortField = spec["return"] !== undefined ? String(spec["return"]) : "db_content";
    delete spec["item"];
    delete spec["return"];

    if (sortField === "count") {
      // Sorting#sort_by_count dispatches to sort_by_count_<item>; only
      // sort_by_count_referred_to exists (experimental; double-nested
      // subselect shape) — deferred
      throw new CqlBadQuery(
        `sorting by #count/${item} not yet implemented (deferred; Ruby Sorting#sort_by_count_${item})`,
      );
    }
    const joinField = SORT_BY_ITEM_JOIN_MAP[item];
    if (!joinField) {
      // Guard, not a deferral: every join item with a ported path is in the
      // map above ("sort": item-join ported; the
      // documented deferral is the #count sort, raised before this line).
      throw new CqlBadQuery(`sorting by #join/${item} not yet implemented`);
    }
    // Sorting#sort_by_item_join -> join_cards(side LEFT, conditions_on_join)
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
