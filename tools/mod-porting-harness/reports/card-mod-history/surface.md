# card-mod-history-0.20.0 — behavior surface

What this mod does (mined from the Ruby gem source, READ-ONLY):

- 14 view(s), 6 event hook(s), 3 seed card(s), 3 config key(s).
- 11 set module file(s); 1 asset file(s); 0 public/ asset file(s).

## Views

- `history` — do — card-mod-history-0.20.0/set/all/history/export.rb:10
- `actions` — do — card-mod-history-0.20.0/set/all/history/export.rb:14
- `history` — , cache: :never do # why no cache? — card-mod-history-0.20.0/set/all/history/views.rb:4
- `act` — , cache: :never do — card-mod-history-0.20.0/set/all/history/views.rb:11
- `act_legend` — do — card-mod-history-0.20.0/set/all/history/views.rb:15
- `draft_legend` — do — card-mod-history-0.20.0/set/all/history/views.rb:24
- `action_summary` — do — card-mod-history-0.20.0/set/all/history/views.rb:28
- `action_expanded` — do — card-mod-history-0.20.0/set/all/history/views.rb:32
- `change` — do — card-mod-history-0.20.0/set/all/history/views.rb:36
- `last_action` — do — card-mod-history-0.20.0/set/all/history/views.rb:46
- `last_action_verb` — , cache: :never do — card-mod-history-0.20.0/set/all/history/views.rb:55
- `creator_credit` — , — card-mod-history-0.20.0/set/all/history_board.rb:2
- `updated_by` — , wrap: { div: { class: "text-muted" } } do — card-mod-history-0.20.0/set/all/history_board.rb:10
- `board_act` — , cache: :never do — card-mod-history-0.20.0/set/all/history_board.rb:18

## Events

- `update_ancestor_timestamps` , :integrate do — card-mod-history-0.20.0/set/all/history/events.rb:1
- `assign_action` , :initialize, when: :actionable? do — card-mod-history-0.20.0/set/all/history/events.rb:15
- `detect_conflict` , :validate, on: :update, when: :edit_conflict? do — card-mod-history-0.20.0/set/all/history/events.rb:19
- `finalize_action` , :finalize, when: :finalize_action? do — card-mod-history-0.20.0/set/all/history/events.rb:25
- `rollback_actions` , :prepare_to_validate, on: :update, when: :rollback_request? do — card-mod-history-0.20.0/set/all/history/events.rb:40
- `finalize_act` , after: :finalize_action, when: :act_card? do — card-mod-history-0.20.0/set/all/history/events.rb:48

## Seed cards

- First — data/test.yml
- First — data/test.yml
- First — data/test.yml

## Config keys

- `views` — card-mod-history-0.20.0/config/admin.yml
- `de` — card-mod-history-0.20.0/config/locales/de.yml
- `en` — card-mod-history-0.20.0/config/locales/en.yml
