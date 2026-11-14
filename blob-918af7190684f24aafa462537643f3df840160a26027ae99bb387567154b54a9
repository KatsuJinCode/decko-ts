import { describe, expect, it } from "vitest";
import { createActionsTestStorage, seedCard } from "../actions/actions-test-storage.js";
import { buildFollowNotifyHook, fixedFollowerResolver, fixedTemplateResolver } from "../../../src/card/notify/follow-notify.js";
import { CaptureTransport } from "../../../src/card/notify/transport.js";
import { defaultFollowNotifyDeps } from "../../../src/card/notify/follower-resolver.js";

async function fixture() {
  const s = await createActionsTestStorage();
  for (const [id, name, codename, typeId] of [
    [1,"*all","all",2],[2,"Set","set",4],[3,"*read","read",4],
    [4,"RichText",null,4],[5,"Anyone","anyone",4],[6,"Anonymous","anonymous",4],
    [11,"Writer","decko_bot",4],[12,"Reader",null,4],[13,"Other Reader",null,4],
    [16,"*self","self",4],[40,"*head","head",4],
  ] as const) await seedCard(s,{id,name,codename,typeId});
  await seedCard(s,{id:8,leftId:1,rightId:3,dbContent:"[[Anyone]]"});
  await seedCard(s,{id:30,name:"Shared Document",dbContent:"public body"});
  await seedCard(s,{id:31,name:"Restricted Document",dbContent:"restricted body"});
  await seedCard(s,{id:36,leftId:31,rightId:16,typeId:2});
  await seedCard(s,{id:37,leftId:36,rightId:3,dbContent:"[[Reader]]"});
  await seedCard(s,{id:41,leftId:31,rightId:40,dbContent:"head body"});
  await s.driver.query("UPDATE cards SET read_rule_id = CASE WHEN id = 30 THEN 8 ELSE 37 END WHERE id IN (30,31,41)",[]);
  for(const [referer,referee,key,type] of [[8,5,"anyone","L"],[37,12,"reader","L"],[30,31,"restricted_document","I"]] as const)
    await s.driver.query("INSERT INTO card_references (referer_id,referee_id,referee_key,ref_type) VALUES (?,?,?,?)",[referer,referee,key,type]);
  await s.driver.query("INSERT INTO card_acts (id,card_id,actor_id,acted_at) VALUES (1,30,11,'2026-09-19 12:00:00')",[]);
  for(const [id,card] of [[1,30],[2,31],[3,41]] as const)
    await s.driver.query("INSERT INTO card_actions (id,card_id,card_act_id,action_type,draft) VALUES (?,?,1,0,0)",[id,card]);
  const views = async (recipient:number,card:number) => defaultFollowNotifyDeps(s.engine,{mail:{origin:"http://deck.example",deckoBotEmail:"bot@example.test"}}).views!({
    act:{actId:1,actor:{id:11,name:"Writer",email:null},silent:false,events:[],actCardName:"Shared Document"},
    actCardId:card,ref:{followerId:recipient,followerName:recipient===12?"Reader":"Other Reader",followerEmail:"reader@example.test",followedSetName:"*all",followOption:"*always"},
  });
  return {s,views};
}

describe("recipient read permissions on follow mail views",()=>{
  it("blanks restricted action details for another reader without blanking names and URLs",async()=>{
    const {s,views}=await fixture();try{
      const v=await views(13,31);
      expect(v.text["_|last_action_verb"]).toBe("");
      expect(v.text["_|list_of_changes"]).toBe("");
      expect(v.html["_|last_action_verb"]).toBe("");
      expect(v.html["_|list_of_changes"]).toBe("");
      expect(v.text["_|name"]).toBe("Restricted Document");
      expect(v.text["_|url"]).toBe("http://deck.example/Restricted_Document");
    }finally{s.close()}
  });
  it("keeps readable card details for any recipient",async()=>{
    const {s,views}=await fixture();try{
      const v=await views(13,30);expect(v.text["_|last_action_verb"]).toBe("created");
      expect(v.text["_|list_of_changes"]).toContain("public body");
    }finally{s.close()}
  });
  it("resolves each delivery independently and honors the actual read grant",async()=>{
    const {s,views}=await fixture();try{
      expect((await views(12,31)).text["_|list_of_changes"]).toContain("restricted body");
      expect((await views(13,31)).text["_|list_of_changes"]).toBe("");
    }finally{s.close()}
  });
  it("retains stock always-ok and set read overrides",async()=>{
    const {s,views}=await fixture();try{
      expect((await views(11,31)).text["_|list_of_changes"]).toContain("restricted body");
      expect((await views(13,41)).text["_|list_of_changes"]).toContain("head body");
    }finally{s.close()}
  });
  it("filters unreadable nested action details while preserving readable nested changes",async()=>{
    const {s,views}=await fixture();try{
      await s.driver.query("DELETE FROM card_actions WHERE card_id = 30",[]);
      const deniedNested = await views(13,30);
      expect(deniedNested.text["_|subedits"]).toBe("");
      expect(deniedNested.text["_|list_of_changes"]).not.toContain("restricted body");
      expect((await views(12,30)).text["_|subedits"]).toContain("restricted body");
    }finally{s.close()}
  });
});

async function nestedActNotice(s: Awaited<ReturnType<typeof fixture>>["s"], actorId = 11) {
  const transport = new CaptureTransport();
  const hook = buildFollowNotifyHook(defaultFollowNotifyDeps(s.engine, {
    mail:{origin:"http://deck.example",deckoBotEmail:"bot@example.test"},
    template:fixedTemplateResolver({to:"",from:"bot@example.test",subject:"{{_|name}}",textBody:"{{_|name}} {{_|last_action_verb}} {{_|subedits}}"}),
    followers:fixedFollowerResolver([{followerId:12,followerName:"Reader",followerEmail:"reader@example.test",followedSetName:"*all",followOption:"*always"}]),
  }));
  // The root was a no-op; only its nested card recorded an action.
  await s.driver.query("DELETE FROM card_actions WHERE card_id != 31",[]);
  await s.driver.query("UPDATE card_acts SET actor_id = ? WHERE id = 1",[actorId]);
  const actor={id:actorId,name:actorId===11?"Writer":"Other Reader",email:null};
  await hook.fireAct!({actId:1,actor,silent:false,actCardName:"Shared Document",events:[{
    card:{id:31,name:"Restricted Document",leftName:null,rightName:null,type:"RichText",content:"restricted body",trashed:false},
    actId:1,actionId:2,actor,verb:"update",silent:false,isDeletePath:false,
  }]},{transport});
  return transport.captured();
}

describe("stored act primary card and changes_visible?",()=>{
  it("announces the stored root when only an included card has an action",async()=>{
    const {s}=await fixture();try{
      const mail=await nestedActNotice(s);
      expect(mail).toHaveLength(1);
      expect(mail[0].subject).toBe("Shared Document");
      expect(mail[0].textBody).toContain("Restricted Document");
    }finally{s.close()}
  });
  it("does not notify when an unincluded subcard is the only action",async()=>{
    const {s}=await fixture();try{
      await s.driver.query("DELETE FROM card_references WHERE ref_type = 'I'",[]);
      expect(await nestedActNotice(s)).toEqual([]);
    }finally{s.close()}
  });
  it("checks affecting actions under the saving actor before recipient authorization",async()=>{
    const {s}=await fixture();try{
      // Recipient Reader can read the included document; saving Other Reader cannot.
      expect(await nestedActNotice(s,13)).toEqual([]);
    }finally{s.close()}
  });
});
