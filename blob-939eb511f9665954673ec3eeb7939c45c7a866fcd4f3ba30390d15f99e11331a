# Preserve raw view values in reference recordings

The stock oracle records `card.format(format).render(view)` directly through JSON. That value may be an integer, nil, array or hash. Recording through the engine's HTML-oriented `render()` applies `str()` first: integer `2` becomes `"2"`, nil becomes `""`, and hashes become `"[object Object]"`.

The SQLite and MySQL adapters now route explicit views through the existing `RenderEngine.renderRaw()` boundary. Page requests still use `renderPage()`. The MySQL recorder also forwards the requested format, as the other adapters already do. No expected output, normalizer or engine view body changes.

The real adapter regression records seven existing canonical synthetic operations and asserts the stock Ruby 3.3.12 values: integers, nil, nested arrays, an empty array and hashes. Before the change it fails with `"2" !== 2`; afterwards all seven answers retain their types. Commands:

```text
node --test reference-harness/runner/test/typed-render-adapter.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Both pass. The regression uses the actual SQLite adapter and engine over the harness protocol. The MySQL path shares that engine boundary but was not separately executed against a native MySQL server for this Node-only repair. A separate post-change capture/grade measures remaining view and write differences; this boundary correction does not establish mod completeness.
