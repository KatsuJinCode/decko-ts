import { expect, it } from "vitest";
import { enabledRolesDropdownHtml, type SessionRolesInput } from "../../../src/card/render/navbar-views.js";
const input: SessionRolesInput = { actorName: 'Alice', actorTypeKey: 'user', sessionTypeId: 10,
  sessionTypeName: 'Session', roles: ['Anyone Signed In', 'Neutral Role'] };
const known = { actor: true, accountSettings: true, signin: true };
it('keeps an unchecked held role available for re-enabling and serializes only enabled roles', () => {
  const html = enabledRolesDropdownHtml({ ...input, enabledRoles: ['Anyone Signed In'] }, known, false);
  const boxes = html.match(/<input type="checkbox"[^>]+>/g)!;
  expect(boxes).toHaveLength(2);
  expect(boxes[0]).toContain('checked="checked"');
  expect(boxes[1]).toContain('value="Neutral Role"');
  expect(boxes[1]).not.toContain('checked=');
  expect(html).toContain('type="hidden" value="Anyone Signed In" name="card[content]"');
});
it('default roles still render checked with the original first-render blank hidden input', () => {
  const html = enabledRolesDropdownHtml(input, known, false);
  expect(html.match(/checked="checked"/g)).toHaveLength(2);
  expect(html).toContain('type="hidden" name="card[content]"');
});
