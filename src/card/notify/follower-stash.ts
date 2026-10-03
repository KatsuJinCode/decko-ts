// notify/follower-stash.ts — the per-act follower stash.
//
// Ruby source: card-mod-follow-0.20.0 lib/card/follower_stash.rb (the
// whole file; the gherkin-capabilities lane's act-mail-dedupe capability).
//
//   class FollowerStash
//     def initialize card=nil ... @stash = Hash.new { |h, v| h[v] = [] };
//                                    @checked = ::Set.new
//     def check_card card         # :10-18 — return if @checked includes
//                                 # the card's key; stash_direct_followers
//                                 # + stash_field_followers(card.left)
//     def followers               # :20-22 — @stash.keys
//     def each_follower_with_reason  # :24-29 — yields reasons.first
//     def stash follower, reason  # :84-86 — @stash[follower] << reason
//
// The TS port keeps the two dedupe dimensions:
// - @checked (per CARD): a card already checked is never re-walked within
//   the act (:11 early return);
// - @stash (per FOLLOWER): a follower stashed by an earlier action keeps
//   the FIRST reason (each_follower_with_reason yields reasons.first,
//   :27 — the first-stashed reason wins).
//
// The resolve walk itself (direct + the left-chain field walk) is the
// FollowerResolver the hook was built with — the same algebra
// follower-resolver.ts ports (follower_ids.rb:63-83 + followed_by.rb).

import type { SavePathEvent } from "./types.js";
import type { FollowerRef, FollowerResolver } from "./follow-notify.js";

export class FollowerStash {
  private readonly checked = new Set<number>();
  private readonly stashed = new Map<number, FollowerRef>();

  /** check_card (follower_stash.rb:10-18): resolve one act action's
   *  card's followers into the stash. `event` rides to the resolver (its
   *  per-card context); null cards skip (notify.rb:69 `next if !a.card`). */
  async checkCard(cardId: number | null | undefined, event: SavePathEvent): Promise<void> {
    if (cardId === null || cardId === undefined || this.checked.has(cardId)) return;
    this.checked.add(cardId);
    const refs = await this.resolver(cardId, event);
    for (const ref of refs) {
      // stash (:84-86) + each_follower_with_reason's reasons.first (:27):
      // the first resolution of a follower within the act wins.
      if (!this.stashed.has(ref.followerId)) this.stashed.set(ref.followerId, ref);
    }
  }

  /** followers (:20-22) — the stashed follower refs, first-stashed
   *  reason each, in stash order. */
  followers(): FollowerRef[] {
    return [...this.stashed.values()];
  }

  constructor(private readonly resolver: FollowerResolver) {}
}
