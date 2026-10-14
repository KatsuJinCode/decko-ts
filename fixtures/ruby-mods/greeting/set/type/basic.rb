# A type set (RichText; codename :basic): overrides the all-set :greeting view.
include_set Abstract::GreetingBadge

format :html do
  view :greeting, cache: :never do
    wrap_with :div, class: "greeting rich" do
      [
        render_badge,
        link_to_card(card.name),
        link_to_card("Unwritten 001", "a missing card"),
        render_core
      ]
    end
  end
end
