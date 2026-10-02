# Read-only structural probe for the core-mod admin surface lane
# (lane-admin). Verifies the facts the transcription needs, against the live
# oracle deck. Renders NOTHING and writes no card rows; the only disk effect
# is Rails' own tmp/cache population (the established capture instrument's
# routine behavior, cleared between runs).
#
# Run:
#   cd tools/oracle/decko-oracle-app && RAILS_ENV=development bundle exec decko runner \
#     C:/localProjects/decko-ts-lane-admin/tests/card/mod-loader/oracle-probe-core-admin-facts.rb

require "json"

facts = {}

facts[:config_allow_irreversible_admin_tasks] = Cardio.config.allow_irreversible_admin_tasks
facts[:config_perform_deliveries] = Card.config.action_mailer&.perform_deliveries

tasks = Card::Set.basket[:tasks] || {}
facts[:basket_task_keys_in_order] = tasks.keys.map(&:to_s)
facts[:basket_tasks] = tasks.each_with_object({}) do |(k, v), h|
  h[k.to_s] = { mod: v[:mod].to_s, irreversible: v[:irreversible].dup, policy_present: !v[:execute_policy].nil? }
end
facts[:basket_warnings] = (Card::Set.basket[:warnings] || []).map(&:to_s)
facts[:basket_config_title] = (Card::Set.basket[:config_title] || {}).transform_keys(&:to_s)

spec = Cardio::Mod.fetch("date")&.spec
if spec
  facts[:date_spec] = {
    name: spec.name, summary: spec.summary, version: spec.version.to_s,
    authors: spec.authors, description: spec.description, email: spec.email,
    homepage: spec.homepage,
    files: spec.files,
    files_class: spec.files.class.to_s,
    dependencies: spec.dependencies.map { |d| { name: d.name.to_s, type: d.type } }
  }
end

core_spec = Cardio::Mod.fetch("core")&.spec
if core_spec
  facts[:core_spec] = {
    name: core_spec.name, summary: core_spec.summary, version: core_spec.version.to_s,
    authors: core_spec.authors, description: core_spec.description,
    files_count: core_spec.files.size,
    files_first_5: core_spec.files.first(5),
    dependencies: core_spec.dependencies.map { |d| d.name.to_s }
  }
end

facts[:admin_card] = { name: Card[:admin]&.name, type: Card[:admin]&.type_name,
                       trash: Card[:admin]&.trash }
facts[:mod_cardtype_card] = { name: Card[:mod]&.name, type: Card[:mod]&.type_name,
                              content: Card[:mod]&.content }
facts[:mod_cards] = Card.search({ type: :mod, return: :name, sort: :name }).sort
facts[:mod_cards_count] = Card.search({ type: :mod, return: :count })

structure_card = Card[:structure]
facts[:structure_card] = { name: structure_card&.name, codename: :structure.to_s }
facts[:structure_responsible_role] = structure_card&.responsible_role
facts[:admin_responsible_role] = Card[:admin]&.responsible_role

mod_card = Card.search({ type: :mod, return: :name, sort: :name }).sort.first
mc = Card[mod_card]
facts[:first_mod_card] = {
  name: mc.name, codename: mc.codename,
  admin_config: mc.admin_config,
  tasks: mc.tasks.transform_values { |v| { mod: v[:mod].to_s, irreversible: v[:irreversible].dup } },
  settings: mc.settings&.map(&:to_s),
  views: mc.views,
  depends_on: mc.depends_on,
  description: mc.description,
  gem_info_properties: %w[name summary version authors description email homepage]
    .map { |p| "#{p}: #{mc.mod&.spec&.send(p)}" }
}

# the roles-view grouping inputs
facts[:all_configs_count] = Card[:admin].all_configs.size
facts[:config_titles] = Card[:admin].all_admin_configs_grouped_by(:category).keys

puts JSON.pretty_generate(facts)
