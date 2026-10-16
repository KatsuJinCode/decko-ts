import { describe, expect, it } from "vitest";
import { historyViewParams, jsonViewSearchParams, mapRenderError } from "../../../src/server/worker-shared-surface.js";
import { searchPagingNav } from "../../../src/card/render/search-paging.js";

describe("search paging request contract", () => {
  it("maps flat nested query vars and offset into HTML without losing history keys", () => {
    const params = new URLSearchParams("query[keyword]=Topic+%2B+Phrase&query[type]=Memo&offset=20&act_id=5");
    expect(jsonViewSearchParams(params)).toEqual({ vars: { keyword: "Topic + Phrase", type: "Memo" }, offset: 20 });
    expect(historyViewParams(params)).toEqual({ actId: "5", search: { vars: { keyword: "Topic + Phrase", type: "Memo" }, offset: 20 } });
    expect(jsonViewSearchParams(new URLSearchParams())).toBeUndefined();
  });
  it("encodes query values in every actual paging link and preserves headless bytes", () => {
    const html = searchPagingNav({ urlKey: "*search" }, { limit: 20, offset: 0, count: 45, query: { keyword: 'Topic + "<x>&' } });
    const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => new URL(match[1]!.replaceAll("&amp;", "&"), "https://local.test"));
    expect(links.length).toBeGreaterThan(1);
    expect(links.every(url => url.searchParams.get("query[keyword]") === 'Topic + "<x>&')).toBe(true);
    expect(html).not.toContain("<x>");
    expect(searchPagingNav({ urlKey: "Search" }, { limit: 20, offset: 0, count: 45 })).not.toContain("query%5B");
  });
  it("maps the stock anonymous parameter rejection to403", () => {
    expect(mapRenderError("limit parameter exceeds maximum for anonymous users (1000)").status).toBe(403);
  });
});
