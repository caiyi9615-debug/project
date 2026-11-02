'use strict';
window.DHPlannerUI=(()=>{
 const P=window.DHPlanner,T=window.DHTime;
 const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let api,taskId,baseStamp,draft=null,oldPlan=null,dragged='',adviceTemplate=null,advisoryGuidance=null;
 const dialog=()=>document.getElementById('planDialog');
 const getTask=()=>api.getState().tasks.find(x=>x.id===taskId);
 const btn=(label,action,extra='',cls='')=>`<button type="button" class="button ${cls}" data-plan-action="${action}" ${extra}>${label}</button>`;
 const opening=(task,label)=>task.plan?`<button type="button" class="button compact" data-plan-open="${e(task.id)}">${label||'查看安排'}</button>`:`<button type="button" class="button primary compact" data-advisor-open="${e(task.id)}">AI拆解并安排</button><details class="plan-manual"><summary>手动调整</summary><button type="button" class="button compact" data-plan-open="${e(task.id)}">自行制定计划</button></details>`;
 function bar(task){const s=P.summary(task);return s?`<div class="plan-progress"><strong>${s.done} / ${s.total}${e(task.plan.unit)} <span>${s.percent}%</span></strong><div class="progress-track" role="progressbar" aria-label="${e(task.title)}任务完成进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.percent}"><span style="width:${s.percent}%"></span></div><small>${s.complete?'工作量完成，提交状态需单独确认':s.overdue?`${s.overdue}项计划已落后，实际进度不会自动增长`:s.next?`接下来 ${s.next.date} · ${e(s.next.title)}`:'暂无待执行子任务'}</small>${s.changed?'<small class="error">截止信息已变化，请重新核对计划</small>':''}</div>`:'';}
 function weekdays(r){return ['日','一','二','三','四','五','六'].map((name,i)=>`<label><input type="checkbox" name="workday" value="${i}" ${!r.excludedWeekdays.includes(i)?'checked':''}>周${name}</label>`).join('');}
 function formRules(r){return `<div class="form-grid"><label class="field"><span>计划开始日期</span><input name="startDate" type="date" value="${e(r.startDate)}" required></label><label class="field"><span>计划目标日期（不补截止时刻）</span><input name="endDate" type="date" value="${e(r.endDate)}" required></label><label class="field"><span>执行节奏</span><select name="style">${Object.entries(P.styles).map(([key,label])=>`<option value="${key}" ${r.style===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="field"><span>此大任务每天最多完成几项</span><input name="maxPerDay" type="number" min="1" max="100" value="${r.maxPerDay}" required></label><label class="field"><span>预留检查/提交缓冲天数</span><input name="bufferDays" type="number" min="0" max="90" value="${r.bufferDays}" required></label><label class="field full"><span>允许安排的星期（不勾选即休息）</span><div class="plan-weekdays">${weekdays(r)}</div></label><label class="field full"><span>额外不安排的日期（每行YYYY-MM-DD）</span><textarea name="excludedDates" rows="2" placeholder="例如：2026-11-04">${e(r.excludedDates.join('\n'))}</textarea></label></div>`;}
 function readRules(form){const f=new FormData(form),work=f.getAll('workday').map(Number),dates=String(f.get('excludedDates')||'').split(/\s+/).filter(Boolean);if(!work.length)throw new Error('至少选择一个可安排星期。');if(dates.some(d=>!T.dateOnly(d)))throw new Error('额外休息日请填写完整有效日期，每行YYYY-MM-DD。');return P.rules({...Object.fromEntries(f),excludedWeekdays:[0,1,2,3,4,5,6].filter(n=>!work.includes(n)),excludedDates:dates});}
 function heading(title){return `<div class="dialog-head"><div><h2>${e(title)}</h2><p class="small muted">${e(getTask()?.title)}</p></div>${btn('×','close','aria-label="关闭计划"','icon-button')}</div>`;}
 function showError(message){const el=dialog().querySelector('#planError');if(el)el.textContent=message;else api.toast(message,true);}
 function statsText(task){const s=P.summary(task);return `实际完成 ${s.done}/${s.total} · 截至今天计划应完成 ${s.expected} 项${s.behind?` · 数量进度落后 ${s.behind} 项`:''}。按具体日期还有 ${s.overdue} 项未完成。`;}
 function overview(resetScroll=true){
  const task=getTask();if(!task){dialog().close();api.toast('任务已删除',true);return;}
  const plan=task.plan;if(!plan){configure();return;}
  const oldScroll=dialog().scrollTop;draft=null;const s=P.summary(task);
  dialog().innerHTML=heading('大任务执行计划')+`<div class="dialog-body">${bar(task)}<p class="notice">${e(statsText(task))}</p><p class="small muted">进度来源：手动勾选/用户确认的数量快照；与材料清单、学习通提交状态独立，不会随日期自动增加。当前提交状态：${e(T.statuses[task.executionStatus])}。</p>${s.changed?'<div class="notice warn">任务截止信息已调整，原计划未被自动覆盖，请重新安排剩余计划。</div>':''}${plan.items.some(x=>x.snapshot)?'<div class="notice warn">部分完成数量来自你确认的进度快照；通用序号不代表AI识别到了对应具体章节。</div>':''}<div class="plan-week-summary">${P.weeks(plan).map(w=>`<div><strong>${w.start}～${w.end}</strong><span>${w.items.length}项 · 已完成${w.done}项</span></div>`).join('')}</div><div class="plan-execution">${plan.items.map(x=>`<label class="plan-execution-item ${x.done?'finished':''}"><input type="checkbox" data-plan-done="${e(x.id)}" ${x.done?'checked':''}><span><strong>${e(x.title)}</strong><small>${e(x.date||'未指定日期（完成数量快照）')}${x.snapshot?' · 快照汇总':''}${x.locked?' · 固定安排':''}</small></span>${x.done?'<span class="tag done">已完成</span>':''}</label>`).join('')}</div><p id="planError" class="error" role="alert"></p></div><div class="dialog-foot">${btn('删除计划','remove','','danger')}${btn('导出计划日历','export')}${btn('修改/重排剩余计划','configure','','primary')}</div>`;
  if(plan.guidance)dialog().querySelector('.plan-execution').insertAdjacentHTML('beforebegin',guidanceHTML(plan.guidance));
  for(const label of dialog().querySelectorAll('.plan-execution-item')){const item=plan.items.find(x=>x.id===label.querySelector('[data-plan-done]').dataset.planDone);if(item?.description||item?.minutes){const note=document.createElement('small');note.textContent=[item.phase,item.minutes?'估计'+item.minutes+'分钟（'+({ai:'AI估计',user:'用户修改',default:'默认估计'}[item.minutesOrigin]||'来源未记录')+'）':'',item.description].filter(Boolean).join(' · ');label.querySelector('span').append(note);}}
  window.DHSimple?.tidyPlan(dialog());dialog().scrollTop=resetScroll?0:oldScroll;
 }
 function configure(){
  const task=getTask();if(!task)return;
  oldPlan=task.plan?structuredClone(task.plan):null;baseStamp=task.updatedAt;draft=null;adviceTemplate=null;advisoryGuidance=oldPlan?.guidance||null;
  const s=P.suggestion(task),r=P.rules(oldPlan?.rules||api.getState().plannerPreferences||{});
  r.startDate=r.startDate&&r.startDate>=T.today()?r.startDate:T.today();
  if(!r.endDate)r.endDate=task.dateConfirmed?(task.dueAt||task.dueDate||'').slice(0,10):'';
  const mode=oldPlan?.mode||'quantity';
  dialog().innerHTML=heading(oldPlan?'修改并预览剩余计划':'为大任务制定个性计划')+`<form id="planForm"><div class="dialog-body"><div class="notice">这是通用计划器，数量、单位和阶段都由你设置。排程在本地按约束计算，不需要额外调用AI，不代表课程平台实时进度。</div>${s&&!oldPlan?`<div class="notice warn">原文建议：${s.completed}/${s.total}${e(s.unit)}；证据：${e(s.evidence)}。请核实或修改，不会自动保存进度。</div>`:''}${!task.dateConfirmed||!(task.dueAt||task.dueDate)?'<div class="notice warn">任务截止信息尚未核实。你可以填写自己的计划目标日期，但它不会被写成确定的截止时间，也不会启用截止推送。</div>':''}<div class="form-grid"><label class="field"><span>拆分方式</span><select name="mode" ${oldPlan?'disabled':''}><option value="quantity" ${mode==='quantity'?'selected':''}>数量型（报告/章节/试卷等）</option><option value="stages" ${mode==='stages'?'selected':''}>自定义阶段（每行一项）</option></select></label><label class="field"><span>数量型总数（1～500）</span><input name="total" type="number" min="1" max="500" value="${oldPlan?.items.length||s?.total||''}" placeholder="自己填写，不固定数量"></label><label class="field"><span>子任务单位/称呼</span><input name="unit" maxlength="20" value="${e(oldPlan?.unit||s?.unit||'项')}" placeholder="如章、份报告、阶段"></label><label class="field"><span>当前已完成数量（首次建立）</span><input name="completed" type="number" min="0" max="500" value="${oldPlan?oldPlan.items.filter(x=>x.done).length:s?.completed||0}" ${oldPlan?'disabled':''}></label><label class="field full"><span>阶段名称（阶段型必填，每行一个，保存前还可逐项编辑）</span><textarea name="stageNames" rows="4" placeholder="自行填写阶段名称，不限定任务类型">${e(oldPlan?.mode==='stages'?oldPlan.items.map(x=>x.title).join('\n'):'')}</textarea></label></div><label class="check-label"><input name="snapshotConfirmed" type="checkbox">我已核实填写的已完成数量；数量快照不代表具体章节对应关系</label><h3 class="section-title">你的时间与节奏</h3>${formRules(r)}<p class="small muted">细水长流：均匀分布；集中推进：尽量集中在最早的可用日期；提前完成：优先使用前65%的可用日，容量不足时扩大至允许范围。自定义：遵守你选择的工作日和上限，再逐项DIY。上限只针对当前大任务，不是假装已统筹所有任务。</p><label class="check-label"><input name="savePreferences" type="checkbox" checked>保存为我的默认习惯（其他大任务不会被自动重排）</label><div class="actions">${btn('生成/重排并预览','preview','','primary')}${oldPlan?btn('返回现有计划','overview'):''}</div><p id="planError" class="error" role="alert"></p><section id="planPreview"></section></div><div class="dialog-foot">${btn('取消','close')}<button type="button" class="button primary" data-plan-action="save" disabled>确认保存此计划</button></div></form>`;
  dialog().scrollTop=0;
  if(advisoryGuidance)budgetField(dialog().querySelector('#planForm'),advisoryGuidance);
  dialog().querySelector('#planForm').onsubmit=ev=>{ev.preventDefault();preview();};
  dialog().querySelector('#planForm').addEventListener('input',ev=>{if(ev.target.closest('#planPreview')||ev.target.name==='savePreferences')return;draft=null;dialog().querySelector('[data-plan-action="save"]').disabled=true;dialog().querySelector('#planPreview').innerHTML='<p class="notice warn">设置已改变，请重新生成预览。</p>';});
 }
 function preview(){
  try{
   const form=dialog().querySelector('#planForm');if(!form.reportValidity())return;
   const f=new FormData(form),mode=oldPlan?.mode||f.get('mode'),unit=String(f.get('unit')||'项').trim(),names=String(f.get('stageNames')||'').split('\n').map(x=>x.trim()).filter(Boolean);
   if(mode==='stages'&&!names.length)throw new Error('请填写自定义阶段名称，每行一个。');
   const items=P.makeItems({total:Number(f.get('total')),unit,stageNames:mode==='stages'?names:[],completed:oldPlan?0:Number(f.get('completed')),snapshotConfirmed:f.has('snapshotConfirmed'),existing:draft||oldPlan||adviceTemplate});
   const result=P.generate({task:getTask(),items,rules:readRules(form),mode,unit,existing:oldPlan});draft=result.plan;if(advisoryGuidance){draft.guidance=structuredClone(advisoryGuidance);draft.guidance.dailyMinutes=Number(f.get('advisorDailyMinutes'))||advisoryGuidance.dailyMinutes;draft.guidance.estimatedMinutes=items.reduce((n,x)=>n+(x.minutes||advisoryGuidance.focusMinutes),0);}
   renderPreview([...new Set([...result.errors,...P.validate(draft,getTask())])]);dialog().querySelector('#planPreview').scrollIntoView({block:'start'});
  }catch(error){draft=null;showError(error.message);dialog().querySelector('[data-plan-action="save"]').disabled=true;}
 }
 function renderPreview(initialErrors=null){
  const errors=initialErrors||P.validate(draft,getTask()),root=dialog().querySelector('#planPreview');
  const dropOpen=!!root.querySelector('.plan-date-grid')?.open;
  showError(errors.slice(0,8).join('\n'));
  dialog().querySelector('[data-plan-action="save"]').disabled=errors.length>0;
  const changes=draft.items.filter(x=>{const old=oldPlan?.items.find(y=>y.id===x.id);return !x.done&&(!old||old.date!==x.date);});
  const removed=oldPlan?.items.filter(x=>!draft.items.some(y=>y.id===x.id))||[];
  const start=draft.rules.startDate,end=P.cutoff(draft),days=[];if(start&&end)for(let d=start;d<=end&&days.length<735;d=P.add(d,1))days.push(d);
  root.innerHTML=`<h3 class="section-title">计划预览 · 未保存</h3><p class="small muted">可逐项修改估计分钟；超过每日预算时不可保存。缺少时长的步骤按单段时长保守预留。</p><p class="small muted">可编辑子任务名称、日期；修改日期自动锁定，重新排程时保留固定安排。电脑可拖动子任务到日期格；手机直接修改日期。不会自动勾选完成。</p><div class="plan-week-summary">${P.weeks(draft).map(w=>`<div><strong>${w.start}～${w.end}</strong><span>安排${w.items.length}项 · 已完成${w.done}项</span></div>`).join('')}</div>${oldPlan?`<details class="plan-differences" open><summary>保存前后对比：${changes.length}项日程变化，${removed.length}项未完成内容移出范围</summary>${changes.map(x=>`<p>${e(x.title)}：${e(oldPlan.items.find(y=>y.id===x.id)?.date||'未安排')} → ${e(x.date||'待安排')}</p>`).join('')}${removed.map(x=>`<p>${e(x.title)}：移出当前计划（已完成记录不会被移除）</p>`).join('')}</details>`:''}<details class="plan-date-grid"><summary>拖动排期日期格（工作日与休息日均明确显示）</summary><div class="plan-drop-grid">${days.map(d=>`<div class="plan-drop-day ${draft.rules.excludedWeekdays.includes(P.weekday(d))||draft.rules.excludedDates.includes(d)?'rest-day':''}" data-plan-date="${d}"><strong>${d.slice(5)} 周${'日一二三四五六'[P.weekday(d)]}</strong><small>${draft.rules.excludedWeekdays.includes(P.weekday(d))||draft.rules.excludedDates.includes(d)?'休息':draft.items.filter(x=>x.date===d).length+'项'}</small></div>`).join('')}</div></details><div class="plan-preview-items">${draft.items.map(x=>`<div class="plan-preview-row" data-plan-item="${e(x.id)}" draggable="${!x.done}"><span class="muted" draggable="${!x.done}" title="拖动到日期格">${x.done?'✓':'⠿'}</span><label class="field"><span>子任务名称${x.done?'（已完成，重排保留）':''}</span><input data-item-field="title" value="${e(x.title)}" maxlength="200" ${x.done?'disabled':''}></label><label class="field"><span>安排日期</span><input data-item-field="date" type="date" value="${e(x.date)}" ${x.done?'disabled':''}></label><label class="check-label"><input data-item-field="locked" type="checkbox" ${x.locked?'checked':''} ${x.done?'disabled':''}>固定</label></div>`).join('')}</div>`;
  root.querySelector('details:not(.plan-differences)').open=dropOpen;
  const review=P.reviewUnits(draft,getTask());
  if(review.issues.length)root.insertAdjacentHTML('afterbegin',`<div class="notice warn plan-unit-warning"><strong>计划单位核对</strong><p>${review.issues.map(e).join('；')}</p><label class="check-label"><input type="checkbox" data-plan-unit-confirm ${review.confirmed?'checked':''}>我已对照原要求核对当前步骤的数量与单位</label></div>`);
  const capacity=errors.length?P.capacityAdvice(draft):null;
  if(capacity)root.insertAdjacentHTML('afterbegin',`<div class="notice warn capacity-advice"><strong>排期容量建议</strong><p>${capacity.days}个可用日，按当前上限还差${capacity.remaining}项容量。建议每日${capacity.requiredPerDay}项。${draft.guidance?`单段保守预留后，每日至少${capacity.requiredDailyMinutes}分钟（当前${capacity.currentDailyMinutes}分钟），确认后才调整。`:''}</p>${btn('按建议设为每天'+capacity.requiredPerDay+'项','capacity-suggest')}</div>`);
  if(errors.length)root.insertAdjacentHTML('afterbegin',`<div class="notice warn"><p>按当前限制排不下时，由你选择调整后重新校验；不会自动占用休息日。</p><div class="actions">${btn('每天多安排1项'+(draft.guidance?'（预算增加'+draft.guidance.focusMinutes+'分钟）':''),'capacity-day')}${btn('目标日期增加2天（不越过截止）','capacity-date')}</div></div>`);if(draft.guidance)root.insertAdjacentHTML('afterbegin',guidanceHTML(draft.guidance));
  for(const row of root.querySelectorAll('[data-plan-item]')){const item=draft.items.find(x=>x.id===row.dataset.planItem);if(!item.minutes){item.minutes=draft.guidance?.focusMinutes||30;item.minutesOrigin='default';}const label=document.createElement('label');label.className='field plan-minutes';label.innerHTML=`<span>估计分钟</span><input type="number" data-item-field="minutes" min="1" max="120" value="${item?.minutes||draft.guidance?.focusMinutes||30}" ${item?.done?'disabled':''}><small class="minutes-source">${{ai:'AI估计',user:'用户修改',default:'默认估计'}[item.minutesOrigin]||'来源未记录'}</small>`;row.insertBefore(label,row.lastElementChild);if(item?.description){const note=document.createElement('p');note.className='small muted advisor-step-note';note.textContent=[item.phase,item.minutes?'估计'+item.minutes+'分钟':'时长待核对',item.description].filter(Boolean).join(' · ');row.append(note);}}
  const finished=[...root.querySelectorAll('.plan-preview-row[draggable="false"]')];if(finished.length){const details=document.createElement('details');details.className='fold-panel completed-preview';details.innerHTML='<summary>已完成'+finished.length+'项（保留，不重新安排）</summary>';root.querySelector('.plan-preview-items').after(details);finished.forEach(row=>details.append(row));}
 }
 async function save(){
  try{
   if(!draft)throw new Error('请先生成计划预览。');const errors=P.validate(draft,getTask());if(errors.length)throw new Error(errors.slice(0,8).join('\n'));
   const task=getTask();if(task.updatedAt!==baseStamp)throw new Error('任务已在其他位置修改，请重新打开计划后预览，避免覆盖。');
   const plan=P.clean({...draft,confirmed:true,updatedAt:new Date().toISOString()},{strict:true}),remember=dialog().querySelector('[name="savePreferences"]').checked;
   const ok=await api.mutate(next=>{const t=next.tasks.find(t=>t.id===taskId);if(!t||t.updatedAt!==baseStamp)throw new Error('任务已经改变，请重新预览。');const before=structuredClone(t);t.plan=plan;t.updatedAt=new Date().toISOString();next.history.unshift({id:crypto.randomUUID(),taskId,kind:'manual',before,after:structuredClone(t),at:t.updatedAt});if(remember)next.plannerPreferences=P.rules({...plan.rules,startDate:'',endDate:''});},'个性计划已保存；提交状态未自动改变');
   if(ok){baseStamp=getTask().updatedAt;api.refreshTask?.(taskId);overview();}
  }catch(error){showError(error.message);}
 }
 async function toggle(id,done){
  const ok=await api.mutate(next=>{const t=next.tasks.find(t=>t.id===taskId),item=t?.plan?.items.find(x=>x.id===id);if(!item)throw new Error('子任务已改变，请重新打开。');const before=structuredClone(t);item.done=done;item.completedAt=done?new Date().toISOString():'';item.snapshot=false;t.plan.updatedAt=new Date().toISOString();t.updatedAt=t.plan.updatedAt;next.history.unshift({id:crypto.randomUUID(),taskId,kind:'manual',before,after:structuredClone(t),at:t.updatedAt});},'子任务进度已保存，提交状态保持不变');
  if(ok){api.refreshTask?.(taskId);overview(false);}else overview(false);
 }
 function open(id){if(document.querySelector('#taskDialog').open)document.querySelector('#taskDialog').close();taskId=id;const task=getTask();if(!task){api.toast('请先保存任务，再制定计划',true);return;}baseStamp=task.updatedAt;draft=null;oldPlan=null;task.plan?overview():configure();if(!dialog().open)dialog().showModal();}
 function detail(task,parent){const body=parent.querySelector('.dialog-body');if(!body)return;const el=document.createElement('section');el.className='plan-detail-block';el.innerHTML=`<h3>大任务执行计划</h3>${bar(task)||'<p class="small muted">把这一项任务拆成可执行的子任务；材料清单与执行进度独立计算。</p>'}${opening(task)}`;body.prepend(el);}
 function mount(ctx){
  api=ctx;
  for(const row of ctx.app.querySelectorAll('.task-row')){const id=row.querySelector('.task-title')?.dataset.id,task=ctx.getState().tasks.find(t=>t.id===id);if(task){const box=document.createElement('div');box.className='plan-inline';box.innerHTML=bar(task)+opening(task);box.insertAdjacentHTML('beforeend',`<button class="button compact mobile-plan-entry" data-action="detail" data-id="${e(task.id)}">计划</button>`);row.querySelector('.task-main')?.append(box);}}
  const table=ctx.app.querySelector('.task-table');if(table){const header=document.createElement('th');header.textContent='任务完成';table.querySelector('thead tr').insertBefore(header,table.querySelector('thead tr').children[4]);for(const row of table.querySelectorAll('tbody tr')){const id=row.querySelector('[data-action="edit"]')?.dataset.id,task=ctx.getState().tasks.find(t=>t.id===id);if(task){const cell=document.createElement('td');cell.className='plan-cell';cell.innerHTML=(bar(task)||'<span class="muted small">尚未制定</span>')+opening(task);cell.insertAdjacentHTML('beforeend',`<button class="button compact mobile-plan-entry" data-action="detail" data-id="${e(task.id)}">计划</button>`);row.insertBefore(cell,row.children[4]);}}}
  const draftCards=ctx.app.querySelectorAll('[data-draft]');for(const card of draftCards){const task=ctx.getDraft?.(card.dataset.draft),s=task&&P.suggestion(task);if(s){const note=document.createElement('p');note.className='notice small';note.textContent=`可拆分建议：${s.completed}/${s.total}${s.unit}（需核对）；加入任务中心后可制定个性计划。`;card.append(note);}}
  if(ctx.page==='dashboard')dashboard(ctx);
  if(ctx.page==='calendar')calendar(ctx);
  if(ctx.page==='settings')preferences(ctx);
  window.DHAdvisor?.mount(ctx);
 }
 function guidanceHTML(g){return `<section class="notice advisor-guidance"><strong>根据问答形成的计划建议</strong><p>${e(g.summary)}</p><p>${e(g.reasoning)}</p><p>当前估计工作量约${g.estimatedMinutes}分钟；每天预算${g.dailyMinutes}分钟，默认每段预留${g.focusMinutes}分钟，逐项修改后按较大值校验。实际耗时需核对。</p>${g.assumptions.length||g.answers.length?`<details><summary>查看假设与问答依据</summary>${g.assumptions.map(x=>`<p>待核对：${e(x)}</p>`).join('')}${g.answers.map(x=>`<p><strong>${e(x.question)}</strong><br>${e(x.answer||'未补充，需核对假设')}</p>`).join('')}</details>`:''}</section>`;}
 function budgetField(form,g){let label=form.querySelector('[name="advisorDailyMinutes"]')?.closest('label');if(!label){label=document.createElement('label');label.className='field';label.innerHTML=`<span>明确修改每日可用时间（分钟）</span><input name="advisorDailyMinutes" type="number" min="${g.focusMinutes}" max="720" step="1" value="${g.dailyMinutes}" required>`;form.querySelector('.form-grid').append(label);}}
 function loadAdvice(id,plan){
  taskId=id;const task=getTask();if(!task)throw new Error('请先创建项目。');if(task.plan)throw new Error('该任务已有计划，请使用原重排入口，避免覆盖进度。');
  configure();const f=dialog().querySelector('#planForm');
  f.elements.mode.value='stages';f.elements.total.value=plan.items.length;f.elements.unit.value=plan.unit;f.elements.stageNames.value=plan.items.map(x=>x.title).join('\n');
  for(const key of ['startDate','endDate','style','maxPerDay','bufferDays'])f.elements[key].value=plan.rules[key];
  f.elements.excludedDates.value=plan.rules.excludedDates.join('\n');f.querySelectorAll('[name="workday"]').forEach(x=>x.checked=!plan.rules.excludedWeekdays.includes(Number(x.value)));
  adviceTemplate=P.clean(plan,{strict:true});advisoryGuidance=adviceTemplate.guidance;if(advisoryGuidance)budgetField(f,advisoryGuidance);draft=structuredClone(adviceTemplate);renderPreview();if(!dialog().open)dialog().showModal();dialog().querySelector('#planPreview').scrollIntoView({block:'start'});
 }
 function dashboard(ctx){if(ctx.app.querySelector('.daily-home'))return;const tasks=ctx.getState().tasks.filter(t=>t.plan);if(!tasks.length)return;const el=document.createElement('section');el.className='panel plan-dashboard';el.innerHTML=`<div class="panel-head"><h2>我的大任务 · 各自独立进度</h2><span class="tag">${tasks.length}个计划</span></div>${tasks.map(t=>`<article><strong>${e(t.title)}</strong>${bar(t)}${opening(t)}</article>`).join('')}`;ctx.app.querySelector('.stats')?.after(el);}
 function calendar(ctx){
  const records=ctx.getState().tasks.flatMap(task=>(task.plan?.items||[]).filter(x=>x.date).map(item=>({task,item})));
  for(const cell of ctx.app.querySelectorAll('.calendar-cell')){const date=cell.dataset.day,day=records.filter(x=>x.item.date===date);if(!day.length)continue;const b=document.createElement('button');b.type='button';b.className='calendar-task plan-calendar-chip';b.dataset.planOpen=day[0].task.id;b.textContent=`计划 · ${day.length}项${day.every(x=>x.item.done)?' ✓':''}`;cell.append(b);}
  const selected=ctx.app.querySelector('.calendar-cell.selected')?.dataset.day;if(!selected||!records.some(x=>x.item.date===selected))return;
  const el=document.createElement('section');el.className='panel';el.innerHTML=`<h2>${selected} 执行计划（不是截止日期）</h2>${records.filter(x=>x.item.date===selected).map(({task,item})=>`<div class="settings-row"><div><strong>${e(item.title)}${item.done?' ✓':''}</strong><p>${e(task.title)}</p></div>${opening(task,'打开大任务')}</div>`).join('')||'<p class="small muted">当天没有已安排的子任务。</p>'}`;ctx.app.append(el);
 }
 function preferences(ctx){
  const r=P.rules(ctx.getState().plannerPreferences||{}),el=document.createElement('section');el.className='panel';el.innerHTML=`<h2>我的默认计划习惯</h2><p class="small muted">仅作为新计划默认值；不自动修改任何已有日程。</p><form id="planPreferences">${formRules(r)}<p class="small muted">默认习惯只保存节奏、工作日、额外休息日、每日上限和缓冲；起止日期按每个任务单独填写。</p><button type="submit" class="button">保存默认习惯</button><p class="error" role="alert"></p></form>`;ctx.app.append(el);
  const form=el.querySelector('form');form.querySelectorAll('[name="startDate"],[name="endDate"]').forEach(input=>{input.required=false;input.closest('label').hidden=true;});
  form.onsubmit=async ev=>{ev.preventDefault();try{const value=readRules(form);await ctx.mutate(next=>{next.plannerPreferences=P.rules({...value,startDate:'',endDate:''});},'默认计划习惯已保存');}catch(error){form.querySelector('.error').textContent=error.message;}};
 }
 document.addEventListener('click',async ev=>{
  const opener=ev.target.closest('[data-plan-open]');if(opener){ev.stopImmediatePropagation();open(opener.dataset.planOpen);return;}
  const b=ev.target.closest('[data-plan-action]');if(!b||b.disabled)return;
  if(b.dataset.planAction==='close'){if(draft&&!await api.confirm('放弃尚未保存的预览？','已保存的计划保持不变。'))return;dialog().close();draft=null;return;}
  if(b.dataset.planAction==='configure')configure();
  if(b.dataset.planAction==='overview')overview();
  if(b.dataset.planAction==='preview')preview();
  if(b.dataset.planAction==='capacity-suggest'){
   const advice=draft&&P.capacityAdvice(draft);if(!advice)return;
   const form=dialog().querySelector('#planForm'),field=form.elements.advisorDailyMinutes;
   if(field&&advice.requiredDailyMinutes>720){showError('建议所需每日预算超过720分钟，请调整工作量或日期，不能直接采用。');return;}
   if(!await api.confirm('按建议调整每日安排？',`每日上限从${draft.rules.maxPerDay}项改为${advice.requiredPerDay}项${field?`，每日可用预算从${field.value}分钟改为${Math.max(Number(field.value),advice.requiredDailyMinutes)}分钟`:''}。截止与休息日保持原设置；采用后仍会校验实际分钟预算。`))return;
   form.elements.maxPerDay.value=advice.requiredPerDay;if(field)field.value=Math.max(Number(field.value),advice.requiredDailyMinutes);preview();
  }
  if(b.dataset.planAction==='capacity-day'){
   const form=dialog().querySelector('#planForm'),next=Number(form.elements.maxPerDay.value)+1;if(next>100){showError('每日上限不能超过100项。');return;}const field=form.elements.advisorDailyMinutes,extra=advisoryGuidance?.focusMinutes||30;
   if(field&&Number(field.value)+extra>720){showError('每日时间预算不能超过720分钟。');return;}
   form.elements.maxPerDay.value=next;if(field)field.value=Number(field.value)+extra;preview();
  }
  if(b.dataset.planAction==='capacity-date'){
   const form=dialog().querySelector('#planForm'),next=P.add(form.elements.endDate.value,2),deadline=(getTask().dueAt||getTask().dueDate||'').slice(0,10);if(deadline&&next>deadline){showError('延长2天会超过任务截止日期；请增加可用时间或先核实截止，不能自动延后。');return;}form.elements.endDate.value=next;preview();
  }
  if(b.dataset.planAction==='save')await save();
  if(b.dataset.planAction==='export')api.exportPlan(getTask());
  if(b.dataset.planAction==='remove'&&await api.confirm('删除这个执行计划？','只删除拆分计划和子任务进度，保留大任务、提交状态、原文和材料清单。')){const ok=await api.mutate(next=>{const task=next.tasks.find(t=>t.id===taskId);task.plan=null;task.updatedAt=new Date().toISOString();},'执行计划已删除，大任务仍保留');if(ok){api.refreshTask?.(taskId);dialog().close();}}
 });
 document.addEventListener('change',ev=>{
  if(ev.target.matches('[data-plan-unit-confirm]')&&draft?.guidance){draft.guidance.unitReview={issues:P.reviewUnits(draft,getTask()).issues,confirmed:ev.target.checked};renderPreview();return;}
  if(ev.target.matches('[data-plan-done]')){toggle(ev.target.dataset.planDone,ev.target.checked);return;}
  const row=ev.target.closest('[data-plan-item]');if(!row||!draft)return;
  const item=draft.items.find(x=>x.id===row.dataset.planItem),field=ev.target.dataset.itemField;
  if(item.done)return;
  if(field==='title'){if(!ev.target.value.trim()){showError('子任务名称不能为空。');dialog().querySelector('[data-plan-action="save"]').disabled=true;return;}item.title=ev.target.value.trim();if(draft.guidance)draft.guidance.unitReview=null;}
  if(field==='date'){item.date=ev.target.value;item.locked=true;}
  if(field==='locked')item.locked=ev.target.checked;
  if(field==='minutes'){const n=Number(ev.target.value);if(!Number.isInteger(n)||n<1||n>120){showError('每项时长须为1～120分钟，更长的工作请拆分。');dialog().querySelector('[data-plan-action="save"]').disabled=true;return;}item.minutes=n;item.minutesOrigin='user';if(draft.guidance)draft.guidance.estimatedMinutes=draft.items.reduce((n,x)=>n+(x.minutes||draft.guidance.focusMinutes),0);}
  renderPreview();
 });
 document.addEventListener('dragstart',ev=>{const row=ev.target.closest('[data-plan-item]');if(!row||!draft)return;dragged=row.dataset.planItem;ev.dataTransfer.setData('text/plain',dragged);});
 document.addEventListener('dragover',ev=>{if(ev.target.closest('[data-plan-date]'))ev.preventDefault();});
 document.addEventListener('drop',ev=>{const target=ev.target.closest('[data-plan-date]');if(!target||!draft)return;ev.preventDefault();const item=draft.items.find(x=>x.id===(ev.dataTransfer.getData('text/plain')||dragged));if(item&&!item.done){item.date=target.dataset.planDate;item.locked=true;renderPreview();}});
 return {mount,detail,open,bar,loadAdvice};
})();
