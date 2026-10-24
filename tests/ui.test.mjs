import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
const core=readFileSync('src/core.mjs','utf8').replace(/^export /gm,''),app=readFileSync('src/app.js','utf8');
function harness(){
 const els=new Map(),events={},winEvents={},memory=new Map();
 const element=id=>{if(!els.has(id))els.set(id,{id,innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){},toggle(){}},addEventListener(k,fn){this[k]=fn;},setAttribute(){},focus(){},setSelectionRange(){}});return els.get(id);};
 const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const ctx=vm.createContext({document:{getElementById:element,querySelectorAll:()=>[],addEventListener:(k,fn)=>events[k]=fn,hidden:false},window:{scrollTo(){},addEventListener:(k,fn)=>winEvents[k]=fn},localStorage:storage,sessionStorage:{getItem:()=>null,removeItem(){}},navigator:{},URL,TextEncoder,TextDecoder,AbortSignal,Date,crypto:webcrypto,btoa,atob,fetch:async()=>{throw Error('offline');},setTimeout:()=>0,clearTimeout(){},console,confirm:()=>true,FormData:class{constructor(form){return form.pairs;}}});
 vm.runInContext(core+'\n'+app,ctx);
 const run=s=>vm.runInContext(s,ctx);
 return {ctx,run,els,events,memory,element};
}
const sample={id:'x',name:'テスト住宅',address:'テスト所在地',station:'テスト駅',walk:'',price:'4280',rooms:'3SLDK',building:'新築2階建て',memo:'原本調査',childNote:'小学校700m（資料記載）',sources:[{title:'テスト資料',pages:'1'}],privateExtra:'保持',created:'2026-10-20'};
test('物件別の調査結果・災害別リンク・重複候補が詳細から読める',()=>{
 const h=harness();h.ctx.fixture={...sample,listingReview:{checkedAt:'2026-10-21',note:'掲載価格を照合済み',url:'https://example.com/listing'},hazardReferences:[{type:'内水',url:'https://example.com/water'}],possibleDuplicateWith:['y'],researchUpdates:[{checkedAt:'2026-10-21',note:'面積は未確認',url:'https://example.com/research'}]};
 h.run('state=receive(emptyState(),{homes:[fixture,{id:"y",name:"重複候補"}]});go("detail","x")');
 const html=h.element('content').innerHTML;
 for(const text of ['掲載価格を照合済み','内水の公式資料','重複候補','面積は未確認'])assert.ok(html.includes(text));
 assert.ok(html.includes('href="https://example.com/water"'));
});
test('詳細・比較・編集・履歴・設定を例外なく表示',()=>{const h=harness();h.ctx.fixture=sample;h.run('state=receive(emptyState(),{homes:[fixture]});');for(const page of ['rank','new','favorites','history','detail','edit','compare','settings']){h.run(`go('${page}','x')`);assert.ok(h.element('content').innerHTML.length>100);}h.run("go('detail','x')");assert.match(h.element('content').innerHTML,/原本調査/);assert.match(h.element('content').innerHTML,/小学校700m/);assert.match(h.element('content').innerHTML,/3SLDK/);});
test('入力フォームの保存で未知項目と調査内容が失われない',()=>{const h=harness();h.ctx.fixture=sample;h.run("state=receive(emptyState(),{homes:[fixture]});state.migrationComplete=true;go('edit','x');");const form=h.element('homeForm');form.pairs=new Map([['name','テスト住宅'],['userMemo','私の内見メモ'],['memo','原本調査'],['price','4280'],['rooms','3SLDK']]);form.submit({preventDefault(){},target:form});const s=JSON.parse(h.memory.get('my-home-state-v4'));assert.equal(s.homes[0].privateExtra,'保持');assert.equal(s.homes[0].userMemo,'私の内見メモ');assert.equal(s.homes[0].sources[0].pages,'1');assert.equal(Object.keys(s.pending).length,1);assert.match(h.element('content').innerHTML,/私の内見メモ/);});
test('新規登録フォームはURLなしでも保存でき再起動で復元できる',()=>{const h=harness();h.run("go('edit')");const form=h.element('homeForm');form.pairs=new Map([['name','URLなしの家'],['price','3980'],['walk',''],['rooms','4LDK'],['url','']]);form.submit({preventDefault(){},target:form});const saved=JSON.parse(h.memory.get('my-home-state-v4'));assert.equal(saved.homes.length,1);assert.equal(saved.homes[0].price,'3980');h.ctx.saved=saved;h.run("state=JSON.parse(JSON.stringify(saved));go('rank')");assert.match(h.element('content').innerHTML,/URLなしの家/);});
test('悪意ある物件名・ID・メモ・URLはHTMLやイベントにならない',()=>{const h=harness();h.ctx.fixture={...sample,id:"x' onclick='alert(1)",name:'<img src=x onerror=alert(1)>',memo:'<script>alert(1)</script>',url:'javascript:alert(1)'};h.run('state=receive(emptyState(),{homes:[fixture]});go("detail",fixture.id)');const s=h.element('content').innerHTML;assert.ok(!s.includes('<script>'));assert.ok(!s.includes('<img'));assert.ok(!s.includes('href="javascript:'));assert.match(s,/&lt;script&gt;/);});
test('日本語IME変換中に検索欄を再生成せず、確定時に検索結果だけ更新する',()=>{
 const h=harness();h.ctx.fixture=sample;
 h.run('state=receive(emptyState(),{homes:[fixture,{...fixture,id:"y",name:"川崎市の新築",station:"登戸"}]});go("rank")');
 const original=h.element('content').innerHTML;
 assert.match(original,/id="search"/);
 assert.match(original,/id="listResults"/);
 const input=h.element('search');input.value='かわさ';
 h.events.compositionstart({target:input});h.events.input({target:input,isComposing:true});
 assert.equal(h.run('filters.q'),'');
 assert.equal(h.element('content').innerHTML,original);
 input.value='川崎';h.events.compositionend({target:input});
 assert.equal(h.run('filters.q'),'川崎');
 assert.match(h.element('listResults').innerHTML,/川崎市の新築/);
 assert.doesNotMatch(h.element('listResults').innerHTML,/テスト住宅/);
 assert.equal(h.element('content').innerHTML,original);
 input.value='登戸';h.events.input({target:input,isComposing:false});
 assert.equal(h.run('filters.q'),'登戸');
 assert.match(h.element('listResults').innerHTML,/川崎市の新築/);
 assert.equal(h.element('content').innerHTML,original);
 h.ctx.document.activeElement=input;h.run('render()');
 assert.equal(h.element('content').innerHTML,original);
});
test('生成HTMLとCSPのハッシュが一致しインラインonclickがない',()=>{const html=readFileSync('index.html','utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1],hash=createHash('sha256').update(script).digest('base64');assert.ok(html.includes("'sha256-"+hash+"'"));assert.ok(!/\sonclick\s*=/.test(html));new vm.Script(script);});
test('全実データの詳細を描画し、全候補をページ移動で表示',{skip:!existsSync('../my-home-ranking/data/listings.json')},()=>{const h=harness();h.ctx.data=JSON.parse(readFileSync('../my-home-ranking/data/listings.json','utf8'));h.run('state=receive(emptyState(),data)');for(const home of h.ctx.data.homes){h.ctx.id=home.id;h.run('go("detail",id)');assert.match(h.element('content').innerHTML,/情報源/);}h.run("go('rank')");let total=0;for(let n=1;n<=Math.ceil(h.ctx.data.homes.length/10);n++){h.run(`pageNumber=${n};render()`);total+=(h.element('content').innerHTML.match(/data-home=/g)||[]).length;if(h.run('pageNumber')<n)break;}assert.ok(total>=28);});

