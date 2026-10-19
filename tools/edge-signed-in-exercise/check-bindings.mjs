import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const REPO=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
export function runtimeHarnessFiles(){
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()
    ? entry.name==='test'?[]:walk(path.join(dir,entry.name))
    : entry.name.endsWith('.mjs')?[path.join(dir,entry.name)]:[]);
  return[path.join(REPO,'tools/edge-signed-in-exercise.mjs'),...walk(path.join(REPO,'tools/edge-signed-in-exercise'))];
}

/** Catch unbound runtime names without executing browser checks or imports.
 * The installed TS7 package exposes its native CLI, not the old compiler API.
 * Other JS typing/import diagnostics are outside this lexical-name gate. */
export function auditBindings(files=runtimeHarnessFiles()){
  for(const file of files){
    const relative=path.relative(REPO,path.resolve(file));
    if(relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Binding input must belong to this checkout');
  }
  const runtime=path.join(REPO,'.runtime');fs.mkdirSync(runtime,{recursive:true});
  const config=path.join(runtime,`edge-bindings-${process.pid}-${randomUUID()}.json`);
  const declarations=['globals','process','buffer','timers'].map(name=>path.join(REPO,'node_modules/@types/node/'+name+'.d.ts'));
  fs.writeFileSync(config,JSON.stringify({compilerOptions:{allowJs:true,checkJs:true,noEmit:true,noResolve:true,skipLibCheck:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2023','DOM'],types:[],strict:false},files:[...files,...declarations],include:[]}),{flag:'wx'});
  const started=performance.now();
  try{
    const result=spawnSync(process.execPath,[path.join(REPO,'node_modules/typescript/bin/tsc'),'-p',config,'--pretty','false'],{cwd:REPO,encoding:'utf8',windowsHide:true,maxBuffer:16_000_000,timeout:30_000});
    const output=(result.stdout??'')+(result.stderr??'');
    if(result.error||result.status===null)throw Error('Binding compiler did not complete: '+(result.error?.message??result.signal));
    const diagnostics=output.split(/\r?\n/).filter(line=>/error TS\d+:/.test(line));
    if(result.status!==0&&!diagnostics.length)throw Error('Binding compiler failed without diagnostics');
    const issues=diagnostics.filter(line=>/error TS(?:2304|2552|18004):/.test(line));
    const fatal=diagnostics.filter(line=>/error TS(?:1\d{3}|5\d{3}|6053|6231|2688|18003):/.test(line));
    return{pass:issues.length===0&&fatal.length===0,files:files.length,elapsedMs:performance.now()-started,compilerExit:result.status,otherTypeDiagnostics:diagnostics.length-issues.length-fatal.length,issues,fatal,
      scope:'Lexical names only. Node/DOM globals are declared; imports are neither followed nor executed. Infrastructure/syntax failures refuse a pass; unrelated JS type diagnostics are preserved as a count.'};
  }finally{fs.unlinkSync(config)}
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{const result=auditBindings();console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1}
  catch(error){console.error(error.message);process.exitCode=1}
}
