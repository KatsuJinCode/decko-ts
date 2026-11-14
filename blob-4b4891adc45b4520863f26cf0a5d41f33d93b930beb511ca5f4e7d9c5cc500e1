// preference_user_id (lib/card/rule/all.rb#preference_user_id, all.rb:
// 55-62) over the port's preferenceUserId (src/card/rules/lookup.ts).
// The pinned Ruby body:
//   def preference_user_id user
//     case user
//     when Integer then user
//     when Card    then user.id
//     when nil     then Auth.current_id
//     else raise Card::ServerError, "invalid preference user"
//     end
//   end
// Each case is one branch of that case expression.

import { describe, expect, it } from "vitest";
import { PreferenceUserError, preferenceUserId } from "../../../src/card/rules/lookup.js";

describe("preferenceUserId (rule/all.rb:55-62)", () => {
  it("an Integer passes through (when Integer)", () => {
    expect(preferenceUserId(42, 999)).toBe(42);
  });

  it("a Card gives its id (when Card)", () => {
    expect(preferenceUserId({ id: 7 }, 999)).toBe(7);
  });

  it("nil answers the current actor (when nil -> Auth.current_id)", () => {
    expect(preferenceUserId(null, 5)).toBe(5);
    expect(preferenceUserId(undefined, 5)).toBe(5);
    expect(preferenceUserId(null, undefined)).toBeUndefined();
  });

  it("anything else raises the ServerError message", () => {
    expect(() => preferenceUserId("Joe User" as unknown as number, 5)).toThrow(PreferenceUserError);
    expect(() => preferenceUserId("Joe User" as unknown as number, 5)).toThrow("invalid preference user");
  });
});
