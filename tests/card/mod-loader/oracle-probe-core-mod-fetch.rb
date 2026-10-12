# Read-only probe #2: core mod fetch semantics + mod name order.
#   cd tools/oracle/decko-oracle-app && RAILS_ENV=development bundle exec decko runner \
#     REPO_ROOT//tests/card/mod-loader/oracle-probe-core-mod-fetch.rb
require "json"

facts = {}
mods = Cardio.mods
facts[:cardio_mods_names] = mods.map(&:name)
facts[:cardio_mods_count] = mods.size
core = Cardio::Mod.fetch("core")
facts[:core_fetch] = core.nil? ? "nil" : { name: core.name, group: core.group, spec_nil: core.spec.nil? }
unless core.nil? || core.spec.nil?
  s = core.spec
  facts[:core_spec] = { name: s.name, summary: s.summary, version: s.version.to_s,
                        authors: s.authors, description: s.description,
                        email: s.email, homepage: s.homepage,
                        files: s.files.first(3), files_size: s.files.size,
                        deps: s.dependencies.map { |d| d.name.to_s } }
end
# what type/mod.rb's modname produces for the "mod: core" card
mc = Card["mod: core"]
facts[:mod_core_card] = { name: mc.name, codename: mc.codename, modname: mc.modname }
mcf = Cardio::Mod.fetch(mc.modname)
facts[:mod_core_fetch] = mcf.nil? ? "nil" : { name: mcf.name, spec_nil: mcf.spec.nil? }
facts[:mod_core_admin_config] = mc.admin_config
facts[:mod_core_description] = mc.description
facts[:mod_core_cardtypes] = mc.cardtypes
facts[:mod_core_tasks] = mc.tasks.keys.map(&:to_s)
# the roles view's grouping on the Mod cardtype card (all configs by roles, then category)
modcard = Card["Mod"]
grouped = modcard.all_admin_configs_grouped_by(:roles, :category)
facts[:roles_group_keys] = grouped.keys.map(&:to_s)
one = grouped.keys.first
facts[:roles_group_first] = one && { role: one.to_s,
                                     categories: grouped[one].keys.map(&:to_s),
                                     first_cat_codenames: grouped[one].values.first&.map { |c| c.codename.to_s } }
# self/mod.rb view :cardtypes input on the Mod card
facts[:mod_self_cardtypes] = modcard.all_admin_configs_grouped_by(:category, :mod).keys
puts JSON.pretty_generate(facts)
