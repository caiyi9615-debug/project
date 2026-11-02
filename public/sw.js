'use strict';
// Cache the public shell only. Never cache AI responses, settings, or user images.
const SHELL_CACHE='deadline-hunter-shell-v2.5.0';
const SHELL=['/index.html','/styles.css','/planner.css','/capture.css','/experience.css','/simple.css','/simple-ui.js','/workbench.js','/inbox-model.js','/quick-add.js','/quick-add.css','/app.js','/time.js','/fidelity.js','/domain.js','/store.js','/review.js','/planner.js','/planner-ui.js','/advisor-ui.js','/push-client.js','/experience.js','/manifest.webmanifest','/push-icon-192.png','/push-icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const key of await caches.keys())if((key.startsWith('deadline-hunter-shell-')||key.startsWith('dh-v3-shell-'))&&key!==SHELL_CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(url.origin!==self.location.origin||e.request.method!=='GET'||url.pathname.startsWith('/api/'))return;if(e.request.mode!=='navigate'&&!SHELL.includes(url.pathname))return;e.respondWith((async()=>{const cache=await caches.open(SHELL_CACHE);try{const response=await fetch(e.request);if(response.ok)await cache.put(e.request.mode==='navigate'?'/index.html':url.pathname,response.clone());return response;}catch{return await cache.match(e.request.mode==='navigate'?'/index.html':url.pathname)||new Response('离线资源尚未缓存，请联网打开一次。',{status:503});}})());});
async function localTaskAllowed(message){
 if(!message.taskId)return true;
 return new Promise(resolve=>{
  const r=indexedDB.open('deadline-hunter-campus-v2');
  r.onupgradeneeded=()=>{r.transaction.abort();resolve(false);};
  r.onerror=()=>resolve(false);
  r.onsuccess=()=>{
   const db=r.result;if(!db.objectStoreNames.contains('state')){db.close();resolve(false);return;}
   const tx=db.transaction('state','readonly'),get=tx.objectStore('state').get('main');
   get.onsuccess=()=>{const t=get.result?.tasks?.find(t=>t.id===message.taskId);resolve(!!t&&t.dueAt===message.dueAt&&t.dateConfirmed===true&&['unsubmitted','overdue'].includes(t.executionStatus));};
   get.onerror=()=>resolve(false);tx.oncomplete=()=>db.close();
  };
 });
}
self.addEventListener('push',e=>e.waitUntil((async()=>{
 let m;try{m=e.data.json();}catch{return;}
 if(!m||m.expires<Date.now()||!await localTaskAllowed(m))return;
 await self.registration.showNotification(m.title||'Deadline Hunter',{body:m.body,tag:m.tag,icon:'/push-icon.svg',data:{url:m.url||'/#tasks'}});
})()));
self.addEventListener('notificationclick',e=>{
 e.notification.close();
 e.waitUntil((async()=>{
  const url=new URL(e.notification.data?.url||'/#tasks',self.location.origin);
  if(url.origin!==self.location.origin)return;
  for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))if(new URL(client.url).origin===url.origin){await client.navigate(url.href);await client.focus();return;}
  await self.clients.openWindow(url.href);
 })());
});
