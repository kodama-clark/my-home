const CACHE='my-home-v4.1.0';
const ASSETS=['./index.html','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('my-home-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 // Never intercept or cache GitHub API traffic, credentials, or property data.
 if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
 if(e.request.mode==='navigate'){
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));}return r;}).catch(()=>caches.match('./index.html')));return;
 }
 if(ASSETS.some(p=>new URL(p,self.location).pathname===u.pathname))e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});

