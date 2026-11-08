(function(root){
  'use strict';
  const D=typeof module!=='undefined'&&module.exports?require('./domain'):root.DH;
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function parse(text){
    const next=D.validateBackup(JSON.parse(text));
    for(const change of next.changes){
      if(!change.before)throw new Error('备份变更记录缺少原任务');
      change.before=D.cleanTask(change.before,{strict:true});
    }
    // Each collection needs unique identities before references can be merged safely.
    for(const key of ['sources','changes','history']){
      const ids=new Set();
      for(const row of next[key]){
        if(!row.id||ids.has(row.id))throw new Error('备份存在无效或重复记录 ID');
        ids.add(row.id);
      }
    }
    return next;
  }
  function summary(next){
    const dates=next.tasks.map(t=>(t.dueAt||t.dueDate||'').slice(0,10)).filter(Boolean).sort();
    return {count:next.tasks.length,earliest:dates[0]||'',latest:dates.at(-1)||''};
  }
  function prepare(current,incoming,mode){
    const next=parse(JSON.stringify(incoming));
    if(mode==='replace')return next;
    if(mode!=='merge')throw new Error('请选择合并或替换');
    const result=structuredClone(current);
    // Preserve both versions on an ID collision, and rewrite all incoming references.
    function append(key,rows){
      const existing=new Map(result[key].map(r=>[r.id,r])),ids=new Map();
      const reserved=new Set([...existing.keys(),...rows.map(r=>r.id)]);
      for(const row of rows){
        const old=existing.get(row.id);
        if(old&&equal(old,row)){ids.set(row.id,row.id);continue;}
        const original=row.id;
        if(old){do{row.id=D.uid();}while(reserved.has(row.id));reserved.add(row.id);}
        ids.set(original,row.id);result[key].push(row);
      }
      return ids;
    }
    const sourceIds=append('sources',next.sources);
    function sources(t){
      if(!t)return t;
      if(t.sourceId)t.sourceId=sourceIds.get(t.sourceId)||t.sourceId;
      if(t.sourceIds)t.sourceIds=t.sourceIds.map(id=>sourceIds.get(id)||id);
      return t;
    }
    const taskIds=append('tasks',next.tasks.map(sources));
    for(const key of ['changes','history']){
      for(const row of next[key]){
        row.taskId=taskIds.get(row.taskId)||row.taskId;
        if(row.sourceId)row.sourceId=sourceIds.get(row.sourceId)||row.sourceId;
        for(const field of ['before','after','proposed'])if(row[field]){
          sources(row[field]);row[field].id=taskIds.get(row[field].id)||row[field].id;
        }
      }
      append(key,next[key]);
    }
    // Includes the existing 5000-entry limits; a merge must not create an unimportable backup.
    parse(JSON.stringify(result));
    return result;
  }
  function changed(before,after){
    const old=new Map(before.map(t=>[t.id,t]));let count=0;
    for(const task of after){if(!equal(old.get(task.id),task))count++;old.delete(task.id);}
    return count+old.size;
  }
  function due(meta,count,now=Date.now()){
    return count>0&&(!meta.lastExportAt||now-Date.parse(meta.lastExportAt)>=7*86400000||meta.changes>=10);
  }
  const api={parse,summary,prepare,changed,due};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DHBackup=api;
})(typeof window!=='undefined'?window:globalThis);
