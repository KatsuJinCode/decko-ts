import {afterEach,describe,expect,it} from 'vitest';
import {localMailServices,type LocalMailRecord} from '../../deploy/bunny-worker-src/bunny-edge-local-mail.js';

const previousSink=globalThis.__deckoLocalMailSink;
afterEach(()=>{globalThis.__deckoLocalMailSink=previousSink});
const origin='https://127.0.0.1:8443';
const env={DECKO_LOCAL_MAIL:'1',DECKO_LOCAL_TOKEN_SECRET:'owned-test-secret',DECKO_LOCAL_ORIGIN:origin,DECKO_LOCAL_SITE_TITLE:'Owned test deck'};

describe('owned local account-mail capture',()=>{
 it('leaves the normal entry composition untouched unless explicitly armed',()=>{
  expect(localMailServices({})).toEqual({});
  expect(localMailServices({...env,DECKO_LOCAL_MAIL:'true'})).toEqual({});
 });
 it('requires a host-installed sink and refuses incomplete configuration',()=>{
  globalThis.__deckoLocalMailSink=undefined;
  expect(()=>localMailServices(env,origin+'/')).toThrow(/installed host sink/);
  expect(()=>localMailServices({...env,DECKO_LOCAL_TOKEN_SECRET:''},origin+'/')).toThrow(/incomplete/);
 });
 it.each([
  ['https://culturesmith-edge.bunny.run', 'https://culturesmith-edge.bunny.run/'],
  [origin,'https://culturesmith-edge.bunny.run/'],
  ['https://127.0.0.1:9443',origin+'/'],
  [origin+'/unexpected',origin+'/'],
 ])('refuses non-owned or mismatched capture destination %s',(configured,request)=>{
  globalThis.__deckoLocalMailSink=()=>{};
  expect(()=>localMailServices({...env,DECKO_LOCAL_ORIGIN:configured},request)).toThrow(/same loopback/);
 });
 it('captures complete messages in order without invoking a network transport',async()=>{
  const messages:LocalMailRecord[]=[];
  const sink=(message:LocalMailRecord)=>messages.push(message);
  globalThis.__deckoLocalMailSink=sink;
  const services=localMailServices(env,origin+'/reset').accountMail!;
  await services.transport.sendMail({to:'reader@example.test',from:'bot@example.test',subject:'reset',textBody:'local only'});
  await localMailServices(env,origin+'/save').accountMail!.transport.sendMail({to:'reader@example.test',from:'bot@example.test',subject:'follow',textBody:'second',htmlBody:'<p>second</p>',cc:'Other, Person <cc@example.test>',bcc:'bcc@example.test'});
  expect(messages.map(m=>[m.seq,m.subject])).toEqual([[1,'reset'],[2,'follow']]);
  expect(messages[1]?.htmlBody).toBe('<p>second</p>');
  expect(messages[1]?.cc).toBe('Other, Person <cc@example.test>');
  expect(services.origin).toBe(origin);
  const another:LocalMailRecord[]=[];
  globalThis.__deckoLocalMailSink=message=>another.push(message);
  await localMailServices(env,origin+'/reset').accountMail!.transport.sendMail({to:'other@example.test',from:'bot@example.test',subject:'new run',textBody:'isolated'});
  await services.transport.sendMail({to:'reader@example.test',from:'bot@example.test',subject:'late original run',textBody:'still isolated'});
  expect(another.map(m=>m.seq)).toEqual([1]);
  expect(messages.map(m=>m.seq)).toEqual([1,2,3]);
  expect(messages[2]?.subject).toBe('late original run');
 });
});
