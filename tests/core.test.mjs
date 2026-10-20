import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {emptyState,enqueue,receive,mergePending,acknowledge,ConflictError,GitHubStore,base64Encode,base64Decode,points,filterHomes,parseData,validUrl} from '../src/core.mjs';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const remote=()=>({updated:'old',filters:{excludeLeasehold:true},other:{preserve:1},homes:[{id:'a',name:'既存物件',price:'4280',memo:'調査済み',hazardResearch:{officialUrl:'https://example.com'},created:'2026-10-20',privateField:'保持'}]});
test('端末の接続検証は書込後に再取得し物件・未知メタデータを保持する',async()=>{
 let db=remote(),puts=0,reads=0;
 const before=structuredClone(db);
 const store=new GitHubStore('test',async(u,o)=>{
  if(o.method==='GET'){reads++;return {ok:true,json:async()=>({sha:'s'+puts,content:base64Encode(JSON.stringify(db))})};}
  puts++;db=JSON.parse(base64Decode(JSON.parse(o.body).content));return {ok:true,json:async()=>({})};
 });
 const verified=await store.verifyWrite();
 assert.equal(reads,2);assert.equal(puts,1);assert.ok(verified.connectionProbe.id);
 assert.deepEqual(verified.homes,before.homes);assert.deepEqual(verified.other,before.other);
});
test('接続検証は読取専用権限や保存結果の不一致を成功扱いしない',async()=>{
 for(const mode of ['forbidden','stale']){
  const store=new GitHubStore('test',async(u,o)=>o.method==='GET'?{ok:true,json:async()=>({sha:'s',content:base64Encode(JSON.stringify(remote()))})}:mode==='forbidden'?{ok:false,status:403}:{ok:true,json:async()=>({})});
  await assert.rejects(store.verifyWrite(),mode==='forbidden'?/拒否/:/再読込/);
 }
});
test('新規物件の全項目が再起動後も残り、同期で消えない',()=>{let s=receive(emptyState(),remote());s=enqueue(s,'new',{name:'追加した家',price:'3999',walk:'8',rooms:'3SLDK',memo:'新規メモ'});s=JSON.parse(JSON.stringify(s));s=receive(s,remote());assert.equal(s.homes.length,2);assert.equal(s.homes.find(x=>x.id==='new').price,'3999');assert.equal(s.pending.new.changes.memo,'新規メモ');});
test('自分の編集以外の調査データ・メタデータを保持',()=>{const s=enqueue(receive(emptyState(),remote()),'a',{userMemo:'内見したい'});const r=remote();r.homes[0].price='4180';r.homes[0].newResearch='追加調査';const m=mergePending(r,s.pending);assert.equal(m.homes[0].price,'4180');assert.equal(m.homes[0].userMemo,'内見したい');assert.deepEqual(m.other,{preserve:1});assert.equal(m.homes[0].hazardResearch.officialUrl,'https://example.com');assert.equal(m.homes[0].privateField,'保持');});
test('同じ項目の競合は無言で上書きしない',()=>{const s=enqueue(receive(emptyState(),remote()),'a',{memo:'端末の編集'}),r=remote();r.homes[0].memo='別端末の編集';assert.throws(()=>mergePending(r,s.pending),ConflictError);});
test('保存中に増えた編集を送信済みにしない',()=>{let s=enqueue(receive(emptyState(),remote()),'a',{memo:'1回目'});const sent=structuredClone(s.pending),r=mergePending(remote(),sent);s=enqueue(s,'a',{memo:'2回目',price:'4000'});s=acknowledge(s,sent,r);assert.equal(s.pending.a.changes.memo,'2回目');assert.equal(s.pending.a.base.memo,'1回目');assert.equal(s.homes[0].memo,'2回目');assert.equal(mergePending(r,s.pending).homes[0].price,'4000');});
test('送信成功時だけ未送信キューから除く',()=>{let s=enqueue(receive(emptyState(),remote()),'a',{userMemo:'メモ'});const sent=structuredClone(s.pending);s=acknowledge(s,sent,mergePending(remote(),sent));assert.deepEqual(s.pending,{});assert.equal(s.homes[0].userMemo,'メモ');});
test('409なら最新SHAで再取得し追加情報を保全',async()=>{let reads=0,puts=0;const fetcher=async(url,opt)=>{if(opt.method==='GET'){reads++;let d=remote();if(reads===2)d.homes[0].price='4100';return {ok:true,json:async()=>({sha:'sha'+reads,content:base64Encode(JSON.stringify(d))})};}puts++;if(puts===1)return {ok:false,status:409};assert.equal(JSON.parse(opt.body).sha,'sha2');return {ok:true,json:async()=>({})};};const s=enqueue(receive(emptyState(),remote()),'a',{userMemo:'保存'});const out=await new GitHubStore('test',fetcher).write(s.pending);assert.equal(puts,2);assert.equal(out.homes[0].price,'4100');});
test('403やオフラインを成功扱いしない',async()=>{let s=enqueue(receive(emptyState(),remote()),'a',{userMemo:'保存'});await assert.rejects(new GitHubStore('test',async(u,o)=>o.method==='GET'?{ok:true,json:async()=>({sha:'x',content:base64Encode(JSON.stringify(remote()))})}:{ok:false,status:403}).write(s.pending),/拒否/);assert.equal(Object.keys(s.pending).length,1);await assert.rejects(new GitHubStore('test',async()=>{throw Error('offline')}).write(s.pending),/offline/);});
test('未知の徒歩やURLなしの物件を初期画面で表示',()=>{const list=[{id:'1',name:'未確認',walk:'',price:'',url:''},{id:'2',name:'対象',walk:'10',price:'4300'},{id:'3',name:'借地',landTenure:'leasehold'},{id:'4',name:'売却済',listingStatus:'sold'}];assert.deepEqual(filterHomes(list,{unknown:true}).map(h=>h.id).sort(),['1','2']);assert.equal(filterHomes(list,{walk:'15',unknown:true}).length,2);assert.equal(filterHomes(list,{walk:'15',unknown:false}).length,1);assert.equal(filterHomes(list,{view:'history'}).length,2);});
test('未調査は分母から除外、3SLDKを3室として計算',()=>{const h={price:'4280',walk:'14',rooms:'3SLDK',building:'新築2階建て'};assert.equal(points(h).max,40);assert.equal(points(h).earned,20);assert.equal(points(h).total,50);assert.equal(points({}).total,null);assert.equal(points({...h,hazard:'high'}).max,60);});
test('日本語の保存往復、危険なURLを拒否',()=>{const s='住宅・内見メモ🏠';assert.equal(base64Decode(base64Encode(s)),s);assert.equal(validUrl('javascript:alert(1)'), '');assert.throws(()=>parseData({homes:[{id:'x',name:'家'},{id:'x',name:'重複'}]}));});
test('実データの全レコードを欠損なく処理',{skip:!existsSync('../my-home-ranking/data/listings.json')},()=>{const d=parseData(JSON.parse(readFileSync('../my-home-ranking/data/listings.json','utf8')));assert.ok(d.homes.length>=22);for(const h of d.homes){assert.ok(points(h).total===null||Number.isFinite(points(h).total));}assert.equal(receive(emptyState(),d).homes.length,d.homes.length);});

test('ブラウザのfetchをWindow自身のメソッドとして呼び、GETとPUTを実行',async(t)=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',function(url,options){
  assert.equal(this,globalThis,'Window.fetch must receive its own global object');
  calls.push(options.method);
  if(options.method==='GET')return Promise.resolve({ok:true,json:async()=>({sha:'test-sha',content:base64Encode(JSON.stringify(remote()))})});
  return Promise.resolve({ok:true,json:async()=>({content:{sha:'saved'}})});
 });
 const store=new GitHubStore('test-token');
 const result=await store.read();
 assert.equal(result.data.homes.length,1);
 const state=enqueue(receive(emptyState(),result.data),'a',{userMemo:'保存確認'});
 const saved=await store.write(state.pending);
 assert.equal(saved.homes[0].userMemo,'保存確認');
 assert.deepEqual(calls,['GET','GET','PUT']);
});

