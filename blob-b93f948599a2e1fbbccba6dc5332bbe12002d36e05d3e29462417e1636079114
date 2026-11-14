import {lstatSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

// DiskSteward's provider protection marker is operational data. Never hide it
// through shared Git excludes, and never generalize this exception to source.
export function sourceCustody(repo, status) {
  const entries = status.split(/\r?\n/).filter(Boolean);
  if (entries.some(entry => entry !== '?? .keep-root')) {
    throw new Error('commit the coherent source before capability capture');
  }
  const operationalFiles=[];
  if(entries.length){
    const path=join(repo,'.keep-root');
    const stat=lstatSync(path);
    if(!stat.isFile() || stat.isSymbolicLink() || stat.size>4096) throw new Error('invalid operational provider marker');
    const bytes=readFileSync(path);
    operationalFiles.push({path:'.keep-root',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),purpose:'DiskSteward node_modules provider protection'});
  }
  return {dirty:entries.length>0,sourceFilesClean:true,worktreeHasOperationalMarker:operationalFiles.length>0,operationalFiles};
}
