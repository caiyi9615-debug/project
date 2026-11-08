(function(root){
 'use strict';
 const D=typeof module!=='undefined'&&module.exports?require('./domain'):root.DH;
 const T=typeof module!=='undefined'&&module.exports?require('./time'):root.DHTime;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dateFields=new Set(['dueAt','dueDate','startsAt']);
 function fieldFor(message,task){
  if(/年|月|日期|截止|时间|时刻|拍摄|倒计时|剩余/.test(message))return /开始|活动/.test(message)?'startsAt':task.dueDate&&!task.dueAt?'dueDate':'dueAt';
  if(/状态|提交|批阅|完成/.test(message))return 'executionStatus';
  if(/课程|课名/.test(message))return 'course';
  if(/地点|位置|场地|教室/.test(message))return 'location';
  if(/标题|名称/.test(message))return 'title';
  if(/材料|清单|准备/.test(message))return 'checklist';
  return 'other';
 }
 const labels={dueAt:'截止日期与时间',dueDate:'截止日期',startsAt:'活动开始时间',executionStatus:'执行状态',course:'所属课程',location:'地点',title:'任务标题',checklist:'准备清单',other:'其他信息'};
 function issues(task){
  const messages=[...new Set((task.uncertain||[]).map(String).filter(x=>x.trim()))];
  const list=messages.map(message=>{const field=fieldFor(message,task);return {field,label:labels[field],message};});
  if(task.deadlineKind==='pending')list.push({field:'dueAt',label:labels.dueAt,message:'尚无完整截止日期，请补充核实，或明确保留待确认。'});
  else if((task.dueAt||task.dueDate||task.startsAt)&&(!task.dateConfirmed||!task.timeEvidence?.confirmed)){
   const field=task.dueAt?'dueAt':task.dueDate?'dueDate':'startsAt';
   list.push({field,label:labels[field],message:'日期与年份尚未人工核实，请对照原文确认。'});
  }
  return list;
 }
 const hasIssues=task=>issues(task).length>0;
 function markup(task){
  const list=issues(task);if(!list.length)return '';
  return `<div class="notice warn uncertainty-notice" role="note"><strong>以下信息待确认</strong><ul>${list.map(item=>`<li><span class="uncertainty-badge">${escape(item.label)} · 待确认</span> ${escape(item.message)}</li>`).join('')}</ul></div>`;
 }
 function reviewedTask(task,{values={},acknowledged=false,mode,dateAcknowledged=false}={}){
  if(!hasIssues(task))return D.cleanTask(structuredClone(task),{strict:true});
  if(!acknowledged)throw new Error('请逐项查看并勾选不确定信息，确认后才能保存。');
  const draft=structuredClone(task);
  for(const field of ['title','course','location','executionStatus','dueAt','dueDate','startsAt','deadlineKind'])if(Object.hasOwn(values,field))draft[field]=String(values[field]);
  const temporal=issues(task).some(item=>dateFields.has(item.field));
  if(temporal){
   if(mode==='pending'){
    draft.dueAt='';draft.dueDate='';draft.startsAt='';draft.deadlineKind='pending';draft.dateConfirmed=false;
    draft.timeEvidence={...draft.timeEvidence,confirmed:false,verification:'pending',inferred:false,yearInferred:false,yearReference:'',precision:'未知',method:'用户已查看不确定信息，原文不足，清空推测日期并保留待确认'};
   }else if(mode==='confirmed'){
    if(!dateAcknowledged)throw new Error('请对照原文明确确认年份、日期与时刻，或选择保留待确认。');
    if(draft.dueAt&&!T.valid(draft.dueAt)||draft.dueDate&&!T.dateOnly(draft.dueDate)||draft.startsAt&&!T.valid(draft.startsAt))throw new Error('日期格式无效，请填写准确日期。');
    if(draft.deadlineKind==='datetime'&&!T.valid(draft.dueAt)||draft.deadlineKind==='date'&&!T.dateOnly(draft.dueDate)||!['datetime','date','none'].includes(draft.deadlineKind))throw new Error('请填写并核实完整日期，或选择清空日期保留待确认。');
    if(draft.deadlineKind==='none'&&!T.valid(draft.startsAt))throw new Error('尚无可核实的日期，请选择保留待确认。');
    draft.dueAt=draft.deadlineKind==='datetime'?draft.dueAt:'';draft.dueDate=draft.deadlineKind==='date'?draft.dueDate:'';
    const changed=draft.dueAt!==task.dueAt||draft.dueDate!==task.dueDate||draft.startsAt!==task.startsAt;
    draft.dateConfirmed=true;
    draft.timeEvidence={...draft.timeEvidence,confirmed:true,verification:draft.deadlineKind==='date'?'date_only':'confirmed',method:changed?'用户修改并核对日期、年份与时刻':`${draft.timeEvidence?.method||'原文提取'}；用户已核对日期、年份与时刻`,...(changed?{inferred:false,yearInferred:false,yearReference:''}:{})};
   }else throw new Error('请选择核实日期保存，或明确清空日期保留待确认。');
  }
  return D.cleanTask(draft,{strict:true});
 }
 let reviewing=false;
 async function confirmTasks(tasks){
  const original=structuredClone(tasks),pending=original.map((task,index)=>({task,index})).filter(row=>hasIssues(row.task));
  if(!pending.length)return original;
  if(reviewing)return null;
  const dialog=root.document.querySelector('#uncertaintyDialog');
  if(!dialog)throw new Error('核对窗口尚未就绪，请刷新页面后重试。');
  reviewing=true;
  const field=(name,label,value,type='text')=>`<label class="field"><span>${label}</span><input data-review-value="${name}" type="${type}" value="${escape(value)}" ${name==='title'?'required maxlength="150"':''}></label>`;
  dialog.innerHTML=`<form id="uncertaintyForm"><div class="dialog-head"><div><h2 id="uncertaintyTitle">保存前核对不确定信息</h2><p class="small muted">请逐项查看；未核实的推测日期不能直接保存。</p></div><button class="review-close" type="button" data-uncertainty-cancel aria-label="取消核对">×</button></div><div class="dialog-body">${pending.map(({task,index})=>{
   const list=issues(task),temporal=list.some(item=>dateFields.has(item.field));
   const editable=new Set(list.map(item=>item.field));
   return `<fieldset class="uncertainty-review-row" data-uncertainty-row="${index}"><legend>${escape(task.title)}</legend><p class="small text-wrap">原文依据：${escape(task.timeEvidence?.raw||task.dateText||task.evidence||'未提供完整时间原文')}</p><div class="uncertainty-checks">${list.map((item,i)=>`<label class="check-label"><input type="checkbox" data-uncertainty-ack="${i}" required><span><strong>${escape(item.label)} · 待确认</strong>：${escape(item.message)}（已查看并核对）</span></label>`).join('')}</div>${[...editable].filter(name=>['title','course','location'].includes(name)).map(name=>field(name,labels[name],task[name])).join('')}${editable.has('executionStatus')?`<label class="field"><span>执行状态</span><select data-review-value="executionStatus">${Object.entries(T.statuses).map(([value,label])=>`<option value="${value}" ${task.executionStatus===value?'selected':''}>${label}</option>`).join('')}</select></label>`:''}${temporal?`<div class="form-grid"><label class="field"><span>截止信息类型</span><select data-review-value="deadlineKind">${[['datetime','日期＋时间'],['date','仅日期'],['pending','待确认'],['none','仅活动开始时间']].map(([value,label])=>`<option value="${value}" ${task.deadlineKind===value?'selected':''}>${label}</option>`).join('')}</select></label>${field('dueAt','准确截止日期与时间 · 待确认',task.dueAt,'datetime-local')}${field('dueDate','仅日期 · 待确认',task.dueDate,'date')}${field('startsAt','活动开始时间 · 待确认',task.startsAt,'datetime-local')}</div><label class="check-label"><input type="radio" name="uncertainty-mode-${index}" value="confirmed" required><span>使用上面核实或修改后的日期</span></label><label class="check-label"><input type="checkbox" data-date-ack><span>已对照原文核实填写的年份、日期与时刻</span></label><label class="check-label"><input type="radio" name="uncertainty-mode-${index}" value="pending" required><span>原文信息不足，清空推测日期，明确保留待确认</span></label>`:''}</fieldset>`;
  }).join('')}<p class="error uncertainty-error" role="alert"></p></div><div class="dialog-foot"><button class="button" type="button" data-uncertainty-cancel>返回修改</button><button class="button primary" type="submit">确认核对并继续保存</button></div></form>`;
  return new Promise(resolve=>{
   let settled=false;
   function finish(value){if(settled)return;settled=true;reviewing=false;dialog.removeEventListener('cancel',cancel);dialog.removeEventListener('close',closed);if(dialog.open)dialog.close();resolve(value);}
   const cancel=event=>{event.preventDefault();finish(null);},closed=()=>finish(null);
   dialog.addEventListener('cancel',cancel);dialog.addEventListener('close',closed);
   dialog.querySelectorAll('[data-uncertainty-cancel]').forEach(button=>button.onclick=()=>finish(null));
   dialog.querySelectorAll('[data-review-value="dueAt"],[data-review-value="dueDate"]').forEach(input=>input.oninput=()=>{if(input.value)input.closest('[data-uncertainty-row]').querySelector('[data-review-value="deadlineKind"]').value=input.dataset.reviewValue==='dueAt'?'datetime':'date';});
   dialog.querySelector('form').onsubmit=event=>{
    event.preventDefault();
    try{
     const updated=new Map();
     for(const row of dialog.querySelectorAll('[data-uncertainty-row]')){
      const index=Number(row.dataset.uncertaintyRow),values=Object.fromEntries([...row.querySelectorAll('[data-review-value]')].map(input=>[input.dataset.reviewValue,input.value]));
      const acknowledged=[...row.querySelectorAll('[data-uncertainty-ack]')].every(input=>input.checked);
      updated.set(index,reviewedTask(original[index],{values,acknowledged,mode:row.querySelector('input[type=radio]:checked')?.value,dateAcknowledged:row.querySelector('[data-date-ack]')?.checked===true}));
     }
     finish(original.map((task,index)=>updated.get(index)||task));
    }catch(error){dialog.querySelector('.uncertainty-error').textContent=error.message;}
   };
   try{dialog.showModal();}catch(error){reviewing=false;finish(null);}
  });
 }
 const api={issues,hasIssues,markup,reviewedTask,confirmTasks};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DHUncertainty=api;
})(typeof window!=='undefined'?window:globalThis);
