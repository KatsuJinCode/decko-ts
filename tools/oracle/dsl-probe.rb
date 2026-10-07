require "json"
VIEWS = %i[content open core title head body raw name key link linkname url url_link codename id type
           created_at updated_at children subcards left right settings rules types table_of_contents
           search bar mini_bar bars btm_left btm_right filtered_list list_items items
           nest_guide each_card each_content group_names group set_guide recent_changes history
           account_link sign_in sign_up forgot_password signed_up email new_password reset_password
           dashboard header footer sidebar getting_started wrap layout style script
           default_html_view content_options content_option_view demo form rich_text json csv yaml
           text basic pointer toggle date number image file cacheable cached_data cite
           default_reference_layout default_text_layout]
out = {}
%w[*all *self *type *rstar *star Person Set Setting Cardtype Role Search List Pointer
   Shark Administrator Wagneer CB_role Team Item Topic Project Task RichText].each do |sname|
  card = Card[sname]
  next out[sname] = "MISSING" unless card
  fmt = card.format
  present = VIEWS.select { |v| fmt.respond_to?(:"render_#{v}") }
  out[sname] = {
    "set_keys" => card.safe_set_keys,
    "views" => present.map(&:to_s).sort,
    "events" => begin
      Card::Event.all_events.map(&:to_s).sort.first(200)
    rescue StandardError => e
      "ERR:#{e.class}"
    end
  }
end
puts JSON.pretty_generate(out)