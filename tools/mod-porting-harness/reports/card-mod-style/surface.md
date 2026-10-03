# card-mod-style-0.20.0 — behavior surface

What this mod does (mined from the Ruby gem source, READ-ONLY):

- 18 view(s), 3 event hook(s), 7 seed card(s), 4 config key(s), 2 basket registration(s).
- 16 set module file(s); 2 asset file(s); 11 public/ asset file(s).

## Views

- `core` — do — card-mod-style-0.20.0/set/abstract/01_css.rb:35
- `import` — do — card-mod-style-0.20.0/set/abstract/01_css.rb:48
- `compiled` — do — card-mod-style-0.20.0/set/abstract/01_css.rb:52
- `compressed` — do — card-mod-style-0.20.0/set/abstract/01_css.rb:56
- `compiled` — do — card-mod-style-0.20.0/set/abstract/02_scss.rb:4
- `core` — do — card-mod-style-0.20.0/set/abstract/02_scss.rb:8
- `labeled` — do — card-mod-style-0.20.0/set/abstract/02_scss.rb:23
- `box` — , cache: :yes do — card-mod-style-0.20.0/set/abstract/skin_box.rb:2
- `box_bottom` — , template: :haml — card-mod-style-0.20.0/set/abstract/skin_box.rb:8
- `customize_button` — do — card-mod-style-0.20.0/set/abstract/skin_box.rb:10
- `box_middle` — do — card-mod-style-0.20.0/set/abstract/skin_box.rb:14
- `core` — do — card-mod-style-0.20.0/set/abstract/style_group.rb:10
- `stylesheet_include_tag` — do — card-mod-style-0.20.0/set/abstract/style_group.rb:38
- `remote_style_tags` — , cache: :deep, perms: :none do — card-mod-style-0.20.0/set/self/style_mods.rb:9
- `concat` — do — card-mod-style-0.20.0/set/type/skin.rb:6
- `stylesheet_include_tag` — do — card-mod-style-0.20.0/set/type_plus_right/mod/style.rb:20
- `remote_include_tags` — do — card-mod-style-0.20.0/set/type_plus_right/mod/style.rb:26
- `stylesheet_path` — , cache: :never, perms: :none do — card-mod-style-0.20.0/set/type_plus_right/set/style.rb:28

## Events

- `validate_css` , :validate, on: :save, changed: %i[type_id content] do — card-mod-style-0.20.0/set/type/css.rb:7
- `validate_scss_syntax` , :validate, on: :save, changed: %i[type_id content] do — card-mod-style-0.20.0/set/type/scss.rb:4
- `no_deletion_if_used` , :validate, on: :delete do — card-mod-style-0.20.0/set/type/skin.rb:13

## Seed cards

- "style: mods" (codename style_mods) type :list — data/real.yml
- Local style folder group (codename local_style_folder_group) type :cardtype — data/real.yml
- Local style manifest group (codename local_style_manifest_group) type :cardtype — data/real.yml
- CSS (codename css) — data/real.yml
- SCSS (codename scss) — data/real.yml
- Skin (codename skin) — data/real.yml
- "*style" (codename style) type :search_type — data/real.yml

## Basket registrations

- `basket[:non_createable_types] << :local_style_folder_group` — card-mod-style-0.20.0/set/type/local_style_folder_group.rb:4
- `basket[:non_createable_types] << :local_style_manifest_group` — card-mod-style-0.20.0/set/type/local_style_manifest_group.rb:4

## Config keys

- `settings` — card-mod-style-0.20.0/config/admin.yml
- `cardtypes` — card-mod-style-0.20.0/config/admin.yml
- `de` — card-mod-style-0.20.0/config/locales/de.yml
- `en` — card-mod-style-0.20.0/config/locales/en.yml
