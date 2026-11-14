import {expect,it} from 'vitest';
import {STOCK_RESPONSE_SECURITY_HEADERS,withStockResponseSecurity} from '../../src/server/stock-response-security.js';

it('adds measured Ruby defaults without consuming the body or changing explicit policy, cookies or transport',async()=>{
 const headers=new Headers({'content-type':'application/octet-stream','x-frame-options':'DENY','cache-control':'no-store','server-timing':'total;dur=3','location':'/next'});
 headers.append('set-cookie','one=1; HttpOnly');headers.append('set-cookie','two=2; HttpOnly');
 const original=new Response(new Uint8Array([0,255,7]),{status:206,statusText:'Partial Content',headers}),response=withStockResponseSecurity(original);
 expect(response.status).toBe(206);expect(response.statusText).toBe('Partial Content');expect(response.headers.get('x-frame-options')).toBe('DENY');
 expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');expect(response.headers.get('x-content-type-options')).toBe('nosniff');
 expect(response.headers.get('x-download-options')).toBe('noopen');expect(response.headers.get('x-permitted-cross-domain-policies')).toBe('none');expect(response.headers.get('x-xss-protection')).toBe('1; mode=block');
 for(const name of ['content-type','cache-control','server-timing','location'])expect(response.headers.get(name)).toBe(headers.get(name));
 expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0,255,7]);
});

it('keeps complete explicit policies and non-HTTP error responses intact',()=>{
 const response=new Response('same',{headers:STOCK_RESPONSE_SECURITY_HEADERS});expect(withStockResponseSecurity(response)).toBe(response);
 const error=Response.error();expect(withStockResponseSecurity(error)).toBe(error);
});
