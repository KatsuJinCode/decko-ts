// Rails HTML4::FullSanitizer text serialization used by strip_tags, not the
// distinct fast regex that Card::Content::Chunk::Nest uses for nest options.
import {Parser} from 'htmlparser2';
import {XHTML1_ENTITIES} from '../../../vendor/htmlentities-4.4.2/xhtml1.js';

function decodeHtml4References(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);?/gi,(match,body: string)=>{
    const numeric=body[0]==='#';
    const hex=numeric&&body[1]!.toLowerCase()==='x';
    const cp=numeric?Number.parseInt(body.slice(hex?2:1),hex?16:10):XHTML1_ENTITIES[body];
    if(cp===undefined)return match;
    if(cp===0||cp>0x10ffff||(cp>=0xd800&&cp<=0xdfff))return '';
    return String.fromCodePoint(cp);
  });
}

function html4Text(value: string): string {
  let result='',excluded=0;
  const parser=new Parser({
    onopentag(name){if(name==='script'||name==='style')excluded++;},
    onclosetag(name){if((name==='script'||name==='style')&&excluded)excluded--;},
    ontext(text){if(!excluded)result+=decodeHtml4References(text);},
  },{decodeEntities:false,recognizeSelfClosing:true});
  // libxml2's HTML4 parser consumes non-comment SGML declarations through
  // the first > (CDATA syntax is not an XML text escape in this context).
  parser.end(value.replace(/<!(?!--)[^>]*>/g,''));
  return result;
}

/** HTML-safe UTF8 text: named references become characters; &,<,> remain
 * escaped. Quotes and nonbreaking spaces remain literal, as Rails serializes. */
export function stripHtmlTags(value: string): string {
  return html4Text(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** Ruby to_text = HTMLEntities.decode(strip_tags(html)). */
export function htmlToText(value: string): string { return html4Text(value); }
