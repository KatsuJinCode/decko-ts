# The Ruby oracle's adapter: stock Decko answering the harness protocol
# (reference-harness/SPEC.md) over stdin/stdout, one JSON object per line.
#
#   HARNESS_DECK_JSON=<fixture>/deck.json bundle exec decko runner adapter.rb
#
# DATABASE_URL names the deck copy this session owns, DECKO_FILES_DIR its
# files. stdout carries protocol lines only; everything else goes to stderr.

require_relative "lib/harness_env"

PROTOCOL = 1
SPEC = JSON.parse(File.read(ENV.fetch("HARNESS_DECK_JSON")))
HarnessEnv.freeze_clock!(SPEC["clock"])
HarnessEnv.apply_environment!(SPEC["environment"])
# The deck build compiled the asset outputs; a render never rewrites them.
Cardio.config.asset_refresh = :never
# Every request here stands for one that came through Decko's controller.
# Outside a controller Decko silences follower notifications
# (card-mod-follow set/all/notify.rb silence_notifications?); this restores
# what a served request does.
Card::Set::All::Notify.force_notifications = true

OUT = $stdout.dup
OUT.sync = true
$stdout.reopen($stderr) # Rails and Decko logging never reaches the protocol stream.

def emit(obj)
  OUT.write(JSON.generate(obj) + "\n")
end

def actor_id(name)
  case name
  when nil, "anonymous" then Card::AnonymousID
  else
    card_name = SPEC.dig("actors", name, "card") || raise("unknown actor #{name}")
    Card.fetch(card_name)&.id || raise("actor card missing: #{card_name}")
  end
end

def with_production_render
  old_env = Rails.env
  Rails.env = "production"
  yield
ensure
  Rails.env = old_env
end

