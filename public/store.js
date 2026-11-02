'use strict';
window.CampusStore = (() => {
  let db;
  function open() {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('deadline-hunter-campus-v2',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('state');
      request.onsuccess=()=>{db=request.result;db.onversionchange=()=>db.close();resolve();};
      request.onerror=()=>reject(new Error('无法打开本地数据库，请检查浏览器隐私设置。'));
      request.onblocked=()=>reject(new Error('本地数据库被其他标签页占用，请关闭旧标签页重试。'));
    });
  }
  async function read() {
    if(!db)await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readonly');
      const request=tx.objectStore('state').get('main');
      request.onsuccess=()=>{
        try{
          const state=request.result||{version:2,tasks:[],sources:[],changes:[],history:[],theme:'light'};
          state.tasks=state.tasks.map(t=>DH.cleanTask(t));
          for(const c of state.changes){c.before=DH.cleanTask(c.before);c.proposed=DH.cleanTask(c.proposed);}
          for(const h of state.history){h.before=DH.cleanTask(h.before);h.after=DH.cleanTask(h.after);}
          resolve(state);
        }catch{reject(new Error('旧数据迁移失败，请保留浏览器数据并联系维护者。'));}
      };
      request.onerror=()=>reject(new Error('读取本地数据失败。'));
    });
  }
  async function write(state) {
    if(!db)await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readwrite');
      tx.objectStore('state').put(structuredClone(state),'main');
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(new Error('本地保存失败，可能存储空间不足。请导出备份并释放空间。'));
      tx.onerror=()=>{};
    });
  }
  return {read,write};
})();
