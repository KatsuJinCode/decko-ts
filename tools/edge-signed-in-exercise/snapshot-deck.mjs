// Consistent export of an active local deck through SQLite's online backup API.
// https://www.sqlite.org/backup.html — never checkpoint or copy an active WAL.
import Database from 'better-sqlite3';
import {lstatSync,existsSync,mkdirSync,openSync,closeSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

function checkedPath(raw){
 if(typeof raw!=='string'||!/^[cC]:[\\/]/.test(raw))throw Error('snapshot paths must be explicit local C: paths');
 const path=resolve(raw);
 for(let cursor=path;;cursor=dirname(cursor)){
  try{if(lstatSync(cursor).isSymbolicLink())throw Error('snapshot paths may not traverse links')}catch(error){if(error.code!=='ENOENT')throw error}
  if(dirname(cursor)===cursor)break;
 }
 return path;
}
const info=path=>{try{const s=lstatSync(path);return{bytes:s.size,modifiedAt:s.mtime.toISOString()}}catch(error){if(error.code==='ENOENT')return null;throw error}};

export async function snapshotDeck({source,out,maxBytes=512*1024*1024}){
 const startedAt=new Date().toISOString(),started=Date.now();
 source=checkedPath(source);out=checkedPath(out);
 checkedPath(source+'-wal');checkedPath(source+'-shm');
 if(source.toLowerCase()===out.toLowerCase()||extname(out)!=='.sqlite3')throw Error('snapshot requires a separate new .sqlite3 destination');
 if(existsSync(out))throw Error('snapshot destination already exists');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw Error('invalid snapshot size limit');
 const before={main:info(source),wal:info(source+'-wal'),shm:info(source+'-shm')};
 const reader=new Database(source,{readonly:true,fileMustExist:true,timeout:5000});
 let progress,pageSize;
 try{
  pageSize=Number(reader.pragma('page_size',{simple:true}));
  if(Number(reader.pragma('page_count',{simple:true}))*pageSize>maxBytes)throw Error('deck exceeds snapshot size limit');
  mkdirSync(dirname(out),{recursive:true});closeSync(openSync(out,'wx',0o600));
  progress=await reader.backup(out,{progress:p=>{
   if(p.totalPages*pageSize>maxBytes)throw Error('growing deck exceeds snapshot size limit');
   return 1024;
  }});
 }finally{reader.close()}
 const copy=new Database(out,{fileMustExist:true});
 let cards,maxCardId,existingHarnessActors;
 try{
  // Only our new output is changed to standalone rollback-journal format.
  copy.pragma('journal_mode=DELETE');
  if(copy.pragma('quick_check',{simple:true})!=='ok')throw Error('snapshot integrity check failed');
  ({cards,maxCardId}=copy.prepare('SELECT COUNT(*) AS cards,MAX(id) AS maxCardId FROM cards').get());
  existingHarnessActors=copy.prepare("SELECT COUNT(*) AS n FROM cards WHERE name IN ('Harness Admin','Harness Member') AND trash=0").get().n;
 }finally{copy.close()}
 if((info(out+'-wal')?.bytes??0)>0)throw Error('snapshot output still has an active WAL');
 const bytes=readFileSync(out);
 const receipt={startedAt,completedAt:new Date().toISOString(),elapsedMs:Date.now()-started,source,out,
  sourceOpenedReadonly:true,sourceCheckpointRequested:false,sourceMayHaveConcurrentWriters:true,
  before,after:{main:info(source),wal:info(source+'-wal'),shm:info(source+'-shm')},
  snapshotBytes:bytes.length,snapshotSha256:createHash('sha256').update(bytes).digest('hex'),
  cards,maxCardId,existingHarnessActors,integrity:'ok',journalMode:'delete',progress,maxBytes};
 writeFileSync(out+'.receipt.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 return receipt;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const arg=name=>{const i=process.argv.indexOf('--'+name);return i<0?undefined:process.argv[i+1]};
 try{console.log(JSON.stringify(await snapshotDeck({source:arg('source'),out:arg('out')})))}catch(error){console.error(error.message);process.exitCode=1}
}
