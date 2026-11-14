// Unit tests for the Card::Act write-side port (src/card/history/act.ts).
// Every expectation cites the Ruby file it derives from.

import { describe, expect, it } from "vitest";
import { assignActor, sqlDateTime } from "../../../src/card/history/act.js";
import { sqlDateTime as authSqlDateTime } from "../../../src/card/auth/session-store.js";

describe("assignActor", () => {
  // card-mod-history-0.20.0/lib/card/act.rb:131-134
  //   def assign_actor
  //     self.actor_id ||= Auth.current_id
  //   end
  it("keeps an explicitly assigned actor (the ||= keeps existing values)", () => {
    expect(assignActor(42, 1)).toBe(42);
  });

  it("fills a blank actor from the current user", () => {
    expect(assignActor(null, 1)).toBe(1);
    expect(assignActor(undefined, 1)).toBe(1);
  });
});

describe("sqlDateTime", () => {
  // ActiveRecord's form (activerecord-7.2.3.2 connection_adapters/abstract/
  // quoting.rb:184-198 quoted_date): `value.to_fs(:db)`, then "." and six
  // microsecond digits only when usec > 0. Stock Ruby on the reference
  // harness's frozen clock stores "2026-09-19 12:00:00".
  it("writes a whole second with no fraction, as Ruby does", () => {
    expect(sqlDateTime(new Date("2026-09-19T12:00:00.000Z"))).toBe("2026-09-19 12:00:00");
    expect(sqlDateTime(new Date("2022-04-01T14:38:11.000Z"))).toBe("2022-04-01 14:38:11");
  });

  it("writes a fraction as six microsecond digits", () => {
    expect(sqlDateTime(new Date("2026-09-19T12:34:56.789Z"))).toBe("2026-09-19 12:34:56.789000");
    expect(sqlDateTime(new Date("2026-01-02T03:04:05.006Z"))).toBe("2026-01-02 03:04:05.006000");
    expect(sqlDateTime(new Date("2026-01-02T03:04:05.060Z"))).toBe("2026-01-02 03:04:05.060000");
  });

  it("sorts as text in time order across both forms", () => {
    const instants = ["2026-09-19T12:00:00.000Z", "2026-09-19T12:00:00.001Z", "2026-09-19T12:00:00.999Z", "2026-09-19T12:00:01.000Z"];
    const texts = instants.map((i) => sqlDateTime(new Date(i)));
    expect([...texts].sort()).toEqual(texts);
  });

  it("the auth layer's copy writes the same text", () => {
    for (const i of ["2026-09-19T12:00:00.000Z", "2026-09-19T12:34:56.789Z", "1999-12-31T23:59:59.010Z"]) {
      expect(authSqlDateTime(new Date(i))).toBe(sqlDateTime(new Date(i)));
    }
  });
});
