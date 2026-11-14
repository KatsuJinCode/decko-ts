# card-mod-follow-0.20.0 — behavior surface

What this mod does (mined from the Ruby gem source, READ-ONLY):

- 24 view(s), 10 event hook(s), 60 seed card(s), 2 config key(s).
- 32 set module file(s); 2 asset file(s); 0 public/ asset file(s).

## Views

- `follow_status` — do — card-mod-follow-0.20.0/set/all/follow/follow_link_views.rb:12
- `follow_button` — , cache: :never do — card-mod-follow-0.20.0/set/all/follow/follow_link_views.rb:26
- `list_of_changes` — , denial: :blank, cache: :never do — card-mod-follow-0.20.0/set/all/notify/base_views.rb:6
- `subedits` — , perms: :none, cache: :never do — card-mod-follow-0.20.0/set/all/notify/base_views.rb:13
- `subedit_notice` — , cache: :never do — card-mod-follow-0.20.0/set/all/notify/base_views.rb:25
- `followed` — , perms: :none, compact: true do — card-mod-follow-0.20.0/set/all/notify/base_views.rb:33
- `follower` — , perms: :none, compact: true do — card-mod-follow-0.20.0/set/all/notify/base_views.rb:41
- `last_action_verb` — , cache: :never do — card-mod-follow-0.20.0/set/all/notify/base_views.rb:45
- `unfollow_url` — , perms: :none, compact: true, cache: :never do — card-mod-follow-0.20.0/set/all/notify/base_views.rb:49
- `follow_status` — , cache: :never do — card-mod-follow-0.20.0/set/right/follow.rb:58
- `follow_item` — , cache: :never do — card-mod-follow-0.20.0/set/right/follow.rb:63
- `core` — , cache: :never do — card-mod-follow-0.20.0/set/right/followers.rb:8
- `core` — do — card-mod-follow-0.20.0/set/right/following.rb:8
- `status` — do — card-mod-follow-0.20.0/set/right/following.rb:16
- `one_line_content` — do — card-mod-follow-0.20.0/set/right/following.rb:28
- `rule_editor` — , cache: :never do — card-mod-follow-0.20.0/set/right/following.rb:32
- `edit_buttons` — do — card-mod-follow-0.20.0/set/self/follow_defaults.rb:49
- `confirm_update_all` — do — card-mod-follow-0.20.0/set/self/follow_defaults.rb:70
- `one_line_content` — do — card-mod-follow-0.20.0/set/type_plus_right/user/follow.rb:30
- `edit` — do — card-mod-follow-0.20.0/set/type_plus_right/user/follow.rb:34
- `core` — do — card-mod-follow-0.20.0/set/type_plus_right/user/follow.rb:39
- `follow_tab` — , cache: :never do — card-mod-follow-0.20.0/set/type_plus_right/user/follow.rb:45
- `ignore_tab` — , cache: :never do — card-mod-follow-0.20.0/set/type_plus_right/user/follow.rb:49
- `errors` — , perms: :none do — card-mod-follow-0.20.0/set/type_plus_right/user/follow.rb:65

## Events

- `cache_expired_for_type_change` , :store, on: :update, changed: %i[type_id name] do — card-mod-follow-0.20.0/set/all/follow/follower_ids.rb:5
- `expire_preferences_cache` , :finalize, when: :expire_preferences? do — card-mod-follow-0.20.0/set/all/follow/follower_ids.rb:19
- `silence_notifications` , :initialize, when: :silence_notifications? do — card-mod-follow-0.20.0/set/all/notify.rb:5
- `notify_followers_after_save` , :integrate_with_delay, — card-mod-follow-0.20.0/set/all/notify.rb:13
- `stash_followers` , :store, on: :delete, when: :notable_change? do — card-mod-follow-0.20.0/set/all/notify.rb:22
- `notify_followers_after_delete` , :integrate, on: :delete, when: :notable_change? do — card-mod-follow-0.20.0/set/all/notify.rb:27
- `cache_expired_for_new_preference` , :integrate, when: :preference? do — card-mod-follow-0.20.0/set/right/follow.rb:7
- `follow_fields_changed` , :integrate do — card-mod-follow-0.20.0/set/right/follow_fields.rb:3
- `update_follow_rules` , :finalize, on: :save, trigger: :required do — card-mod-follow-0.20.0/set/self/follow_defaults.rb:17
- `cache_expired_for_new_set` , :store, on: :create do — card-mod-follow-0.20.0/set/type/set.rb:1

## Seed cards

- Notification template (codename notification_template) type :cardtype — data/real.yml
- "*follow" (codename follow) type :setting — data/real.yml
- "*following" (codename following) type :list — data/real.yml
- "*followers" (codename followers) — data/real.yml
- "*follow fields" (codename follow_fields) type :setting — data/real.yml
- "*always" (codename always) — data/real.yml
- "*never" (codename never) — data/real.yml
- "*follow defaults" (codename follow_defaults) type :list — data/real.yml
- follow suggestions (codename follow_suggestions) type :list — data/real.yml
-  — data/real.yml
- "*contextual class" (codename contextual_class) — data/real.yml
- "*message" (codename message) — data/real.yml
- "*disappear" (codename disappear) — data/real.yml
- follower notification email (codename follower_notification_email) type :email_template — data/real.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
-  type :list — data/test/rules.yml
- John type :user — data/test/users.yml
- Sara type :user — data/test/users.yml
- Big Brother type :user — data/test/users.yml
- Optic fan type :user — data/test/users.yml
- Sunglasses fan type :user — data/test/users.yml
- Narcissist type :user — data/test/users.yml
- card with fields — data/test/with_fields.yml
- card with fields and admin fields — data/test/with_fields.yml
- admin card with fields and admin fields — data/test/with_fields.yml
- admin card with admin fields — data/test/with_fields.yml
-  type :pointer — data/test/with_fields.yml
-  type :pointer — data/test/with_fields.yml
-  type :pointer — data/test/with_fields.yml
-  type :pointer — data/test/with_fields.yml
-  type :pointer — data/test/with_fields.yml
- Optic type :cardtype — data/test.yml
- All Eyes On Me — data/test.yml
- No One Sees Me — data/test.yml
- Look At Me — data/test.yml
- Sara Following — data/test.yml
- John Following — data/test.yml
-  — data/test.yml
-  — data/test.yml
-  — data/test.yml
- Sunglasses type Optic — data/test.yml
- Google glass type Optic — data/test.yml
-  — data/test.yml
-  — data/test.yml
- Created card — data/test.yml

## Config keys

- `settings` — card-mod-follow-0.20.0/config/admin.yml
- `cardtypes` — card-mod-follow-0.20.0/config/admin.yml
