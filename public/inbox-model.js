(function(root){
 'use strict';const D=typeof module!=='undefined'&&module.exports?require('./domain'):root.DH;
 function save(state,fresh,updates,source){
  const receipt={before:updates.map(x=>structuredClone(state.tasks.find(t=>t.id===x.id))),after:[],sourceId:'',changes:[],history:[]};
  if(receipt.before.some(x=>!x))throw new Error('关联任务已删除，请重新比较。');
  const touched=[...fresh.map(x=>x.id),...updates.map(x=>x.id)];if(new Set(touched).size!==touched.length)throw new Error('本批次重复更新同一任务，请分开确认。');
  if(source&&!state.sources.some(x=>x.id===source.id)){state.sources.unshift(structuredClone(source));receipt.sourceId=source.id;}
  for(const t of fresh){if(state.tasks.some(x=>x.id===t.id))throw new Error('该任务已经保存，请勿重复提交。');state.tasks.push(D.cleanTask({...t,sourceId:source?.id||'',sourceIds:source?[source.id]:[]},{strict:true}));}
  for(const update of updates){
   const old=state.tasks.find(t=>t.id===update.id);if(JSON.stringify(old)!==JSON.stringify(update.before))throw new Error('任务已改变，请重新比较后保存。');
   const change={id:D.uid(),taskId:old.id,before:structuredClone(old),baseUpdatedAt:old.updatedAt,proposed:{...update.task,id:old.id},sourceId:source?.id||'',status:'pending',createdAt:new Date().toISOString()};
   state.changes.unshift(change);D.applyChange(state,change);receipt.changes.push(change.id);receipt.history.push(state.history[0].id);
  }
  receipt.after=state.tasks.filter(t=>touched.includes(t.id)).map(t=>structuredClone(t));return receipt;
 }
 function undo(state,receipt){
  for(const after of receipt.after)if(JSON.stringify(state.tasks.find(t=>t.id===after.id))!==JSON.stringify(after))throw new Error('任务在保存后已修改，不能直接撤销；请在任务详情处理。');
  const ids=new Set(receipt.after.map(x=>x.id));state.tasks=state.tasks.filter(t=>!ids.has(t.id));state.tasks.push(...structuredClone(receipt.before));
  state.changes=state.changes.filter(c=>!receipt.changes.includes(c.id));state.history=state.history.filter(h=>!receipt.history.includes(h.id));
  const used=state.tasks.some(t=>t.sourceId===receipt.sourceId||t.sourceIds.includes(receipt.sourceId))||state.changes.some(c=>c.sourceId===receipt.sourceId)||state.history.some(h=>h.sourceId===receipt.sourceId);
  if(receipt.sourceId&&!used)state.sources=state.sources.filter(s=>s.id!==receipt.sourceId);
 }
 const api={save,undo};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DHInboxModel=api;
})(globalThis);
