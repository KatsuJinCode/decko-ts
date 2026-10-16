import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { matchingRichEditor } from '../lib/rich-editor.mjs';

test('field editor is focused instead of a destroyed global active editor', () => {
  let focused = 0;
  const selected = { initialized: true, getBody: () => ({}), selection: { getRng() {} }, focus() { focused++; } };
  const context = { document: { getElementById: id => id === 'field' ? {} : null },
    window: { tinymce: { activeEditor: { focus() { throw Error('destroyed global selection'); } }, get: id => id === 'field' ? selected : undefined } } };
  const run = args => runInNewContext(`(${matchingRichEditor.toString()})(${JSON.stringify(args)})`, context);
  assert.equal(run(['field', true]), true);
  assert.equal(focused, 1);
  assert.equal(run(['missing', true]), false);
  selected.initialized = false;
  assert.equal(run(['field', true]), false);
  selected.initialized = true;
  selected.selection = undefined;
  assert.equal(run(['field', true]), false);
  assert.equal(focused, 1);
});
