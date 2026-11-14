# A small third-party-style card-mod, written the way a deck owner writes one
# under mod/<name>/set/: one HTML view and one event. It is loaded unmodified
# by stock Ruby Decko and by the TypeScript port (through ruby.wasm).

format :html do
  view :greeting, cache: :never do
    wrap_with :div, class: "greeting greeting-#{card.type_name.downcase}" do
      [
        content_tag(:span, "Hello, #{h card.name}!", class: "greeting-name"),
        greeting_type_note,
        render_core
      ]
    end
  end

  view :greeting_title, :greeting

  def greeting_type_note
    content_tag :small, "(a #{h card.type_name} card)"
  end
end

event :sign_greeting, :prepare_to_store, on: :create, when: :greeting_card? do
  self.content = "#{content} -- greeted"
end

def greeting_card?
  name.to_s.start_with? "Greeting"
end
