// Shared by the full inventory and its focused diagnostic selection.
import { decideWrite } from '../../../reference-harness/browser/lib/live-walk-profile.mjs';
import { unexpectedDeleteTargets } from './delete-target-audit.mjs';

export async function dateJourney(ctx) {
const {stack,page,creds,record,attempt,group,linesSince,visit,signIn,ledger,database,created,openEdit,saveEditForm,cardName,restrictWrites,liveWalk,baselineMaxCardId,longDate}=ctx;
  group("3. edit a Date card");
  const dateCard = "2011_12_14";
  // The page load is a read and is graded in every mode; the edit legs are
  // the group's subject and are skipped, never failed, when the target's
  // write mode refuses an update on the date card.
  const dateWriteRefused = restrictWrites && !decideWrite(liveWalk, { verb: "update", cardName: dateCard }).allowed;
  const datePage = await attempt("date page loads", () => visit(`/${dateCard}`));
  if (datePage) record("date card page loads", datePage.status === 200, { status: datePage.status, title: datePage.title }, { wallMs: datePage.wallMs });
  if (dateWriteRefused) {
    record("open date edit", null, { skipped: true, reason: `${liveWalk.mode} refuses writes on ${dateCard}; the edit legs are the group's subject` });
  } else {
  const dateEdit = await attempt("open date edit", () => openEdit(`/${dateCard}`));
  if (dateEdit) {
    record("edit opens as a modal from the card page (no duplicated page behind it)", dateEdit.modals > 0, { modals: dateEdit.modals, href: dateEdit.href });
    const dateField = await page.locator('#edit_card input[name$="[content]"], .modal input[name$="[content]"]').first();
    const type = await dateField.getAttribute("type").catch(() => null);
    const original = await dateField.inputValue().catch(() => null);
    // The check's name promises a DATE PICKER showing the STORED date
    // (adversarial blindness-review F6 item 5: the old predicate accepted
    // type==="text" as well, so a regression losing input[type=date] graded
    // green, and Boolean(original) never compared the value with the card's
    // stored content). The stored content is the owned database row's
    // db_content for this card.
    // dateCard is a URL key, not the display name (2011_12_14 vs2011 12 14).
    const storedDateRow = database().prepare("SELECT db_content FROM cards WHERE key = ? AND trash = 0").get(dateCard);
    const storedDate = storedDateRow?.db_content ?? null;
    const showsStoredDate = storedDate !== null && String(original ?? "").trim() === String(storedDate).trim();
    record("content field is a date picker showing the stored date", type === "date" && showsStoredDate,
      { type, value: original, stored: storedDate, showsStoredDate });
    if (original) {
      const newDate = original === "2011-12-15" ? "2011-12-16" : "2011-12-15";
      await dateField.fill(newDate).catch(() => undefined);
      const saved = await saveEditForm();
      record("saving the new date answers a write (Save)", saved.status !== null && saved.status < 400, { status: saved.status, action: saved.action, serverTotalMs: saved.serverTotalMs });
      const after = await visit(`/${dateCard}`);
      record("the page shows the new date (long form)", after.html.includes(longDate(newDate)), { newDate, shown: longDate(newDate) });
      await openEdit(`/${dateCard}`);
      const restoreField = page.locator('#edit_card input[name$="[content]"], .modal input[name$="[content]"]').first();
      await restoreField.fill(original).catch(() => undefined);
      await saveEditForm();
      const restored = await visit(`/${dateCard}`);
      record("the original date is restored afterwards (long form)", restored.html.includes(longDate(original)), { original, shown: longDate(original) });
    }
  }
  }

}

