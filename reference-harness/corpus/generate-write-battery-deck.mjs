#!/usr/bin/env node
// Generates the write-battery fixture's deck.json: the synthetic cards the
// 70-operation write probe (tests/tools/persist-write-probe.test.ts) and the
// 90-step side-effects battery (tests/tools/side-effects-scenario-battery.test.ts)
// need on top of a stock Decko seed, plus the accounts the side-effects
// drive's own setup step would otherwise create (tools/parity-side-effects/
// ruby/drive.rb — baking them into the deck keeps that setup step idempotent,
// so the drive's start deck is the committed deck itself).
//
//   node reference-harness/corpus/generate-write-battery-deck.mjs <fixtureDir>
//
// Writes <fixtureDir>/deck.json. Build the deck from it with the oracle
// builder (reference-harness/oracle/build-deck.sh). Deterministic: the same
// generator always writes the same bytes; the builder freezes the clock the
// deck.json names, so even the account salts (Ruby hashes the clock into
// them) are stable between rebuilds.
//
// DATA RULE. Zero real content: every name, address, password and sentence
// below is invented for this fixture. The emails are example.com addresses
// for a throwaway deck; the passwords are fixture values, not secrets.

import { writeFileSync } from "node:fs";
import path from "node:path";

const GENERATOR_VERSION = 1;
const out = process.argv[2];
if (!out) {
  console.error("usage: generate-write-battery-deck.mjs <fixtureDir>");
  process.exit(2);
}

// The scenarios sign in as the probe account and as the drive's admin; the
// drive's setup (drive.rb "shared setup") creates the other three when the
// deck does not already hold them — with these cards it finds them and adds
// nothing. Names, emails, passwords and status values are the drive's own.
const DRIVE_ACCOUNTS = [
  { name: "Parity Probe", status: "active", email: "parity.probe@example.com", password: "Correct horse battery 1!" },
  { name: "Parity Follower", status: "active", email: "follower.probe@example.com", password: "Follower horse battery 3#" },
  { name: "Parity Admin", status: "active", email: "admin.probe@example.com", password: "Admin horse battery 5%" },
  { name: "Parity Pending", status: "pending", email: "pending.probe@example.com", password: "Pending horse battery 7*", type: "Sign up" },
  { name: "Parity Leaver", status: "active", email: "leaver.probe@example.com", password: "Leaver horse battery 8(" },
];

const accountFields = (email, password, status) => ({
  "+*account": { fields: { "+*email": email, "+*password": password, "+*status": status } },
});

const cards = [
  // The one pre-existing card the write probe's op list saves (its step 32
  // updates an existing, nested deck card): a Number card's description
  // field, as the stock seed's "Number" cardtype would have.
  { name: "Number+description", content: "<p>Lantern harbor sums the orchard. (write battery fixture)</p>" },
  // The drive setup's accounts (see DRIVE_ACCOUNTS above) ...
  ...DRIVE_ACCOUNTS.filter((a) => a.name !== "Parity Pending").map(({ name, status, email, password }) => ({
    // "type": "User" is load-bearing: the drive creates its accounts with
    // type_id Card::UserID, and without it the builder's default (RichText)
    // applies — a card whose set modules never load the account-holder
    // machinery, so permission checks crash and the account cannot act.
    type: "User",
    name,
    fields: accountFields(email, password, status),
  })),
  // ... and the two non-account rows that setup adds beside them: the
  // follower follows everything (so follower notifications are observable),
  // and the admin sits on the Administrator role's members list (the role's
  // +*members list is what membership means in this deck; the drive adds the
  // item when it is missing).
  { name: "*all+Parity Follower+*follow", content: "*always" },
  { name: "Administrator+*members", content: "[[Parity Admin]]" },
  // The pending sign-up goes LAST, deliberately: its create re-authenticates
  // the process as the new sign-up card (card-mod-account's signup events),
  // so every later card in the builder's one-process run would be created
  // under that unprivileged actor and lose the right to create accounts. As
  // the last entry it poisons nothing.
  {
    type: "Sign up",
    name: "Parity Pending",
    fields: accountFields("pending.probe@example.com", "Pending horse battery 7*", "pending"),
  },
];

const deck = {
  format: "decko-reference-deck/1",
  name: "write-battery-v1",
  generator: {
    script: "reference-harness/corpus/generate-write-battery-deck.mjs",
    version: GENERATOR_VERSION,
  },
  base: { seed: "decko setup", decko: "0.20.0", card: "1.110.0" },
  clock: "2026-10-10T12:00:00Z",
  environment: { origin: "http://deck.example", default_html_view: "titled" },
  actors: {
    anonymous: { card: "Anonymous" },
    member: { card: "Parity Probe", email: "parity.probe@example.com", password: "Correct horse battery 1!" },
    admin: { card: "Parity Admin", email: "admin.probe@example.com", password: "Admin horse battery 5%" },
  },
  cards,
};

writeFileSync(path.join(out, "deck.json"), JSON.stringify(deck, null, 2) + "\n");
console.log(`wrote ${path.join(out, "deck.json")}`);
