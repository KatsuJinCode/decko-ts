import {beforeAll,afterAll,it,expect} from 'vitest';
import {createRenderTestStorage,seedCard,bindModLoaderToEngine,type RenderTestStorage} from '../render/render-test-storage.js';
import {ModLoader,modEngineHost} from '../../../src/card/mod-loader.js';
import {coreView} from '../../../src/card/render/views.js';
import cardModFormat from '../../../src/card/mod-loader/mods/card-mod-format.js';
let storage:RenderTestStorage;let loader:ModLoader;
beforeAll(async()=>{storage=await createRenderTestStorage();await seedCard(storage,{id:200,name:'Text Probe',dbContent:'<p>before &mdash; after &amp; done</p>'});await seedCard(storage,{id:201,name:'Base Override Probe'});await seedCard(storage,{id:202,name:'Nested Target'});await seedCard(storage,{id:203,name:'Nested Text Probe',dbContent:'<b>Hi {{Nested Target|name}}</b> &amp; bye'});loader=new ModLoader([{manifest:cardModFormat},{manifest:{...cardModFormat,name:'text-core-parent-control',setModules:[{setPath:'all/text_core_parent_control',formats:{base:{views:[{view:'core',viewFn:ctx=>ctx.fmt.card.name.s==='Base Override Probe'?'<i>parent &copy;</i>':coreView(ctx)}]}}}]}}]);loader.load();bindModLoaderToEngine(storage,loader);await loader.installInto(modEngineHost(storage.engine,storage.fetcher));});
afterAll(()=>{loader?.reset();storage?.close();});
it('text core runs its base core through HTML4 text decoding',async()=>{expect(await storage.engine.render('Text Probe','core',{format:'text'})).toBe('before — after & done');});
it('HTML core keeps the markup and references',async()=>{expect(await storage.engine.render('Text Probe','core',{format:'html'})).toBe('<p>before &mdash; after &amp; done</p>');});
it('email text inherits TextFormat instead of HTML core',async()=>{expect(await storage.engine.render('Text Probe','core',{format:'email_text'})).toBe('before — after & done');});


it('delegates to the actual base-format core override before decoding',async()=>{expect(await storage.engine.render('Base Override Probe','core',{format:'text'})).toBe('parent ©');});
it('preserves parent content nesting before text extraction',async()=>{expect(await storage.engine.render('Nested Text Probe','core',{format:'text'})).toBe('Hi Nested Target & bye');});
it('does not make a denied card readable in text format',async()=>{const denied=await createRenderTestStorage({bootstrapReadRules:false});try{await seedCard(denied,{id:200,name:'Secret Text',dbContent:'never disclose'});bindModLoaderToEngine(denied,loader);expect(await denied.engine.render('Secret Text','core',{format:'text'})).toBe('');}finally{denied.close();}});