SLOTLESS = /data-slot-id=(["'])\h+\1/.freeze

# ---- render -----------------------------------------------------------------
def op_render(req)
  card = Card.fetch(req.fetch("card"), new: {})
  html =
    with_production_render do
      if req["view"]
        card.format(:html).render(req["view"].to_sym)
      else
        card.format(:html).show(nil, {})
      end
    end
  { "html" => html }
end

# ---- ask --------------------------------------------------------------------
def card_identity(card)
  return { "exists" => false } if card.nil? || !card.real?

  {
    "exists" => true, "id" => card.id, "name" => card.name.to_s, "key" => card.key,
    "type" => card.type_name.to_s, "codename" => card.codename&.to_s,
    "left" => card.name.simple? ? nil : card.name.left_name.to_s,
    "right" => card.name.simple? ? nil : card.name.right_name.to_s,
    "read_rule" => card.read_rule_id && Card.fetch(card.read_rule_id)&.name.to_s,
  }
end

def name_algebra(str)
  n = Card::Name[str]
  {
    "s" => n.s, "key" => n.key, "url_key" => n.url_key, "parts" => n.parts.map(&:to_s),
    "simple" => n.simple?, "left" => n.simple? ? nil : n.left_name.to_s,
    "right" => n.simple? ? nil : n.right_name.to_s, "trunk" => n.trunk_name.to_s, "tag" => n.tag_name.to_s,
  }
end

def op_ask(req)
  q = req.fetch("q")
  case q
  when "card" then card_identity(Card.fetch(req.fetch("card")))
  when "permissions"
    card = Card.fetch(req.fetch("card"), new: {})
    %w[read create update delete].to_h { |task| [task, card.ok?(task.to_sym) ? true : false] }
  when "set_names"
    { "sets" => Card.fetch(req.fetch("card"), new: {}).set_names.map(&:to_s) }
  when "rule"
    rule = Card.fetch(req.fetch("card"), new: {}).rule_card(req.fetch("setting").to_sym)
    { "rule" => rule&.name&.to_s }
  when "search"
    query = req.fetch("query")
    if query["return"] == "count"
      { "count" => Card.search(query.transform_keys(&:to_sym)) }
    else
      { "names" => Card.search(query.merge("return" => "name").transform_keys(&:to_sym)).map(&:to_s) }
    end
  when "name" then name_algebra(req.fetch("name"))
  else raise ArgumentError, "unknown question #{q}"
  end
end

# ---- write ------------------------------------------------------------------
def write_args(fields)
  args = {}
  fields.to_h.each do |key, value|
    case key
    when "type" then args[:type_id] = Card.fetch(value)&.id || raise(ArgumentError, "unknown type #{value}")
    when "content", "name" then args[key.to_sym] = value
    when "fields" then args[:subcards] = value.transform_values { |v| { content: v.to_s } }
    else raise ArgumentError, "unknown write field #{key}"
    end
  end
  args
end

def mail_record(mail)
  text = mail.text_part ? mail.text_part.body.decoded : mail.body.decoded
  { "to" => Array(mail.to).sort, "subject" => mail.subject.to_s, "text" => text.to_s }
end

def op_write(req)
  action = req.fetch("action")
  card = nil
  begin
    case action
    when "create"
      card = Card.create(write_args(req["fields"]).merge(name: req.fetch("card")))
    when "update"
      card = Card.fetch(req.fetch("card")) || raise(ArgumentError, "no such card #{req['card']}")
      card.update(write_args(req["fields"]))
    when "delete"
      card = Card.fetch(req.fetch("card")) || raise(ArgumentError, "no such card #{req['card']}")
      card.delete
    else raise ArgumentError, "unknown write action #{action}"
    end
    errors = card.errors.map { |e| { "field" => e.attribute.to_s, "message" => e.message.to_s } }
  rescue Card::Error => e
    errors = [{ "field" => "exception", "message" => "#{e.class}: #{e.message}" }]
  end
  {
    "saved" => errors.empty?,
    "errors" => errors,
    "card" => card && card.id ? { "name" => card.name.to_s, "id" => card.id } : nil,
    "mail" => ActionMailer::Base.deliveries.map { |m| mail_record(m) },
  }
end

# ---- sign in ------------------------------------------------------------------
def op_signin(req)
  account = Card::Auth.authenticate(req.fetch("email"), req.fetch("password"))
  if account
    Card::Auth.signin account.left_id
    { "signed_in" => true, "actor" => Card::Auth.current.name.to_s }
  else
    { "signed_in" => false, "actor" => Card::Auth.current.name.to_s }
  end
end

HANDLERS = { "render" => :op_render, "ask" => :op_ask, "write" => :op_write, "signin" => :op_signin }.freeze

# The ready line names the Ruby this oracle IS, not only the gems: Ruby's own
# environment decides some output bytes (the class-token order of a `class`
# attribute differs between stock Windows and stock Linux Ruby at the same
# version), so a recorded answer is only interpretable next to the interpreter
# and platform that produced it. run.mjs copies this line into run-meta.json
# under runs.<kind>.engine, so every capture records its own environment.
emit("ready" => true, "protocol" => PROTOCOL, "engine" => "decko-ruby",
     "version" => { "decko" => Gem.loaded_specs["decko"]&.version.to_s,
                    "card" => Gem.loaded_specs["card"]&.version.to_s,
                    "ruby" => RUBY_VERSION,
                    "ruby_platform" => RUBY_PLATFORM,
                    "ruby_engine" => RUBY_ENGINE })

$stdin.each_line do |line|
  line = line.strip
  next if line.empty?

  req = JSON.parse(line)
  break if req["op"] == "quit"

  handler = HANDLERS[req["op"]]
  begin
    raise ArgumentError, "unknown op #{req['op']}" unless handler

    result = HarnessEnv.on_stack do
      HarnessEnv.begin_request!(actor_id(req["actor"]))
      send(handler, req)
    end
    emit("id" => req["id"], "ok" => true, "result" => result)
  rescue StandardError, SystemStackError => e
    emit("id" => req["id"], "ok" => false, "error" => { "class" => e.class.name, "message" => e.message.to_s[0, 500] })
  end
end
ActiveRecord::Base.connection.execute("PRAGMA wal_checkpoint(TRUNCATE)") rescue nil
