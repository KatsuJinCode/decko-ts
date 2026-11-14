# An abstract set: reaches cards only through include_set.
format :html do
  view :badge do
    greeting_badge card.name
  end

  def greeting_badge text
    content_tag :span, text, class: "badge"
  end
end
