export const VERSION = '4.1.0';
export const CACHE_KEY = 'my-home-state-v4';
export const TOKEN_KEY = 'home-read-token';
export const API = 'https://api.github.com/repos/kodama-clark/my-home-ranking/contents/data/listings.json';
export const clone = v => JSON.parse(JSON.stringify(v));
export const same = (a,b) => JSON.stringify(a??null) === JSON.stringify(b??null);
export const validUrl = s => {try {const u=new URL(s); return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}};
export const number = s => s===''||s==null||!Number.isFinite(Number(s))?null:Number(s);
export const now = () => new Date().toISOString();
export function normalize(h){
 if(!h||typeof h!=='object'||!String(h.id||'').trim()||!String(h.name||'').trim())return null;
 for(const k of ['sources','manualFields','revisionHistory','researchUpdates'])if(h[k]!=null&&(!Array.isArray(h[k])||h[k].some(v=>k==='manualFields'?typeof v!=='string':!v||typeof v!=='object')))return null;
 if(h.visitChecks!=null&&(typeof h.visitChecks!=='object'||Array.isArray(h.visitChecks)))return null;
 const out={...h,id:String(h.id),name:String(h.name)};
 for(const k of ['price','walk','landArea','buildingArea','fees'])if(out[k]!=null)out[k]=String(out[k]);
 return out;
}
export function parseData(raw){
 if(!raw||!Array.isArray(raw.homes))throw Error('物件データの形式を確認できませんでした。保存データは変更していません。');
 const seen=new Set();const homes=raw.homes.map(normalize);
 if(homes.some(h=>!h||seen.has(h.id)||!seen.add(h.id)))throw Error('物件IDの重複または必須項目の不足があります。');
 return {...raw,homes};
}
export function emptyState(){return {schema:4,homes:[],pending:{},meta:{},lastSync:'',migrationComplete:false};}
export function points(h){
 const p=number(h.price),w=number(h.walk),r=parseInt(h.rooms,10);
 const detail=[['価格',20,p==null?null:p<=3500?20:p<=3800?18:p<=4000?15:p<=4200?11:p<=4500?6:p<=5000?2:0],['交通',15,w==null?null:w<=7?15:w<=10?13:w<=15?10:w<=20?4:0],['ハザード',20,({safe:20,minor:12,medium:4,high:0})[h.hazard]??null],['坂道',10,({flat:10,gentle:7,steep:2,stairs:0})[h.slope]??null],['子育て',15,({good:15,ok:9,bad:2})[h.child]??null],['買い物',10,({good:10,ok:6,bad:1})[h.shops]??null],['建物',5,!Number.isFinite(r)||!h.building?null:(r>=4?3:r>=3?2:0)+(h.building==='新築2階建て'?2:h.building==='新築3階建て'?1:0)],['資産価値',5,({good:5,ok:3,bad:0})[h.asset]??null]];
 const max=detail.reduce((s,x)=>s+(x[2]===null?0:x[1]),0),earned=detail.reduce((s,x)=>s+(x[2]??0),0);
 return {total:max?Math.round(earned/max*100):null,max,earned,detail};
}
export function isLeasehold(h){return ['leasehold','fixed_term_leasehold'].includes(h.landTenure)||h.landTenure==='借地権';}
export function inHistory(h){return h.archived===true||['sold','withdrawn','group'].includes(h.listingStatus)||isLeasehold(h);}
export function tenure(h){return ({ownership:'所有権',leasehold:'借地権',fixed_term_leasehold:'定期借地権'})[h.landTenure]||'権利未確認';}
export function statusLabel(h){return h.archived?'見送り':({sold:'成約済み',withdrawn:'掲載終了',group:'分譲地の元資料',listed:'掲載確認済み',unverified:'販売状況未確認'})[h.listingStatus]||'販売状況未確認';}
export function requirementNotes(h){const out=[];if(number(h.price)>5000)out.push('物件価格が予算上限を超過');if(number(h.walk)>15)out.push('駅徒歩15分を超過');if(h.rooms&&parseInt(h.rooms,10)<3)out.push('居室3室未満（納戸は別）');if(h.building==='新築3階建て')out.push('3階建て');if(h.landTenure!=='ownership')out.push(tenure(h));if(number(h.price)!=null&&number(h.fees)==null)out.push('諸費用未確認');return out;}
export function canonicalUrl(s){const v=validUrl(s);if(!v)return '';const u=new URL(v);u.hash='';for(const k of [...u.searchParams.keys()])if(/^(utm_|fbclid|gclid)/.test(k))u.searchParams.delete(k);return u.href.replace(/\/$/,'');}
export function filterHomes(homes,f={}){
 return homes.filter(h=>f.view==='history'?inHistory(h):!inHistory(h)).filter(h=>f.view!=='favorites'||h.favorite).filter(h=>!f.q||[h.name,h.address,h.station,h.memo,h.userMemo].some(v=>String(v||'').toLowerCase().includes(f.q.toLowerCase()))).filter(h=>{
  for(const [key,limit]of [['price',f.budget],['walk',f.walk]])if(limit){const n=number(h[key]);if(n==null?!f.unknown:n>Number(limit))return false;}
  if(f.rooms){const n=parseInt(h.rooms,10);if(!n?!f.unknown:n<Number(f.rooms))return false;}return true;
 }).sort((a,b)=>f.sort==='new'?String(b.created||'').localeCompare(String(a.created||'')):f.sort==='price'?(number(a.price)??Infinity)-(number(b.price)??Infinity):f.sort==='coverage'?points(b).max-points(a).max:(points(b).total??-1)-(points(a).total??-1)||points(b).max-points(a).max);
}
export function enqueue(state,id,changes){
 const old=state.homes.find(h=>h.id===id);const patch={};
 for(const [k,v]of Object.entries(changes))if(!['id','__proto__','constructor','prototype'].includes(k)&&!same(old?.[k],v))patch[k]=clone(v);
 if(!Object.keys(patch).length)return state;
 const pending=state.pending[id]||{base:{},changes:{},rev:0,isNew:!old};
 for(const k of Object.keys(patch))if(!(k in pending.base))pending.base[k]=old?.[k]??null;
 const manualFields=[...new Set([...(old?.manualFields||[]),...Object.keys(patch).filter(k=>!['created','source','updated','favorite','visitChecks','archived'].includes(k))])];
 const entry={...pending,changes:{...pending.changes,...patch,manualFields,updated:now()},rev:pending.rev+1};
 const home={...old,...entry.changes,id};
 return {...state,homes:old?state.homes.map(h=>h.id===id?home:h):[home,...state.homes],pending:{...state.pending,[id]:entry}};
}
export function receive(state,remote){
 const data=parseData(remote);const ids=new Set(data.homes.map(h=>h.id));
 const homes=data.homes.map(h=>({...h,...(state.pending[h.id]?.changes||{})}));
 for(const h of state.homes)if(!ids.has(h.id)&&state.pending[h.id])homes.push(h);
 const {homes:unused,...meta}=data;return {...state,homes,meta,lastSync:now()};
}
export class ConflictError extends Error{constructor(conflicts){super('別の端末・更新と同じ項目が変更されています。内容を確認してください。');this.conflicts=conflicts;}}
export function mergePending(remote,pending){
 const data=clone(parseData(remote)),conflicts=[];
 for(const[id,e]of Object.entries(pending)){
  const i=data.homes.findIndex(h=>h.id===id),r=data.homes[i];
  if(!r&&!e.isNew){conflicts.push({id,field:'record',remote:null,local:e.changes});continue;}
  for(const[k,v]of Object.entries(e.changes)){
   if(['updated','manualFields'].includes(k))continue;
   if(r&&!same(r[k],e.base[k])&&!same(r[k],v))conflicts.push({id,field:k,remote:r[k]??null,local:v});
  }
  const h={...r,...e.changes,id,manualFields:[...new Set([...(r?.manualFields||[]),...(e.changes.manualFields||[])])]};
  if(i>=0)data.homes[i]=h;else data.homes.push(h);
 }
 if(conflicts.length)throw new ConflictError(conflicts);
 data.updated=now();return data;
}
export function acknowledge(state,sent,remote){
 const pending=clone(state.pending);
 for(const[id,e]of Object.entries(sent))if(pending[id]?.rev===e.rev)delete pending[id];else if(pending[id]){
  const r=remote.homes.find(h=>h.id===id);
  for(const k of Object.keys(pending[id].changes)){
   if(same(pending[id].changes[k],e.changes[k])){delete pending[id].changes[k];delete pending[id].base[k];}
   else pending[id].base[k]=r?.[k]??null;
  }
  pending[id].isNew=false;
 }
 return receive({...state,pending},remote);
}
export function base64Encode(text){const bytes=new TextEncoder().encode(text);let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
export function base64Decode(s){return new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)));}
export function httpError(status){return Object.assign(Error(status===401?'認証期限切れです。設定からトークンを更新してください。':status===403?'GitHubが操作を拒否しました。書き込み権限またはAPIの利用上限を確認してください。':status===404?'保存先が見つかりません。トークンの対象リポジトリを確認してください。':`通信エラー（HTTP ${status}）`),{status});}
export class GitHubStore{
 constructor(token,fetcher=(...args)=>globalThis.fetch(...args)){this.token=token;this.fetcher=fetcher;}
 async request(method,body){const r=await this.fetcher(API+(method==='GET'?'?ref=main&t='+Date.now():''),{method,headers:{Authorization:'Bearer '+this.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},cache:'no-store',...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});if(!r.ok)throw httpError(r.status);return r.json();}
 async read(){const file=await this.request('GET');return {data:parseData(JSON.parse(base64Decode(file.content))),sha:file.sha};}
 async verifyWrite(){
  const probe=globalThis.crypto.randomUUID();
  for(let attempt=0;attempt<3;attempt++){
   const {data,sha}=await this.read();
   const next={...data,connectionProbe:{id:probe,checkedAt:now(),version:VERSION}};
   try{await this.request('PUT',{message:'Verify app read/write connection',branch:'main',sha,content:base64Encode(JSON.stringify(next,null,2)+'\n')});}
   catch(e){if(e.status===409&&attempt<2)continue;throw e;}
   const confirmed=await this.read();
   if(confirmed.data.connectionProbe?.id!==probe)throw Error('保存後の再読込で確認できませんでした。物件情報は削除していません。');
   return confirmed.data;
  }
 }
 async write(pending){for(let attempt=0;attempt<3;attempt++){
  const {data,sha}=await this.read(),next=mergePending(data,pending);
  try{await this.request('PUT',{message:'Save home edits from app',branch:'main',sha,content:base64Encode(JSON.stringify(next,null,2)+'\n')});return next;}
  catch(e){if(e.status!==409||attempt===2)throw e;}
 }}
}

