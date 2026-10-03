# card-mod-account-0.20.0 — behavior surface

What this mod does (mined from the Ruby gem source, READ-ONLY):

- 32 view(s), 30 event hook(s), 31 seed card(s), 3 config key(s), 3 basket registration(s).
- 23 set module file(s); 2 asset file(s); 0 public/ asset file(s).

## Views

- `closed_account` — , template: :haml — card-mod-account-0.20.0/set/abstract/account_holder.rb:126
- `account_tab` — do — card-mod-account-0.20.0/set/abstract/account_holder.rb:132
- `password_reset_email` — card-mod-account-0.20.0/set/right/account/events.rb:32 (loop-declared)
- `verification_email` — card-mod-account-0.20.0/set/right/account/events.rb:32 (loop-declared)
- `welcome_email` — card-mod-account-0.20.0/set/right/account/events.rb:32 (loop-declared)
- `verify_url` — , cache: :never, denial: :blank, perms: :verify_url_ok? do — card-mod-account-0.20.0/set/right/account/views.rb:2
- `reset_password_url` — , denial: :blank, perms: :reset_password_ok? do — card-mod-account-0.20.0/set/right/account/views.rb:6
- `token_expiry` — , denial: :blank do — card-mod-account-0.20.0/set/right/account/views.rb:10
- `token_days` — , denial: :blank do — card-mod-account-0.20.0/set/right/account/views.rb:14
- `verify_days` (alias of :token_days) — card-mod-account-0.20.0/set/right/account/views.rb:19
- `reset_password_days` (alias of :token_days) — card-mod-account-0.20.0/set/right/account/views.rb:20
- `closure` — , perms: :delete, template: :haml, wrap: :slot — card-mod-account-0.20.0/set/right/account/views.rb:22
- `core` — do — card-mod-account-0.20.0/set/right/account/views.rb:50
- `raw` — do — card-mod-account-0.20.0/set/right/password.rb:53
- `core` — , wrap: :em do — card-mod-account-0.20.0/set/right/password.rb:82
- `raw` — do — card-mod-account-0.20.0/set/right/salt.rb:13
- `core` — , cache: :never do — card-mod-account-0.20.0/set/self/signin.rb:119
- `open` — do — card-mod-account-0.20.0/set/self/signin.rb:127
- `title` — do — card-mod-account-0.20.0/set/self/signin.rb:134
- `open_content` — do — card-mod-account-0.20.0/set/self/signin.rb:139
- `one_line_content` — do — card-mod-account-0.20.0/set/self/signin.rb:144
- `reset_password_success` — do — card-mod-account-0.20.0/set/self/signin.rb:148
- `edit` — do — card-mod-account-0.20.0/set/self/signin.rb:154
- `edit_buttons` — do — card-mod-account-0.20.0/set/self/signin.rb:165
- `link_with_checkbox` — , cache: :never do — card-mod-account-0.20.0/set/type/role.rb:8
- `configs` — do — card-mod-account-0.20.0/set/type/role.rb:12
- `new` — , cache: :never do — card-mod-account-0.20.0/set/type/signup/views.rb:6
- `content_formgroups` — do — card-mod-account-0.20.0/set/type/signup/views.rb:11
- `new_buttons` — , cache: :never do — card-mod-account-0.20.0/set/type/signup/views.rb:15
- `core` — , template: :haml, cache: :never do — card-mod-account-0.20.0/set/type/signup/views.rb:27
- `setup` — , unknown: true, perms: :needs_setup?, cache: :never do — card-mod-account-0.20.0/set/type/user.rb:10
- `raw` — do — card-mod-account-0.20.0/set/type_plus_right/user/email.rb:7

## Events

