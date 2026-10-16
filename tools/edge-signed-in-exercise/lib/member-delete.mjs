import {storedSessionActorId,verifiedActorSession,runForVerifiedActor} from './session-actor.mjs';

// Pass the CURRENT stored name (after rename), never the obsolete richName.
export async function memberDeleteJourney(ctx,target){
 const {stack,page,creds,signIn,record,database,visit,captureEvidence}=ctx;
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(stack.origin).hostname))throw Error('member deletion requires the disposable loopback fixture');
 const before=database().prepare('SELECT id,name,db_content,trash FROM cards WHERE name=? AND trash=0').get(target);
 if(!before)throw Error('member-delete target is not a live fixture card');
 const session=await signIn(creds.member);
 session.storedActorId=storedSessionActorId(database(),await page.context().cookies(stack.origin));
 const verified=verifiedActorSession(session,creds.member.id);
 record('the member is signed in',verified,{expectedActorId:creds.member.id,actualActorId:session.storedActorId,signedIn:session.landing?.signedIn===true});
 await runForVerifiedActor(session,creds.member.id,async()=>{
  const result=await page.evaluate(async({origin,target})=>{
   const response=await fetch(origin+'/delete/'+encodeURIComponent(target),{method:'DELETE',credentials:'include',redirect:'manual'});
   return{status:response.status,body:await response.text()};
  },{origin:stack.origin,target});
  const shown=result.body.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
  record("a member's delete attempt is refused with a clear message, not a form",result.status===403&&/sorry|permission|not allowed|denied|may not|sign in/i.test(shown),{status:result.status,actorId:session.storedActorId,target,raw:captureEvidence(result.body,{check:'member-delete-denial',target,status:result.status})});
  const after=database().prepare('SELECT id,name,db_content,trash FROM cards WHERE id=?').get(before.id);
  const fresh=await visit('/'+encodeURIComponent(target));
  record('the card the member tried to delete is still there',JSON.stringify(before)===JSON.stringify(after)&&fresh.status===200,{actorId:session.storedActorId,target,unchanged:JSON.stringify(before)===JSON.stringify(after),status:fresh.status});
 });
}
