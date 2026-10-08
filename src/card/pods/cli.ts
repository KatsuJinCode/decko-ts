// The pods command line: `decko sow` and `decko eat` for a deck file.
//
//   sow --deck <deck.sqlite3> (-c '<cql json>' | -n "<name>,<name>") [-f tags] [-o out.yml]
//   eat --deck <deck.sqlite3> <pod.yml> [-u "<user name>"]
//
// sow writes the pod YAML (stdout without -o); eat prints its report as JSON.
// Run through tools/pods/decko-ts-pods.mjs, which bundles this file.

import { readFileSync, writeFileSync } from "node:fs";
import { bootDeck } from "./deck.js";
import { sowYaml } from "./sow.js";
import { eatYaml } from "./eat.js";

function option(args: string[], ...names: string[]): string | undefined {
  for (const n of names) {
    const i = args.indexOf(n);
    if (i !== -1 && i + 1 < args.length) return args[i + 1];
  }
  return undefined;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  const deckPath = option(args, "--deck", "-d");
  if ((command !== "sow" && command !== "eat") || deckPath === undefined) {
    process.stderr.write(
      "usage: sow --deck <deck> (-c <cql> | -n <names>) [-f <tags>] [-o <out.yml>]\n" +
        "       eat --deck <deck> <pod.yml> [-u <user>]\n",
    );
    return 2;
  }
  if (command === "sow") {
    const deck = await bootDeck(deckPath, { readonly: true });
    try {
      const cql = option(args, "-c", "--cql");
      const names = option(args, "-n", "--name");
      const tags = option(args, "-f", "--field_tags");
      const yaml = await sowYaml(deck.fetcher, {
        ...(cql !== undefined ? { cql: JSON.parse(cql) as Record<string, unknown> } : {}),
        ...(names !== undefined ? { names: names.split(",") } : {}),
        ...(tags !== undefined ? { fieldTags: tags.split(",") } : {}),
      });
      const out = option(args, "-o", "--out");
      if (out !== undefined) writeFileSync(out, yaml);
      else process.stdout.write(yaml);
      return 0;
    } finally {
      deck.close();
    }
  }
  const podPath = args.find((a, i) => !a.startsWith("-") && !["--deck", "-d", "-u", "--user"].includes(args[i - 1] ?? ""));
  if (podPath === undefined) {
    process.stderr.write("eat: no pod file given\n");
    return 2;
  }
  const deck = await bootDeck(deckPath);
  try {
    let actor = { id: 1, name: "Decko Bot" };
    const user = option(args, "-u", "--user");
    if (user !== undefined) {
      const record = await deck.fetcher.fetchByName(user);
      if (record?.id === undefined) throw new Error(`no such user: ${user}`);
      actor = { id: record.id, name: record.name?.s ?? user };
    }
    const report = await eatYaml(deck.fetcher, (a, now) => deck.engineFor(a, now), readFileSync(podPath, "utf8"), {
      defaultActor: actor,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.errors.length === 0 ? 0 : 1;
  } finally {
    deck.close();
  }
}
