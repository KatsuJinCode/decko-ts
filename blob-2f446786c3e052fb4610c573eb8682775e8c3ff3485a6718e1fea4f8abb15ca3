# A right set (+*structure rules): nests and Card.fetch.
format :html do
  view :greeting, cache: :never do
    wrap_with :div, class: "greeting structure" do
      [
        nest("Tag 01", view: :name),
        nest("Tag 02", view: :link),
        h(t(:greeting_structure_note, default: "a structure rule"))
      ]
    end
  end

  view :greeting_fetch, cache: :never do
    Card.fetch("Tag 03") ? "Tag 03 is a card" : "Tag 03 is not a card"
  end
end
