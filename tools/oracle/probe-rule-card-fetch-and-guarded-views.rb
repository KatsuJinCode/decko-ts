# probe-rule-card-fetch-and-guarded-views.rb - diagnostic for the guarded
# update arms of the view registry: why does Card.fetch("*all+*read") return
# nil on the oracle deck, and what does the update-guarded :edit_inline view
# render for Anonymous (default denial, skip_perms option, underscore form)?
#
# READ-ONLY: fetches and renders only; no card is saved.

def step(label)
  out =
    begin
      yield.inspect
    rescue StandardError => e
      "ERROR: #{e.class}: #{e.message[0, 200]}"
    end
  puts "#{label}: #{out[0, 400]}"
end

step("exists *all+*read")       { Card.exists?("*all+*read") }
step("exists *all+*update")     { Card.exists?("*all+*update") }
step("exists *update")          { Card.exists?("*update") }
step("exists Oracle Basics")    { Card.exists?("Oracle Basics") }
step("fetch *all+*read")        { c = Card.fetch("*all+*read"); c.nil? ? "NIL" : [c.id, c.name] }
step("fetch *all+*update")      { c = Card.fetch("*all+*update"); c.nil? ? "NIL" : [c.id, c.name] }
step("fetch *read (left)")      { c = Card.fetch("*read"); c.nil? ? "NIL" : [c.id, c.name] }
step("fetch *all (left)")       { c = Card.fetch("*all"); c.nil? ? "NIL" : [c.id, c.name] }
step("*read rule cards via SQL") do
  sql = "SELECT id, left_id, right_id, trash FROM cards WHERE right_id IN (SELECT id FROM cards WHERE codename = 'read') LIMIT 10"
  Card.connection.select_all(sql).to_a
end

Card::Auth.as(Card::AnonymousID) do
  step("anon ok? :read Oracle Basics")   { Card.fetch("Oracle Basics").ok?(:read) }
  step("anon ok? :update Oracle Basics") { Card.fetch("Oracle Basics").ok?(:update) }
  step("anon render :edit_inline default") do
    Card.fetch("Oracle Basics").format(:html).render(:edit_inline)[0, 300]
  end
  step("anon render :edit_inline skip_perms") do
    Card.fetch("Oracle Basics").format(:html).render(:edit_inline, skip_perms: true)[0, 200]
  end
  step("anon _render_edit_inline underscore") do
    Card.fetch("Oracle Basics").format(:html)._render_edit_inline[0, 200]
  end
  step("anon view_setting(:perms, :edit_inline)") do
    Card.fetch("Oracle Basics").format(:html).view_setting(:perms, :edit_inline)
  end
  step("anon view_setting(:denial, :edit_inline)") do
    Card.fetch("Oracle Basics").format(:html).view_setting(:denial, :edit_inline)
  end
  step("anon render :menu on *update") do
    Card.fetch("*update").format(:html).render(:menu)[0, 200].inspect
  end
  step("anon render :titled on *update (default denial)") do
    Card.fetch("*update").format(:html).render(:titled)[0, 300]
  end
end
$stdout.flush
