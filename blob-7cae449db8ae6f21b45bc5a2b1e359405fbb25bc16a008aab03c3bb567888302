import {createHash} from 'node:crypto';

// Identity witness for an already-tested browser sign-in. This does not
// replace the backend's expiry/revocation check: landing.signedIn is required.
// The bearer token and its digest never enter the returned evidence.
export function storedSessionActorId(database,cookies){
 const session=cookies.find(c=>c.name==='decko_ts_session'&&c.value);
 if(!session)return null;
 const hash=createHash('sha256').update(session.value).digest('hex');
 return database.prepare('SELECT account_card_id FROM auth_sessions WHERE token_hash=?').get(hash)?.account_card_id??null;
}
export function verifiedActorSession(result,expectedId){
 return Boolean(result?.hasSessionCookie&&result?.landing?.signedIn&&result.storedActorId===expectedId);
}
export async function runForVerifiedActor(result,expectedId,operation){
 if(!verifiedActorSession(result,expectedId))throw Error('requested actor session was not verified');
 return operation();
}
