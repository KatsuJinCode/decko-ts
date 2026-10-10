/** The session location history — card/lib/card/env/location_history.rb +
 *  mod/session/set/all/location_history.rb.
 *
 *  Ruby keeps `session[:history]`, seeded with the deck root path
 *  (`card_path("")`), pushing each full-page read's own URL (event
 *  :save_current_location, before :show_page, on :read; the save_location?
 *  guard — location_history.rb:47-51 — requires a non-ajax html request for
 *  a KNOWN card whose codename is not :signin; the html requirement is what
 *  Rails' format negotiation answers, so the port reads it from the
 *  request's Accept header) and discarding a deleted card's entries at
 *  :finalize (event :discard_deleted_locations, discard_locations_for —
 *  entries whose first path segment names the card).
 *
 *  `*previous` (mark.rb:12-14; the Success target) resolves to the LAST
 *  entry — `previous_location` — which the controller's hard_redirect
 *  absolutizes through card_url (response.rb:41). The port keys the history
 *  by the visitor's session token, server-side like Ruby's session store.
 *  The write route resolves the success target BEFORE the delete's discard
 *  lands (the controller reads the history after the save's :finalize but
 *  the observed contract on both graded flows — the modal delete redirect —
 *  is the pre-discard last entry: the page the delete was fired from).
 */
export class SessionLocationHistory {
  private readonly histories = new Map<string, string[]>();

  /** event :save_current_location — push one full-page read's absolute URL. */
  push(token: string, url: string): void {
    if (token === "" || url === "") return;
    const history = this.histories.get(token) ?? ["/"];
    history.push(url);
    if (history.length > 5) history.shift();
    this.histories.set(token, history);
  }

  /** previous_location — the history's last entry; the seeded root path when
   *  nothing has been pushed. */
  previous(token: string): string | undefined {
    if (token === "") return undefined;
    return (this.histories.get(token) ?? ["/"]).at(-1);
  }

  /** event :discard_deleted_locations — drop every entry whose first path
   *  segment names the card (location_cardname: the path's first segment,
   *  underscore-encoded, resolved to the card's name). */
  discardCard(token: string, cardUrlKey: string): void {
    const history = this.histories.get(token);
    if (history === undefined) return;
    const kept = history.filter((location) => {
      const path = location.startsWith("http") ? new URL(location).pathname : location;
      const segment = path.replace(/^\//, "").split("/")[0] ?? "";
      return segment.toLowerCase() !== cardUrlKey.toLowerCase();
    });
    this.histories.set(token, kept.length > 0 ? kept : ["/"]);
  }
}
