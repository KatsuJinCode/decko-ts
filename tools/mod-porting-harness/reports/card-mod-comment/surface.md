# card-mod-comment-0.20.0 — behavior surface

What this mod does (mined from the Ruby gem source, READ-ONLY):

- 7 view(s), 1 event hook(s), 1 seed card(s).
- 3 set module file(s); 1 asset file(s); 0 public/ asset file(s).

## Views

- `comment_box` — , denial: :blank, unknown: true, perms: :update do — card-mod-comment-0.20.0/set/all/comment.rb:46
- `core` — , unknown: true do — card-mod-comment-0.20.0/set/right/discussion.rb:8
- `input` — do — card-mod-comment-0.20.0/set/right/discussion.rb:12
- `open` — , unknown: true do — card-mod-comment-0.20.0/set/right/discussion.rb:1 (loop-declared)
- `open_content` — , unknown: true do — card-mod-comment-0.20.0/set/right/discussion.rb:1 (loop-declared)
- `titled` — , unknown: true do — card-mod-comment-0.20.0/set/right/discussion.rb:1 (loop-declared)
- `titled_content` — , unknown: true do — card-mod-comment-0.20.0/set/right/discussion.rb:1 (loop-declared)

## Events

- `add_comment` , :prepare_to_store, on: :save, when: :comment do — card-mod-comment-0.20.0/set/all/comment.rb:5

## Seed cards

- discussion (codename discussion) — data/real.yml