- `validate_account_holder_name_change` , :validate, on: :update, changed: :name do — card-mod-account-0.20.0/set/abstract/account_holder.rb:1
- `generate_token` do — card-mod-account-0.20.0/set/all/account.rb:16
- `set_stamper` , :prepare_to_validate do — card-mod-account-0.20.0/set/all/account.rb:20
- `set_default_salt` , :prepare_to_validate, on: :create do — card-mod-account-0.20.0/set/right/account/events.rb:3
- `set_default_status` , :prepare_to_validate, on: :create do — card-mod-account-0.20.0/set/right/account/events.rb:7
- `reset_password` , :prepare_to_validate, on: :update, trigger: :required do — card-mod-account-0.20.0/set/right/account/events.rb:15
- `verify_and_activate` , :prepare_to_validate, on: :update, trigger: :required do — card-mod-account-0.20.0/set/right/account/events.rb:19
- `password_redirect` , :finalize, on: :update, when: :password_redirect? do — card-mod-account-0.20.0/set/right/account/events.rb:26
- `activate_account` do — card-mod-account-0.20.0/set/right/account/events.rb:40
- `delete_account` , :prepare_to_validate, on: :delete do — card-mod-account-0.20.0/set/right/account/events.rb:45
- `signout_upon_delete` , :integrate, on: :delete, when: :current_account? do — card-mod-account-0.20.0/set/right/account/events.rb:49
- `validate_email` , :validate, on: :save do — card-mod-account-0.20.0/set/right/email.rb:7
- `validate_unique_email` , after: :validate_email, on: :save do — card-mod-account-0.20.0/set/right/email.rb:16
- `downcase_email` , :prepare_to_validate, on: :save do — card-mod-account-0.20.0/set/right/email.rb:29
- `encrypt_password` , :store, on: :save, changed: :content do — card-mod-account-0.20.0/set/right/password.rb:21
- `validate_password_length` , :validate, on: :save do — card-mod-account-0.20.0/set/right/password.rb:30
- `validate_password_chars` , :validate, on: :save do — card-mod-account-0.20.0/set/right/password.rb:37
- `validate_password_present` , :prepare_to_validate, on: :update do — card-mod-account-0.20.0/set/right/password.rb:49
- `signin` , :validate, on: :update do — card-mod-account-0.20.0/set/self/signin.rb:10
- `signin_success` , after: :signin do — card-mod-account-0.20.0/set/self/signin.rb:15
- `signout` , :validate, on: :delete do — card-mod-account-0.20.0/set/self/signin.rb:19
- `send_reset_password_token` , before: :signin, on: :update, trigger: :required do — card-mod-account-0.20.0/set/self/signin.rb:27
- `auto_approve_with_verification` , :validate, on: :create, when: :can_approve? do — card-mod-account-0.20.0/set/type/signup.rb:20
- `approve_with_verification` , :validate, on: :update, trigger: :required do — card-mod-account-0.20.0/set/type/signup.rb:24
- `approve_without_verification` , :validate, on: :update, trigger: :required do — card-mod-account-0.20.0/set/type/signup.rb:28
- `act_as_current_for_integrate_stage` , :integrate, on: :create do — card-mod-account-0.20.0/set/type/signup.rb:36
- `check_setup` , before: :check_permissions, on: :create, trigger: :required do — card-mod-account-0.20.0/set/type/user.rb:50
- `setup_first_user` , :finalize, on: :create, when: :setup? do — card-mod-account-0.20.0/set/type/user.rb:59
- `signin_after_setup` , :integrate, on: :create, when: :setup? do — card-mod-account-0.20.0/set/type/user.rb:66
- `update_role_cache` , :finalize do — card-mod-account-0.20.0/set/type_plus_right/role/members.rb:5

## Seed cards

- Role (codename role) type :cardtype — data/real.yml
- "*members" (codename members) — data/real.yml
- Anyone (codename anyone) type :role — data/real.yml
- Anyone Signed In (codename anyone_signed_in) type :role — data/real.yml
- Administrator (codename administrator) type :role — data/real.yml
- Eagle (codename eagle) type :role — data/real.yml
- Shark (codename shark) type :role — data/real.yml
- Help Desk (codename help_desk) type :role — data/real.yml
- Anonymous (codename anonymous) — data/real.yml
-  — data/real.yml
- "*account" (codename account) — data/real.yml
- "*email" (codename email) — data/real.yml
- "*password" (codename password) — data/real.yml
- "*salt" (codename salt) — data/real.yml
- "*status" (codename status) — data/real.yml
- "*account settings" (codename account_settings) — data/real.yml
- Sign up (codename signup) — data/real.yml
-  — data/real.yml
-  — data/real.yml
- welcome email (codename welcome_email) type :email_template — data/real.yml
- verification email (codename verification_email) type :email_template — data/real.yml
- password reset email (codename password_reset_email) type :email_template — data/real.yml
- signup alert email (codename signup_alert_email) type :email_template — data/real.yml
- "*signin" (codename signin) — data/real.yml
- "*roles" (codename roles) type :search_type — data/real.yml
- "*enabled roles" (codename enabled_roles) — data/real.yml
- "*account links" (codename account_links) — data/real.yml
- Cards with accounts (codename cards_with_account) type :search_type — data/real.yml
- "*thanks" (codename thanks) type :setting — data/real.yml
-  type :phrase — data/real.yml
- Signup Success (codename signup_success) — data/real.yml

## Basket registrations

- `basket[:non_createable_types] << :signup` — card-mod-account-0.20.0/set/type/signup.rb:3
- `basket[:roles_for_first_user] = %i[help_desk shark administrator]` — card-mod-account-0.20.0/set/type/user.rb:3
- `basket[:roles_for_first_user].map(&:cardname).each do |role|` — card-mod-account-0.20.0/set/type/user.rb:61

## Config keys

- `cardtypes` — card-mod-account-0.20.0/config/admin.yml
- `de` — card-mod-account-0.20.0/config/locales/de.yml
- `en` — card-mod-account-0.20.0/config/locales/en.yml
