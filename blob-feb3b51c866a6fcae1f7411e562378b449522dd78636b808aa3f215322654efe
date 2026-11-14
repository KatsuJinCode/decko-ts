# SQLite reference keyword searches need a REGEXP function

The preserved clean paired run's three Ruby search500s have an exact cause in
the reference application's development.log: SQLite3::SQLException, no such
function: REGEXP. The unchanged Decko SQL uses name/content REGEXP for Topic
or Memo, retaining its trash and read-rule predicates. Installed card1.110.0
active_record.rb explicitly emits REGEXP for its SQLite adapter; PostgreSQL's
matching arm is case-insensitive. SQLite itself supplies no regexp function.

The disposable browser host now installs an explicitly identified Ruby-Regexp
SQLite function only when the host has none. It preserves a pre-existing host
implementation. Existing ActiveRecord connections are configured at startup,
and its SQLite configuration hook covers fresh and reconnected connections.
No application query, permission predicate, fixture, installed gem, golden
observation, comparator mask or deployed service changes.

This adaptation is qualified in /__harness/runtime as
ruby-regexp-ignorecase-when-absent/v1. It does not establish general MySQL regex
dialect, collation or Unicode equivalence. The measured target is the three
literal-keyword browser cases; other dialect claims require their own evidence.

The meaningful SQL controls go from four missing-function errors to7/7 tests,
17 assertions, no skips, in2.072seconds. They cover positive/negative and
case-insensitive SQL matches, anchors, escaped punctuation, NULL operands,
malformed expressions, wrong arity, preserving a supplied host function and
real ActiveRecord existing/reconnected/thread connections. Runtime source is
the installed sqlite3 gem2.9.6 and ActiveRecord7.2.4; no software was installed.
Fresh actual browser/reference comparisons follow this coherent checkpoint.

The first actual repeat still returns500 for all three: its next exception is
Decko's AbstractAdapter#match not implemented. A new regression loads the real
installed Card patch and reproduces that error. Card1.110 registers its concrete
SQL matcher under SQLiteAdapter, whereas ActiveRecord7.2 uses SQLite3Adapter.
The host now binds that same stock module to the actual class; no CQL builder
or generated SQL is replaced. Runtime metadata reports whether the stock
binding is present. The original failed repeat is retained. A fresh repeat of
the three affected cases follows this additional coherent checkpoint.
