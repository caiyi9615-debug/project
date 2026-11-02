'use strict';
window.DHAdvisor=(()=>{
 const P=window.DHPlanner,T=window.DHTime,D=window.DH;
 const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let api,current=null,project=null,questions=[],report=null,controller=null,generation=0,baseStamp='',summary='',snapshot=null,editErrors=new Map();
 const dialog=()=>document.getElementById('advisorDialog');
 function heading(text,step){return `<div class="dialog-head"><div><h2>${e(text)}</h2><p class="advisor-stepper">${step===3?'草案可修改，确认后才保存':'带入任务 → 生成草案 → 确认保存'}</p></div><button class="review-close" type="button" data-advisor-action="close" aria-label="关闭AI安排"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>`;}
 function error(text){const box=dialog().querySelector('#advisorError');if(box)box.textContent=text;if(text)dialog().querySelector('[data-manual-fallback]')?.setAttribute('open','');}
 function busy(value,message=''){dialog().querySelectorAll('[data-advisor-request],input,textarea,select').forEach(b=>b.disabled=value);const status=dialog().querySelector('#advisorStatus');if(status)status.textContent=message;}
 async function request(stage,data){
  controller?.abort();controller=new AbortController();const version=++generation,timer=setTimeout(()=>controller.abort(),95000);
  try{const response=await fetch('/api/advisor',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({stage,...data}),signal:controller.signal});let payload;try{payload=await response.json();}catch{throw new Error('规划服务未返回有效结果，请确认后端已更新。');}if(version!==generation||!dialog().open)throw new Error('已取消');if(!response.ok)throw new Error(payload.error||'AI安排失败');return payload.result;}
  catch(err){if(version!==generation||!dialog().open)err.stale=true;throw err;}finally{clearTimeout(timer);}
 }
 function manualControls(){return `<details class="plan-manual" data-manual-fallback><summary>其他方式</summary><button type="button" class="button" data-advisor-action="manual">${current?'手动调整计划':'保存任务并手动安排'}</button><p class="small muted">AI不可用时仍可使用。</p></details>`;}
 function open(id=null){
  generation++;controller?.abort();current=id?api.getState().tasks.find(t=>t.id===id):null;
  if(id&&!current){api.toast('任务不存在，请先保存',true);return;}if(current?.plan){api.toast('已有安排，请从“查看安排”调整，避免覆盖完成进度。',true);return;}
  if(document.querySelector('#taskDialog').open)document.querySelector('#taskDialog').close();
  baseStamp=current?.updatedAt||'';project={title:current?.title||'',description:current?.description||current?.evidence||current?.title||'',dueAt:current?.dueAt||'',dueDate:current?.dueDate||'',dateConfirmed:current?.dateConfirmed||false};questions=[];report=null;snapshot=null;summary='';editErrors.clear();answerPage();if(!dialog().open)dialog().showModal();
 }
 function projectPage(previous=null){
  const value=previous||{title:current?.title||'',description:current?.description||current?.evidence||current?.title||'',dueDate:current?.dueDate||'',dateConfirmed:current?.dateConfirmed||false};
  dialog().innerHTML=heading('这件任务，你想完成什么？',1)+`<form id="advisorProject"><div class="dialog-body"><p class="advisor-intro">描述目标即可。AI会先补问关键信息，再拆成子任务，安排到你有空的日期。</p><label class="field"><span>任务名称</span><input name="title" maxlength="150" value="${e(value.title)}" placeholder="输入你要完成的一件事" required></label><label class="field"><span>要求或目前进展</span><textarea name="description" rows="4" maxlength="4000" placeholder="想达到什么结果？已经做了哪些？无需自己先拆步骤。" required>${e(value.description)}</textarea></label>${current?`<p class="task-time-notice">截止：${e(T.label(current))}。安排不会改写原截止。</p>`:`<label class="field"><span>明确截止日期（可留空）</span><input name="dueDate" type="date" value="${e(value.dueDate)}"></label><label class="check-label"><input name="dateConfirmed" type="checkbox" ${value.dateConfirmed?'checked':''}>这是我已确认的截止日期</label>`}<p id="advisorError" class="error" role="alert"></p><p id="advisorStatus" class="small muted" role="status"></p>${manualControls()}<p class="small muted">内容会发送至DeepSeek；计划保存后留在当前浏览器。</p></div><div class="dialog-foot"><button type="submit" class="button primary" data-advisor-request>下一步：了解我的情况</button></div></form>`;
  const form=dialog().querySelector('form');form.onsubmit=async ev=>{ev.preventDefault();if(!form.reportValidity())return;project=readProject(form);error('');busy(true,'AI正在准备几个针对这项任务的问题…');try{const result=await request('questions',{project});const previous=snapshot?.answers||[];questions=result.questions;if(snapshot)snapshot.answers=questions.map(q=>({question:q.question,answer:previous.find(a=>a.question===q.question)?.answer||''}));summary=result.summary;answerPage();}catch(err){if(!err.stale){error(err.name==='AbortError'?'请求超时，已保留输入，可重试。':err.message);busy(false);}}};
 }
 function readProject(form){const f=new FormData(form);return {title:String(f.get('title')||'').trim(),description:String(f.get('description')||'').trim(),dueAt:current?.dueAt||'',dueDate:current?.dueDate||String(f.get('dueDate')||''),dateConfirmed:current?current.dateConfirmed:f.has('dateConfirmed')};}
 function answerPage(){
  report=null;editErrors.clear();const defaults=P.advisorDefaults(project,api.getState()),saved=snapshot?.values||{},known=(project.dueAt||project.dueDate||'').slice(0,10);
  const value={...defaults,...saved},days=snapshot?.workdays||[0,1,2,3,4,5,6].filter(n=>!defaults.excludedWeekdays.includes(n));
  const taskFields=`<label class="field"><span>要完成什么？</span><input name="title" maxlength="150" value="${e(project.title)}" placeholder="例如：准备物理考试、完成课程作品" required></label><label class="field"><span>要求或已有进展（可不填）</span><textarea name="description" rows="2" maxlength="4000" placeholder="有具体要求可以补充，已有信息不用重复填写。">${e(project.description===project.title?'':project.description)}</textarea></label>`;
  dialog().innerHTML=heading(questions.length?'只补充影响安排的关键信息':'先给你一份安排草案',2)+`<form id="advisorAnswers" class="advisor-light"><div class="dialog-body">
   ${current?`<section class="advisor-task-context"><span class="small muted">已带入任务</span><h3>${e(project.title)}</h3><p class="small ${current.dateConfirmed?'muted':'unverified'}">截止：${e(T.label(current))}</p><details><summary>查看或修改任务要求</summary>${taskFields}</details></section>`:taskFields}
   ${questions.length?`<section class="advisor-questions"><p class="small muted">${e(summary||'这些信息会影响安排，其余先按建议生成。')}</p>${questions.map((q,i)=>`<label class="field"><span>${e(q.question)}</span><textarea data-advisor-answer="${i}" rows="2" maxlength="2000" placeholder="按实际情况回答；未知可说明，AI不会当作事实">${e(snapshot?.answers?.find(a=>a.question===q.question)?.answer||'')}</textarea></label>`).join('')}</section>`:''}
   <section class="advisor-availability"><div class="form-grid">
    <label class="field"><span>${known?'计划完成日期':'先安排到哪天？'}</span><input name="endDate" type="date" value="${e(value.endDate)}" ${known?`max="${e(known)}"`:''} required></label>
    <label class="field"><span>每天可用时间 · 分钟</span><input name="dailyMinutes" type="number" min="15" max="720" value="${e(value.dailyMinutes)}" required></label>
   </div>${!known?'<div class="advisor-range-hint"><span>只是计划范围，不会设为任务截止。</span><button type="button" class="quiet-link" data-advisor-action="week">先排未来7天</button></div>':''}
   <label class="check-label"><input type="checkbox" id="weekendsOff" ${!days.includes(0)&&!days.includes(6)?'checked':''}>周末不安排</label>
   <p id="availabilitySummary" class="advisor-defaults"></p>
   <details class="advisor-advanced"><summary>精细调整：工作日、节奏、休息日期</summary><div class="form-grid">
    <label class="field"><span>开始日期</span><input name="startDate" type="date" value="${e(value.startDate)}" required></label>
    <label class="field"><span>每段最多专注分钟</span><select name="focusMinutes">${[15,25,30,45,60,90,120].map(n=>`<option value="${n}" ${Number(value.focusMinutes)===n?'selected':''}>${n}分钟</option>`).join('')}</select></label>
    <label class="field"><span>执行节奏</span><select name="style">${Object.entries(P.styles).map(([k,v])=>`<option value="${k}" ${value.style===k?'selected':''}>${v}</option>`).join('')}<option value="auto" ${value.style==='auto'?'selected':''}>由AI建议</option></select></label>
    <label class="field"><span>留几天检查与交付</span><input name="bufferDays" type="number" min="0" max="90" value="${e(value.bufferDays)}" required></label>
    <label class="field full"><span>允许安排的星期</span><div class="plan-weekdays">${['日','一','二','三','四','五','六'].map((name,i)=>`<label><input type="checkbox" name="workday" value="${i}" ${days.includes(i)?'checked':''}>周${name}</label>`).join('')}</div></label>
    <label class="field full"><span>本次额外休息日期（每行YYYY-MM-DD）</span><textarea name="excludedDates" rows="2">${e(saved.excludedDates??defaults.excludedDates.join('\n'))}</textarea></label>
   </div></details></section>
   <label class="field advisor-extra"><span>还有要求？一句话告诉AI（可不填）</span><textarea name="extra" rows="2" maxlength="2000" placeholder="例如：已完成资料收集，希望先做最难的部分。">${e(saved.extra||'')}</textarea></label>
   <label class="check-label small"><input name="remember" type="checkbox" ${saved.remember===undefined||saved.remember==='on'?'checked':''}>保存安排时记住习惯，下次自动带入</label>
   <p class="small muted">${api.getState().advisorPreferences?'已沿用上次保存的时间偏好。':'时间与休息日为建议值，可直接修改。'} 日期和本次额外要求不会设为通用习惯。</p>
   <p id="advisorError" class="error" role="alert"></p><p id="advisorStatus" class="small muted" role="status"></p>
   <details class="plan-manual" data-manual-fallback><summary>其他方式</summary><div class="actions"><button type="button" class="button" data-advisor-action="interview">我想先聊清楚</button><button type="button" class="button" data-advisor-action="manual">手动安排</button></div><p class="small muted">AI不可用时，本地任务和手动安排仍可使用。</p></details>
   <p class="small muted">任务内容会发送至DeepSeek；草案确认前不写入任务。</p>
  </div><div class="dialog-foot"><button type="button" class="button" data-advisor-action="${questions.length?'restart':'cancel'}">${questions.length?'修改任务':'取消'}</button><button type="submit" class="button primary" data-advisor-request>生成安排草案</button></div></form>`;
  const form=dialog().querySelector('form'),weekend=form.querySelector('#weekendsOff');
  const updateSummary=()=>{const selected=[...form.querySelectorAll('[name=workday]:checked')].map(x=>Number(x.value));weekend.checked=!selected.includes(0)&&!selected.includes(6);form.querySelector('#availabilitySummary').textContent=`${selected.map(n=>'周'+'日一二三四五六'[n]).join('、')||'请至少选择一个可安排星期'} · 每天${form.elements.dailyMinutes.value||0}分钟 · ${P.styles[form.elements.style.value]||'由AI建议'}`;};
  weekend.onchange=()=>{for(const n of [0,6])form.querySelector(`[name=workday][value="${n}"]`).checked=!weekend.checked;updateSummary();};
  form.addEventListener('change',ev=>{if(ev.target.name==='dailyMinutes'&&Number(form.elements.focusMinutes.value)>Number(ev.target.value)&&Number(ev.target.value)>=15)form.elements.focusMinutes.value=String([120,90,60,45,30,25,15].find(n=>n<=Number(ev.target.value)));updateSummary();});
  form.addEventListener('invalid',ev=>ev.target.closest('details')?.setAttribute('open',''),true);updateSummary();
  form.onsubmit=async ev=>{ev.preventDefault();if(!form.reportValidity())return;captureAnswers(form);
   const constraints={...snapshot.values,excludedWeekdays:[0,1,2,3,4,5,6].filter(n=>!snapshot.workdays.includes(n)),excludedDates:String(snapshot.values.excludedDates||'').split(/\s+/).filter(Boolean)};
   if(!snapshot.workdays.length){error('至少选择一个可安排星期。');return;}
   if(constraints.excludedDates.some(d=>!T.dateOnly(d))){error('休息日期请填写完整有效日期。');return;}
   if(constraints.startDate>constraints.endDate){error('计划结束日期不能早于开始日期。');return;}
   if(known&&constraints.endDate>known){error('计划目标不能晚于已记录的截止日期。');return;}
   if(Number(constraints.focusMinutes)>Number(constraints.dailyMinutes)){error('每段专注时间不能超过每天可用时间，请在精细调整中修改。');return;}
   snapshot.constraints=constraints;error('');busy(true,'正在根据任务和偏好拆解草案，无需先填问卷…');const operation=generation+1;
   try{const result=await request('draft',{project,answers:snapshot.answers,constraints});if(result.needsClarification){questions=result.questions;summary=result.summary;answerPage();}else{report=result;showReport();}}
   catch(err){if(!err.stale)error(err.name==='AbortError'?'请求超时，内容仍保留，可以重试。':err.message);}
   finally{if(dialog().open&&generation===operation)busy(false);}
  };
 }
 function captureAnswers(form){
  const f=new FormData(form),prior=snapshot?.answers||[];
  project={...project,title:String(f.get('title')||project.title||'').trim(),description:String(f.get('description')||f.get('title')||project.description||'').trim()};
  const collected=questions.map((q,i)=>({question:q.question,answer:form.querySelector(`[data-advisor-answer="${i}"]`)?.value.trim()||''}));
  const extra=String(f.get('extra')||'').trim(),keep=prior.filter(a=>a.question!=='额外要求'&&!questions.some(q=>q.question===a.question));
  snapshot={values:{...Object.fromEntries(f),remember:f.has('remember')?'on':'off'},answers:[...keep,...collected,...(extra?[{question:'额外要求',answer:extra}]:[])].filter(a=>a.answer).slice(-5),workdays:f.getAll('workday').map(Number)};
 }

 function unitWarnings(){return window.DHFidelity.unitIssues([project.title,project.description,...(snapshot?.answers||[]).map(x=>x.answer)].join('\n'),report.plan.items);}
 function issues(){return [...editErrors.values(),...P.validate(report.plan,project),...(unitWarnings().length&&!dialog().querySelector('#unitAcknowledged')?.checked?['请修改或明确核对数量与单位提示。']:[])];}
 function updateReport(){
  const warnings=unitWarnings(),box=dialog().querySelector('#advisorUnitWarnings');box.hidden=!warnings.length;box.querySelector('p').textContent=warnings.join('；');dialog().querySelector('[data-advisor-action=adopt]').disabled=warnings.length>0&&!dialog().querySelector('#unitAcknowledged').checked;
  report.plan.guidance.unitReview={issues:warnings,confirmed:!warnings.length||dialog().querySelector('#unitAcknowledged').checked};
  report.plan.guidance.estimatedMinutes=report.plan.items.reduce((n,x)=>n+(x.minutes||0),0);const problems=issues();dialog().querySelector('#advisorError').textContent=problems.slice(0,5).join('\n');dialog().querySelector('[data-advisor-action="save-plan"]').disabled=problems.length>0;
  dialog().querySelector('#scheduleTotal').textContent=`${report.plan.items.length}个子任务 · 估计${report.plan.guidance.estimatedMinutes}分钟 · 保存前可展开修改`;
  for(const row of dialog().querySelectorAll('[data-advice-item]')){const item=report.plan.items.find(x=>x.id===row.dataset.adviceItem);row.querySelector('summary strong').textContent=item.title;row.querySelector('.advisor-schedule-date').textContent=(item.date||'待安排')+' · '+item.minutes+'分钟';}
 }
 function showReport(){
  editErrors.clear();const p=report.plan;dialog().innerHTML=heading('已拆解，看看这样安排如何',3)+`<div class="advisor-result"><div class="dialog-body"><section id="advisorReport"><div class="advisor-summary"><h3>${e(project.title)}</h3><p>${window.DHExperience.highlighted(report.summary)}</p><div id="scheduleTotal" class="advisor-result-meta"></div><p class="small muted">时长为AI估计；请核对范围，确认后才会保存。</p>${p.guidance.assumptions.length?`<div class="advisor-assumptions"><strong>草案采用的假设</strong>${p.guidance.assumptions.map(x=>`<p>${e(x)}</p>`).join('')}</div>`:''}</div><div class="advisor-schedule-list">${p.items.map((x,i)=>`<details class="advisor-schedule-row" data-advice-item="${e(x.id)}"><summary><span class="advisor-schedule-number">${i+1}</span><strong>${e(x.title)}</strong><span class="advisor-schedule-date"></span></summary><p>${e(x.description)}</p><div class="form-grid"><label class="field full"><span>子任务名称</span><input data-advice-field="title" maxlength="200" value="${e(x.title)}"></label><label class="field"><span>安排日期</span><input data-advice-field="date" type="date" value="${e(x.date)}"></label><label class="field"><span>估计分钟</span><small class="minutes-source">${{ai:"AI估计",user:"用户修改",default:"默认估计"}[x.minutesOrigin]||"来源未记录"}</small><input data-advice-field="minutes" type="number" min="1" max="120" value="${x.minutes}"></label><label class="field full"><span>步骤说明与产出（可核对单位）</span><textarea data-advice-field="description" rows="2" maxlength="1200">${e(x.description)}</textarea></label></div></details>`).join('')}</div><div id="advisorUnitWarnings" class="notice warn" hidden><strong>数量与单位需要核对</strong><p></p><label class="check-label"><input type="checkbox" id="unitAcknowledged">我已对照原要求核对这些单位，保留当前安排</label></div><p id="advisorError" class="error advisor-result-errors" role="alert"></p><div class="advisor-result-controls"><button type="button" class="button" data-advisor-action="back-answers">调整要求和时间</button><details class="plan-manual"><summary>详细排期与依据</summary><p class="small muted">${e(p.guidance.reasoning)}</p>${p.guidance.assumptions.map(x=>`<p class="small muted">待核对：${e(x)}</p>`).join('')}<button type="button" class="button" data-advisor-action="adopt">进入手动排期</button></details></div></section></div><div class="dialog-foot"><span class="advisor-save-note">只保存安排，不会自动完成或提交任务。</span><button type="button" class="button primary" data-advisor-action="save-plan">保存这份安排</button></div></div>`;
  dialog().querySelector('#unitAcknowledged').onchange=updateReport;
  dialog().querySelector('#advisorReport').addEventListener('change',ev=>{const row=ev.target.closest('[data-advice-item]'),field=ev.target.dataset.adviceField;if(!row||!field)return;const item=p.items.find(x=>x.id===row.dataset.adviceItem),key=item.id+field,value=ev.target.value;editErrors.delete(key);
   if(field==='minutes'){const n=Number(value);if(!Number.isInteger(n)||n<1||n>120)editErrors.set(key,'估计时长须为1～120分钟。');else {item.minutes=n;item.minutesOrigin='user';row.querySelector('.minutes-source').textContent='用户修改';}}
   if(field==='title'){if(!value.trim())editErrors.set(key,'子任务名称不能为空。');else item.title=value.trim();}if(field==='description')item.description=value.trim();if(field==='date'){item.date=value;item.locked=true;}dialog().querySelector('#unitAcknowledged').checked=false;updateReport();
  });updateReport();
 }
 async function savePlan(button){
  if(!report||issues().length){error('请先调整未安排日期或超出预算的内容。');return;}button.disabled=true;const operation=generation;
  const plan=P.clean({...report.plan,confirmed:true,updatedAt:new Date().toISOString()},{strict:true});
  const base=current||D.cleanTask({title:project.title,description:project.description,dueDate:project.dueDate,deadlineKind:project.dueDate?'date':'pending',dateConfirmed:project.dateConfirmed,executionStatus:'unsubmitted',timeEvidence:{confirmed:project.dateConfirmed,method:'用户在AI安排中填写的截止信息'}});
  const ok=await api.mutate(next=>{if(current){const index=next.tasks.findIndex(t=>t.id===current.id),live=next.tasks[index];if(!live||live.updatedAt!==baseStamp||live.plan)throw new Error('任务已改变，请重新安排，避免覆盖现有进度。');const after=D.cleanTask({...live,title:project.title,description:project.description,plan,updatedAt:new Date().toISOString()});next.tasks[index]=after;next.history.unshift({id:D.uid(),taskId:live.id,kind:'manual',before:structuredClone(live),after:structuredClone(after),at:after.updatedAt});}else next.tasks.push(D.cleanTask({...base,plan,updatedAt:new Date().toISOString()}));if(snapshot?.values.remember==="on"){next.advisorPreferences={dailyMinutes:Number(snapshot.values.dailyMinutes),focusMinutes:Number(snapshot.values.focusMinutes)};next.plannerPreferences=P.rules({...snapshot.constraints,startDate:"",endDate:"",excludedDates:[]});}},`已拆成${plan.items.length}项并保存安排`);
  if(operation!==generation||!dialog().open)return;if(ok)dialog().close();else button.disabled=false;
 }
 async function ensureTask(){
  if(current){const live=api.getState().tasks.find(t=>t.id===current.id);if(!live||live.updatedAt!==baseStamp||live.plan)throw new Error('任务已改变或已有安排，请重新打开。');return live.id;}
  const task=D.cleanTask({title:project.title,description:project.description,dueDate:project.dueDate,deadlineKind:project.dueDate?'date':'pending',dateConfirmed:project.dateConfirmed,executionStatus:'unsubmitted'});if(!await api.mutate(next=>next.tasks.push(task),'任务已创建；安排仍需确认'))throw new Error('任务未保存，请重试。');current=task;baseStamp=task.updatedAt;return task.id;
 }
 function mount(ctx){api=ctx;if(ctx.page!=='tasks')return;const actions=ctx.app.querySelector('.page-head>.actions');if(actions&&!actions.querySelector('[data-advisor-new]'))actions.insertAdjacentHTML('afterbegin','<button type="button" class="button primary" data-advisor-new>＋ AI安排任务</button>');}
 document.addEventListener('click',async ev=>{
  if(ev.target.closest('[data-advisor-new]')){open();return;}const opener=ev.target.closest('[data-advisor-open]');if(opener){ev.stopImmediatePropagation();open(opener.dataset.advisorOpen);return;}
  const button=ev.target.closest('[data-advisor-action]');if(!button||button.disabled)return;const action=button.dataset.advisorAction;
  if(action==='close'||action==='cancel'){dialog().close();return;}
  if(action==='week'){const form=dialog().querySelector('#advisorAnswers');form.elements.startDate.value=T.today();form.elements.endDate.value=P.add(T.today(),6);return;}
  if(action==='restart'||action==='interview'){generation++;controller?.abort();busy(false);const f=dialog().querySelector('#advisorAnswers');if(f)captureAnswers(f);projectPage(project);return;}
  if(action==='back-answers'){answerPage();return;}
  if(action==='save-plan'){try{await savePlan(button);}catch(err){error(err.message);button.disabled=false;}return;}
  if(action==='adopt'){if(!report)return;if(unitWarnings().length&&!dialog().querySelector('#unitAcknowledged').checked){error('请先对照原要求核对数量与单位，再进入手动排期。');return;}const operation=generation;button.disabled=true;try{const id=await ensureTask();if(operation!==generation||!dialog().open)return;const plan=report.plan;dialog().close();window.DHPlannerUI.loadAdvice(id,plan);}catch(err){if(operation===generation){error(err.message);button.disabled=false;}}return;}
  if(action==='manual'){const form=dialog().querySelector('#advisorProject'),quick=dialog().querySelector('#advisorAnswers');if(form){if(!form.reportValidity())return;project=readProject(form);}if(quick){if(!quick.elements.title.reportValidity())return;captureAnswers(quick);}if(!project)return;const operation=generation;try{const id=await ensureTask();if(operation!==generation||!dialog().open)return;dialog().close();window.DHPlannerUI.open(id);}catch(err){if(operation===generation)error(err.message);}}
 });
 document.addEventListener('DOMContentLoaded',()=>dialog().addEventListener('close',()=>{generation++;controller?.abort();}));
 return {mount,open};
})();
