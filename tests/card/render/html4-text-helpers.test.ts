import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {stripHtmlTags,htmlToText} from '../../../src/card/render/html-text.js';
import {truncateHtmlSafeText,truncate} from '../../../src/card/render/text-helpers.js';
const ruby=JSON.parse(readFileSync(new URL('./fixtures/ruby33-html4-text-helpers.json',import.meta.url),'utf8'));
for(const row of ruby.rows)it('matches actual Ruby HTML4 strip/truncate for '+JSON.stringify(row.input),()=>{
 expect(stripHtmlTags(row.input)).toBe(row.stripped);
 expect(truncateHtmlSafeText(stripHtmlTags(row.input),12)).toBe(row.truncated);
});
it('keeps encoded script as escaped visible text and drops actual executable elements',()=>{
 expect(stripHtmlTags('&lt;img src=x onerror=alert(1)&gt;')).toBe('&lt;img src=x onerror=alert(1)&gt;');
 expect(stripHtmlTags('<script>alert(1)</script><style>x</style><b>safe</b>')).toBe('safe');
 expect(htmlToText('<b>before &mdash; after &amp; done</b>')).toBe('before — after & done');
});
it('counts supplementary characters as Ruby characters and leaves combining characters separate',()=>{
 expect(truncate('a🙂b🙂c',4)).toBe('a...');
 expect(truncate('🙂🙂🙂🙂🙂',4,'…')).toBe('🙂🙂🙂…');
 expect(truncate('e\u0301xyz',4,'…')).toBe('e\u0301x…');
 expect(truncateHtmlSafeText('&lt;script&gt;',7)).toBe('&amp;lt;...');
});