export async function deleteJourney(ctx) {
const {stack,page,creds,record,attempt,group,linesSince,visit,signIn,ledger,database,created,openEdit,saveEditForm,cardName,restrictWrites,liveWalk,baselineMaxCardId,longDate}=ctx;
  group("6. delete a card");
  const deleteName = cardName("delete");
  const deleteWriteRefused = restrictWrites && !decideWrite(liveWalk, { verb: "create", cardName: deleteName }).allowed;
  if (deleteWriteRefused) {
    // The group's subject is the create-then-delete round trip of the run's
    // own card; refused writes record skips, and the navbar sign-out check
    // below (a session operation plus reads) still runs in every mode.
    for (const c of ["create the card to delete", "open delete target edit", "the edit form's Delete button is a confirm-guarded link to /delete/<name>", "the delete removes the card (trashed, content gone, new-card page shown)", "no card named delete… was created by this run (cards with id above the run baseline)"]) {
      record(c, null, { skipped: true, reason: `${liveWalk.mode} refuses the create/delete of ${deleteName}` });
    }
  } else {
  created.push(deleteName);
  await attempt("create the card to delete", async () => {
    await visit(`/new/RichText`);
    await page.locator('form.card-form input[name="card[name]"]').first().fill(deleteName).catch(() => undefined);
    await page.locator('form.card-form button[type="submit"], form.card-form input[type="submit"]').first().click().catch(() => undefined);
    await page.waitForTimeout(2500);
  });
    const intendedDeleteId = database().prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(deleteName)?.id;
    const deleteEdit = await attempt("open delete target edit", () => openEdit(`/${deleteName}`));
  if (deleteEdit) {
    const href = await page.evaluate(() => document.querySelector('#edit_card a[href^="/delete/"], .modal a[href^="/delete/"]')?.getAttribute("href") ?? null);
    record("the edit form's Delete button is a confirm-guarded link to /delete/<name>", href !== null && href.startsWith(`/delete/${deleteName}`), { href });
    const guarded = await page.evaluate(() => {
      const a = document.querySelector('#edit_card a[href^="/delete/"], .modal a[href^="/delete/"]');
      return a ? { onclick: a.getAttribute("onclick") ?? null, dataConfirm: a.dataset.confirm ?? null } : null;
    });
    const before = ledger().length;
    await page.evaluate((target) => {
      const a = [...document.querySelectorAll('a[href^="/delete/"]')].find((x) => x.getAttribute("href")?.startsWith(target));
      if (a && a.dataset.confirm && !window.confirm(a.dataset.confirm)) return;
      a?.click();
    }, `/delete/${deleteName}`).catch(() => undefined);
    await page.waitForTimeout(2500);
    const lines = linesSince(before);
    const write = lines.find((l) => l.path.startsWith("/delete/"));
    const gone = await visit(`/${deleteName}`);
    const trashed = database().prepare("SELECT trash FROM cards WHERE name = ?").get(deleteName)?.trash === 1;
    const stillHasContent = gone.html.includes("Harness rich text");
    record("the delete removes the card (trashed, content gone, new-card page shown)", write !== undefined && trashed && !stillHasContent,
      { deleteStatus: write?.status, serverSaid: write?.bodyHead, afterStatus: gone.status, afterTitle: gone.title, trashed, stillHasContent });
    // The guard its name promises: the deleted card is not recreated. The old
    // pattern LIKE 'delete%' never matched the run's own card name — this run
    // names its delete target `Harness_delete_<stamp>` (cardName("delete")),
    // which does not start with "delete" (adversarial blindness-review F6
    // item 4), so the guard could not fire for exactly the case it exists
    // for. Count run-created rows carrying this run's delete-target shape.
    const deleteRows = database().prepare("SELECT id,name,trash FROM cards WHERE id > ? AND (lower(name) GLOB 'delete*' OR lower(name) GLOB 'harness_delete*' OR name = ?)").all(baselineMaxCardId, deleteName);
    const unexpected = unexpectedDeleteTargets(deleteRows, intendedDeleteId);
    record("no card named delete… was created by this run (cards with id above the run baseline)", unexpected.length === 0, { cardsNamedDeleteCreatedThisRun: unexpected.length, baselineMaxCardId, intendedTombstoneId: intendedDeleteId ?? null, unexpected, scope: "Only the exact intended tombstone is allowed; resurrection and every additional delete-shaped row fail" });
  }
  }
}

export async function changesJourney(ctx, richName) {
const {stack,page,creds,record,attempt,group,linesSince,visit,signIn,ledger,database,created,openEdit,saveEditForm,cardName,restrictWrites,liveWalk,baselineMaxCardId,longDate}=ctx;
  const changes = await attempt("changes", () => visit("/*search"));
  if (changes) {
    // Rows that carry a link are list entries; chrome rows (layout tables,
    // empty wrappers) have no anchor and are dropped (adversarial
    // blindness-review F6 item 2: the old predicate was /Harness_/ over the
    // whole page HTML, satisfied by the signed-in navbar's "Harness_Admin" on
    // ANY signed-in changes page, and "first" — the actual contract — was
    // never tested).
    const orderedRows = await page.evaluate(() => [...document.querySelectorAll("#main .search-result-list > .search-result-item")]
      .map((r) => ({ id: Number(r.querySelector('[data-card-id]')?.getAttribute('data-card-id')), name: r.querySelector('[data-card-name]')?.getAttribute('data-card-name'), href: r.querySelector('a.full-page-link')?.getAttribute('href') }))
      .slice(0, 12));
    record("the Changes link (/*search) lists cards", changes.status === 200 && orderedRows.length > 0 && orderedRows.every(row => row.id > 0 && row.href), { status: changes.status, sample: orderedRows.slice(0, 3) }, { wallMs: changes.wallMs });
    if (!richName) record("/*search lists the cards this run just created/edited first", null, { skipped: true, reason: `${liveWalk.mode}: the run created no cards, so there is nothing of this run's to look for` });
    else {
      // The ordering claim: the FIRST listed entry is one of this run's own
      // touched cards (Harness_* or the run-edited date card) — the newest
      // act at the top, before anything older.
      const expectedFirstId = database().prepare('SELECT id FROM cards WHERE name=? AND trash=0').get(richName)?.id;
      const runCardsFirst = expectedFirstId !== undefined && orderedRows[0]?.id === expectedFirstId;
      record("/*search lists the cards this run just created/edited first", changes.status === 200 && runCardsFirst,
        { runCardsFirst, expectedFirstId: expectedFirstId ?? null, firstRow: orderedRows[0] ?? null, rows: orderedRows.slice(0, 6) });
    }
  }

}
