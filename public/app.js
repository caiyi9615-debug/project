'use strict';
const D=window.DH;
const T=window.DHTime;
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${({dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',capture:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',tasks:'<rect x="5" y="4" width="15" height="17" rx="2"/><path d="M9 4V2h7v2M9 10h7M9 15h7"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M8 14h1m6 0h1m-8 4h1"/>',changes:'<path d="M3 8h14l-4-4M21 16H7l4 4M17 8l-4 4M7 16l4-4"/>',radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 7-7M12 12v.01"/>',settings:'<path d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2"/><circle cx="12" cy="12" r="5"/>',upload:'<path d="M4 16v4h16v-4M12 16V3m-5 5 5-5 5 5"/>'})[name]||'<circle cx="12" cy="12" r="8"/>'}</svg>`;
const pages={dashboard:'今天',capture:'识别通知',tasks:'我的任务',calendar:'日历',changes:'通知变更追踪',radar:'任务风险雷达',settings:'系统设置'};
const fieldNames={title:'任务标题',course:'所属课程',executionStatus:'执行状态',dueDate:'仅日期',deadlineKind:'截止信息方式',timeEvidence:'时间依据',description:'任务说明',dueAt:'截止日期',startsAt:'活动开始',dateText:'原文日期',location:'活动地点',priority:'优先级',category:'任务分类',notes:'注意事项',evidence:'原文证据',uncertain:'不确定信息',checklist:'准备清单',dateConfirmed:'日期已确认'};
Object.assign(fieldNames,{plan:'个性执行计划'});
let state,health=null,page='dashboard',busy=false,saveBusy=false;
let filter={search:'',status:'all',category:'all',sort:'due'};
let capture={file:null,image:'',text:'',drafts:[],source:null,error:'',baseAt:'',reviewed:false};
let imageQueue=[];
function menuOpen(value){$('#sidebar').classList.toggle('open',value);$('#sidebarBackdrop').hidden=!value;document.querySelector('[data-action="menu"]').setAttribute('aria-expanded',String(value));}
let calendarMonth=new Date(T.today()+'T12:00'),selectedDay=T.today();calendarMonth.setDate(1);
let currentTaskId=null,toastTimer,revision=0,routeRevision=0;
const app=$('#app');
function closeDialogs(){
  window.DHQuickAdd?.close();
  for(const id of ['confirmDialog','timeDialog','duplicateDialog','advisorDialog','planDialog','taskDialog','guideDialog']){
    const modal=document.getElementById(id);if(!modal?.open)continue;
    if(!['taskDialog','planDialog','advisorDialog','guideDialog'].includes(id))modal.dispatchEvent(new Event('cancel'));
    if(modal.open)modal.close();
  }
}
function noticeName(text,file){
  if(file?.name)return file.name;
  const line=String(text||'').split(/\r?\n/).map(x=>x.trim()).find(Boolean)||'';
  const chars=Array.from(line);return chars.length?chars.slice(0,24).join('')+(chars.length>24?'…':''):'文字通知';
}
function toast(message,error=false){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').className=error?'error-toast':'';$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
async function mutate(fn,message){
  if(saveBusy){toast('正在保存，请稍候');return false;}
  saveBusy=true;
  const next=structuredClone(state);
  try {fn(next);await CampusStore.write(next);state=next;revision++;channel?.postMessage({revision});render();window.DHPush?.sync(next.tasks);if(message)toast(message);return true;}
  catch(error){toast(error.message||'保存失败，数据未改变',true);return false;}
  finally{saveBusy=false;}
}
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('deadline-hunter-v2'):null;
channel?.addEventListener('message',async()=>{if(saveBusy)return;state=await CampusStore.read();render();toast('已同步其他标签页的数据');});
function stamp(){return new Date().toISOString();}
function formatDate(value){return value?String(value).replace('T',' '):'待确认日期';}
function shortDate(value){return value?`${value.slice(5,10)} ${value.slice(11,16)}`:'待确认';}
function priorityTag(task){return `<span class="tag ${task.priority==='高'?'high':task.priority==='中'?'medium':''}">${esc(task.priority)}优先级</span>`;}
function head(title,description,buttons=''){return `<div class="page-head"><div><h1>${title}</h1><p>${description}</p></div><div class="actions">${buttons}</div></div>`;}
function empty(title,description='',action=''){return `<div class="empty"><div class="empty-icon">${icon('tasks')}</div><strong>${title}</strong><p>${description}</p>${action}</div>`;}
function button(label,action,extra='',classes=''){return `<button type="button" class="button ${classes}" data-action="${action}" ${extra}>${label}</button>`;}
function route(next){location.hash=next;}
function taskRow(task){return DHSimple.row(task);}
function render(){
  app.dataset.page=page;
  document.documentElement.dataset.theme=state.theme||'light';
  try{if(localStorage.getItem('dh-theme')!==(state.theme||'light'))localStorage.setItem('dh-theme',state.theme||'light');}catch{}
  $('#navigation').innerHTML=DHSimple.nav(page,state);
  $('#breadcrumb').textContent='工作空间 / '+pages[page];
  app.innerHTML=({dashboard:renderDashboard,capture:renderCapture,tasks:renderTasks,calendar:renderCalendar,changes:renderChanges,radar:renderRadar,settings:renderSettings})[page]();
  if(page==='settings')window.DHPush?.mount(app,state);
  if(page==='capture')wireCapture();
  window.DHPlannerUI?.mount({app,page,getState:()=>state,getDraft:id=>capture.drafts.find(x=>x.id===id),mutate,toast,confirm:confirmAction,refreshTask:id=>{if($('#taskDialog').open&&currentTaskId===id)openTask(id);},exportPlan:task=>download('Deadline-Hunter-执行计划.ics',D.ics(task.plan.items.filter(x=>x.date).map(x=>D.cleanTask({id:task.id+'-'+x.id,title:task.title+' · '+x.title+'（计划安排，非截止）',dueDate:x.date,deadlineKind:'date',description:'个人执行计划，不代表通知原始截止时间。',executionStatus:x.done?'completed':'unsubmitted'}))),'text/calendar;charset=utf-8')});
  window.DHExperience?.mount({app,page,getState:()=>state,capture,mutate,toast,loadDemo,prepareDemoCapture});
  DHQuickAdd.mount({getState:()=>state,mutate,toast,openManual:()=>openTask(null,true),confirm:confirmAction,duplicate:duplicateChoice});
  DHSimple.tidy(page,app);
}
function prepareDemoCapture(){if(capture.drafts.length||capture.text||capture.image)return;const task=state.tasks.find(t=>t.demo&&t.dueAt);if(!task)return;const text=`【示例回放，非实时AI】${task.title}：${task.dueAt.replace('T',' ')}前提交。`;capture.text=text;capture.drafts=[D.cleanTask({...task,id:D.uid(),evidence:text,dateText:task.dueAt.replace('T',' '),demo:true})];capture.source={id:D.uid(),kind:'text',name:'示例识别回放（非实时AI）',text,image:'',demo:true,createdAt:stamp()};capture.reviewed=true;render();}
function renderDashboard(){return DHSimple.dashboard({state});}
function renderTasks(){return DHSimple.tasks({state,filter});}
function renderCapture(){
  return head('AI通知识别中心','上传截图或粘贴原文，拆分事项、保留证据，确认后再加入任务。')+
    (location.protocol==='file:'?'<div class="notice warn">请先运行 start.bat，从 http://127.0.0.1:8790 使用；直接打开文件无法调用AI和保存数据。</div>':'')+
    `<div class="ai-grid capture-workspace"><section class="panel capture-input"><div class="panel-head"><h2>捕捉一条校园通知</h2><span class="capture-provider">DeepSeek</span></div><div id="dropzone" class="dropzone" tabindex="0" role="button" aria-label="选择或拖入通知图片">${icon('upload')}<strong>拖拽图片到这里，或点击上传</strong><span>PNG、JPG、JPEG、WEBP、GIF · 单张最大10 MB</span></div><input id="imageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
    ${capture.image?`<div class="preview"><img src="${esc(capture.image)}" alt="通知原图预览"><div><strong>${esc(capture.file?.name||'通知图片')}</strong><small>${((capture.file?.size||0)/1024).toFixed(1)} KB</small><div class="actions">${button('替换','replace-image','','text compact')}${button('移除','remove-image','','danger compact')}</div></div></div>`:''}
    <div class="separator">或粘贴通知文字（可与图片一起提交）</div><label class="field"><span>通知原文</span><textarea id="noticeText" rows="5" maxlength="20000" placeholder="将课程群、班级通知或校园公告文字粘贴到这里…">${esc(capture.text)}</textarea></label><p class="capture-time-note">${icon('calendar')}<span>缺少年份、具体时刻或截图时间时，会请你核实；待核实也能保存。</span></p>
    ${capture.error?`<p class="error capture-error" role="alert">${esc(capture.error)}</p>`:''}<button class="button primary wide" data-action="analyze" ${busy?'disabled':''}>${busy?'<span class="spinner"></span>正在提取事项…':`${icon('capture')} 开始AI识别`}</button><p class="capture-privacy">${busy?'请保持页面打开，最长等待90秒。':'上传内容将发送至 DeepSeek；识别结果保存后，原文证据留在本机浏览器。'}</p></section>
    <section class="panel capture-results ${capture.drafts.length?'has-drafts':''}" aria-busy="${busy}"><div class="panel-head"><h2>待确认事项 ${capture.drafts.length?`<span class="result-count">${capture.drafts.length}项</span>`:''}</h2>${capture.drafts.length?`<div class="actions">${button('批量核实时间/状态','review-time','','compact')}${button('全部加入任务','add-all','','primary compact')}</div>`:''}</div>${capture.drafts.length?`<p class="small muted">时间待核实也能保存。展开单项编辑；相似任务先比较，再决定更新或新增。</p>${capture.drafts.map(renderDraft).join('')}`:`<div class="capture-placeholder ${busy?'is-busy':''}" role="status"><div class="capture-result-icon">${icon('tasks')}${busy?'<span class="capture-status-dot"></span>':''}</div><h3>${busy?'正在理解通知内容':'这里将显示可编辑的识别结果'}</h3><p>${busy?'分别提取时间依据、课程和执行状态。':'支持一张截图多个事项，已完成/待批阅不会混入未提交催办。'}</p>${busy?'<div class="capture-progress" role="status"><span>准备数据 ✓</span><span class="active">AI识别中</span><span>等待结果校验</span></div>':''}<div class="capture-skeleton" aria-hidden="true">${[0,1,2].map(()=>'<div><i></i><span><b></b><em></em></span></div>').join('')}</div><small>${busy?'请保持页面打开，最长等待90秒。':'上传或粘贴通知后，点击「开始AI识别」'}</small></div>`}</section></div>`;
}
function renderDraft(t,index){
  const matches=D.candidates({...t,sourceFingerprint:capture.source?.fingerprint},state.tasks,state.sources,state.history);
  return `<article class="draft-card compact-draft" data-draft="${esc(t.id)}"><header><div><strong>${esc(t.title)}</strong><p class="small muted">${esc(t.course||'课程未识别')} · ${esc(capture.source?.name||'AI识别来源')}</p></div><span class="tag ${T.completed(t)?'done':''}">${esc(T.statuses[t.executionStatus]||'未知')}</span></header><p class="draft-time">${esc(T.label(t))}</p>${matches.length?`<p class="small duplicate-hint">发现 ${matches.length} 个可能重复/关联事项，保存时可比较差异</p>`:''}
  <details class="draft-details"><summary>展开编辑与时间证据</summary><div class="form-grid">
  ${inputField('title','任务标题',t.title,'text',true)}${inputField('course','所属课程',t.course,'text',true)}${selectField('category','分类',D.categories,t.category)}${statusField(t.executionStatus)}${deadlineFields(t)}${inputField('startsAt','活动开始时间',t.startsAt,'datetime-local')}${inputField('location','地点',t.location)}${selectField('priority','优先级',['高','中','低'],t.priority)}${inputField('dateText','原始时间表述',t.dateText,'text',true)}${textField('description','任务说明',t.description)}${textField('checklist','材料 / 准备清单（每行一项）',t.checklist.map(x=>x.text).join('\n'))}${textField('notes','注意事项',t.notes)}${textField('evidence','原文证据',t.evidence)}${textField('uncertain','不确定信息（每行一项）',t.uncertain.join('\n'))}</div><label class="check-label"><input name="dateConfirmed" type="checkbox" ${t.dateConfirmed?'checked':''}>已核实时间依据（未核实也允许保存）</label>${timeEvidenceHTML(t)}
  <label class="field"><span>选择已有任务进行关联</span><select name="target"><option value="">选择已有任务…</option>${state.tasks.map(old=>`<option value="${esc(old.id)}" ${t.targetId===old.id?'selected':''}>${matches.some(x=>x.task.id===old.id)?'可能相关 · ':''}${esc(old.title)} ${esc(old.course||'')}</option>`).join('')}</select></label>${button('比较并创建变更确认','compare-draft',`data-id="${esc(t.id)}"`,'text compact')}</details>
  <div class="actions">${button('加入任务中心','add-draft',`data-id="${esc(t.id)}"`,'primary compact')}${button('核实本项','review-one',`data-id="${esc(t.id)}"`,'compact')}${button('删除此项','discard-draft',`data-id="${esc(t.id)}"`,'text compact danger')}</div></article>`;
}
function statusField(value){return `<label class="field"><span>当前执行状态</span><select name="executionStatus">${Object.entries(T.statuses).map(([key,label])=>`<option value="${key}" ${key===value?'selected':''}>${label}</option>`).join('')}</select></label>`;}
function deadlineFields(t){return `<label class="field"><span>截止信息类型</span><select name="deadlineKind">${[['datetime','日期＋时间'],['date','仅日期'],['pending','待核实'],['none','无截止时间']].map(([key,label])=>`<option value="${key}" ${key===t.deadlineKind?'selected':''}>${label}</option>`).join('')}</select></label>${inputField('dueAt','准确截止日期与时间',t.dueAt,'datetime-local')}${inputField('dueDate','仅日期（不补具体时刻）',t.dueDate,'date')}`;}
function timeEvidenceHTML(t){const e=t.timeEvidence||{};return `<div class="time-evidence"><strong>时间证据追溯</strong><dl><dt>原始时间</dt><dd>${esc(e.raw||t.dateText||'未提供')}</dd><dt>识别类型</dt><dd>${esc(T.types[e.type]||'未知')}</dd><dt>时区</dt><dd>Asia/Shanghai（UTC+8）</dd><dt>截图基准及来源</dt><dd>${esc(e.baseAt||'未提供')} · ${esc(e.baseSource||'未核实')}</dd><dt>解析/计算方式</dt><dd>${esc(e.method||'未推算')}</dd><dt>精度及推算</dt><dd>${esc(e.precision||'未知')} · ${e.inferred?'推算值':'非推算值'}</dd><dt>核实状态</dt><dd>${esc(({pending:'待核实',estimated:'推算待核实',confirmed:'用户已核实',date_only:'用户确认仅日期',none:'无截止时间'})[e.verification]||'待核实')} · ${t.dateConfirmed?'已经人工确认':'尚未人工确认'}</dd></dl></div>`;}
function inputField(name,label,value,type='text',full=false){return `<label class="field ${full?'full':''}"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${name==='title'?'required maxlength="150"':''} ${['estimatedHours','availableHours'].includes(name)?'min="0" max="1000" step="0.5"':''}></label>`;}
function textField(name,label,value){return `<label class="field full"><span>${label}</span><textarea name="${name}" rows="3">${esc(value)}</textarea></label>`;}
function selectField(name,label,options,value){return `<label class="field"><span>${label}</span><select name="${name}">${options.map(x=>`<option ${x===value?'selected':''}>${esc(x)}</option>`).join('')}</select></label>`;}
function syncDrafts(){
  if(page!=='capture')return;
  const text=$('#noticeText');if(text)capture.text=text.value;
  for(const el of document.querySelectorAll('[data-draft]')){
    const i=capture.drafts.findIndex(t=>t.id===el.dataset.draft);if(i<0)continue;
    const data={...capture.drafts[i]};
    for(const field of el.querySelectorAll('[name]')){
      if(field.name==='target'){data.targetId=field.value;continue;}
      if(field.name==='dateConfirmed')data.dateConfirmed=field.checked;
      else if(field.name==='checklist')data.checklist=field.value.split('\n').filter(x=>x.trim()).map(text=>({id:D.uid(),text:text.trim(),done:false}));
      else if(field.name==='uncertain')data.uncertain=field.value.split('\n').filter(x=>x.trim());
      else data[field.name]=field.value;
    }
    const before=capture.drafts[i];
    if(data.dueAt!==before.dueAt&&data.dueAt)data.deadlineKind='datetime';
    else if(data.dueDate!==before.dueDate&&data.dueDate)data.deadlineKind='date';
    if(data.deadlineKind==='datetime'&&!T.valid(data.dueAt)||data.deadlineKind==='date'&&!T.dateOnly(data.dueDate))data.deadlineKind='pending';
    const changedTime=data.dueAt!==before.dueAt||data.dueDate!==before.dueDate;
    data.timeEvidence={...data.timeEvidence,confirmed:data.dateConfirmed,verification:data.deadlineKind==='none'?'none':data.dateConfirmed?(data.deadlineKind==='date'?'date_only':'confirmed'):data.timeEvidence?.inferred?'estimated':'pending',...(changedTime?{inferred:false,method:'用户编辑截止信息'}:{})};
    capture.drafts[i]=data;
  }
}
function wireCapture(){
  const drop=$('#dropzone'),file=$('#imageFile');
  drop.onclick=()=>{if(!busy)file.click();};drop.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();if(!busy)file.click();}};
  file.onchange=()=>{const images=[...file.files];file.value='';enqueueImages(images);};
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag');};drop.ondragleave=()=>drop.classList.remove('drag');
  drop.ondrop=e=>{e.preventDefault();drop.classList.remove('drag');enqueueImages([...e.dataTransfer.files]);};
  $('#noticeText').oninput=e=>capture.text=e.target.value;
  file.multiple=true;
  if(imageQueue.length){const queue=document.createElement('div');queue.className='notice image-queue';queue.innerHTML=`<strong>等待识别 ${imageQueue.length} 张</strong><p>${imageQueue.map(f=>esc(f.name)).join('、')}</p>${button('识别下一张','next-image','','compact')}${button('清空队列','clear-queue','','text compact')}`;drop.after(queue);}
}
async function enqueueImages(files){if(busy)return;const images=files.filter(f=>['image/png','image/jpeg','image/webp','image/gif'].includes(f.type)||/\.(png|jpe?g|webp|gif)$/i.test(f.name));if(!images.length){toast('请选择支持的图片格式',true);return;}if(images.length>20){toast('单批最多20张图片',true);return;}if(images.some(f=>f.size>10*1024*1024)){toast('队列中有图片超过10 MB，请移除后重试',true);return;}if(capture.drafts.length&&!await confirmAction('替换当前识别图片？','尚未保存的候选事项会清除；取消可先保存当前结果。'))return;imageQueue.push(...images.slice(1));await chooseImage(images[0]);}
document.addEventListener('paste',ev=>{if($('#quickDialog').open||page!=='capture'||busy)return;const files=[...ev.clipboardData?.items||[]].filter(x=>x.type.startsWith('image/')).map(x=>x.getAsFile()).filter(Boolean);if(files.length){ev.preventDefault();enqueueImages(files);}});
async function chooseImage(file){
  if(!file||busy)return;
  syncDrafts();
  if(file.size>10*1024*1024){toast('图片超过10 MB，请压缩后重试',true);return;}
  if(!file.size){toast('图片为空',true);return;}
  const type=file.type||({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'})[file.name.split('.').pop().toLowerCase()];
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(type)){toast('请选择PNG、JPG、WEBP或GIF；HEIC请先转为JPG',true);return;}
  try{
    const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('读取图片失败'));reader.readAsDataURL(file);});
    await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=()=>reject(new Error('图片内容损坏或无法解码，请更换图片'));img.src=image;});
    capture.file=file;capture.image=image;capture.error='';capture.drafts=[];capture.source=null;capture.baseAt='';capture.reviewed=false;if(page==='capture')render();
  }catch(error){toast(error.message,true);}
}
async function analyze(){
  if(busy)return;syncDrafts();
  if(!capture.image&&!capture.text.trim()){capture.error='请先上传图片或粘贴通知文字。';render();return;}
  if(capture.drafts.length&&!await confirmAction('重新识别？','当前尚未加入任务的识别结果将被替换。'))return;
  const input={text:capture.text.trim()};
  if(capture.image){const match=capture.image.match(/^data:([^;]+);base64,(.+)$/s);input.image={mimeType:match[1],data:match[2]};}
  const submittedSource={id:D.uid(),name:noticeName(capture.text,capture.file),kind:capture.image?'image':'text',image:capture.image,text:capture.text,createdAt:stamp(),demo:false};
  busy=true;capture.error='';render();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),95000);
  try{
    submittedSource.fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(submittedSource.image+'\n'+submittedSource.text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
    const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(input),signal:controller.signal});
    let payload;try{payload=await response.json();}catch{throw new Error('服务返回的结果无法读取，请确认启动了V2服务。');}
    if(!response.ok)throw new Error(payload.error||'识别失败');
    if(!Array.isArray(payload.result?.tasks)||!payload.result.tasks.length)throw new Error('AI未返回任务，请重试。');
    capture.drafts=payload.result.tasks.map(t=>D.cleanTask(T.resolve(t)));
    capture.source=submittedSource;
    toast(`已提取 ${capture.drafts.length} 个事项，请核对后加入任务`);
    capture.reviewed=false;
    if(page==='capture'&&capture.drafts.some(TimeReview.needs)){busy=false;render();await reviewTime();}
  }catch(error){capture.error=error.name==='AbortError'?'识别超时，请检查网络后重试。':error.message;}
  finally{clearTimeout(timer);busy=false;if(page==='capture')render();}
}
async function addDraft(ids){
  const navigation=routeRevision;
  syncDrafts();
  if(!capture.reviewed&&capture.drafts.some(t=>ids.includes(t.id)&&TimeReview.needs(t))){if(!await reviewTime(ids))return;}
  if(navigation!==routeRevision)return;
  const selected=[],invalid=[];
  for(const t of capture.drafts.filter(t=>ids.includes(t.id))){try{selected.push(D.cleanTask(t,{strict:true}));}catch(error){invalid.push(t.id);}}
  if(!selected.length){if(invalid.length)toast('任务标题为空，请先填写标题；缺少时间不会阻止保存。',true);return;}
  const fresh=[],updates=[],processed=[];
  for(const t of selected){
    const matches=D.candidates({...t,sourceFingerprint:capture.source?.fingerprint},[...state.tasks,...fresh],state.sources,state.history);
    const decision=matches.length?await duplicateChoice(t,matches):{action:'new'};
    if(navigation!==routeRevision)return;
    if(decision.action==='cancel')continue;
    processed.push(t.id);
    if(decision.action==='new')fresh.push(t);
    if(decision.action==='update'){const old=[...state.tasks,...fresh].find(x=>x.id===decision.id);updates.push({id:D.uid(),taskId:old.id,before:structuredClone(old),baseUpdatedAt:old.updatedAt,proposed:{...t,id:old.id},sourceId:capture.source?.id||'',status:'pending',createdAt:stamp()});}
  }
  const source=capture.source;
  if(!processed.length)return;
  if(await mutate(next=>{
    if(source&&!next.sources.some(x=>x.id===source.id))next.sources.unshift(source);
    for(const t of fresh)next.tasks.push({...t,sourceId:source?.id||'',sourceIds:source?[source.id]:[],createdAt:t.createdAt,updatedAt:t.updatedAt});
    for(const c of updates){next.changes.unshift(c);D.applyChange(next,c);}
  },`新增 ${fresh.length} 项，确认更新 ${updates.length} 项，忽略 ${processed.length-fresh.length-updates.length} 项${invalid.length?`；${invalid.length}项标题无效，保留待修改`:''}`)){
    capture.drafts=capture.drafts.filter(t=>!processed.includes(t.id));render();
  }
}
async function reviewTime(ids=capture.drafts.map(t=>t.id)){
  syncDrafts();const selected=capture.drafts.filter(t=>ids.includes(t.id));if(!selected.length)return;
  for(const group of TimeReview.groups(selected)){
   const result=await TimeReview.open(group);if(result.cancelled)return false;
   capture.drafts=capture.drafts.map(t=>result.tasks.find(x=>x.id===t.id)||t);
  }
  capture.reviewed=true;
  render();
  return true;
}
async function reviewSavedTimes(ids,singleSource=false){
  const values=state.tasks.filter(t=>ids.includes(t.id));
  if(!singleSource&&values.some(t=>['duration','relative'].includes(T.classify(t.dateText,t)))){const groups=new Map();for(const t of values){const key=T.classify(t.dateText,t)+'|'+(t.sourceId||t.id)+'|'+(t.timeEvidence?.baseAt||'');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t.id);}if(groups.size>1){for(const group of groups.values())if(!await reviewSavedTimes(group,true))return false;return true;}}
  const navigation=routeRevision,original=state.tasks.filter(t=>ids.includes(t.id));if(!original.length)return;
  const selected=original.map(t=>t.deadlineKind==='pending'&&!t.dueAt&&!t.dueDate&&T.partialDate(t.dateText)?D.cleanTask(T.resolve(t)):structuredClone(t));
  const detailWasOpen=$('#taskDialog').open;if(detailWasOpen)$('#taskDialog').close();
  const result=await TimeReview.open(selected);if(result.cancelled||navigation!==routeRevision){if(detailWasOpen&&navigation===routeRevision)openTask(original[0].id);return false;}
  const ok=await mutate(next=>{for(const t of result.tasks){const i=next.tasks.findIndex(x=>x.id===t.id),before=next.tasks[i],base=original.find(x=>x.id===t.id);if(!before||before.updatedAt!==base.updatedAt)throw new Error('任务已在其他位置修改，请重新核实，避免覆盖。');const after=D.cleanTask({...before,...t,updatedAt:stamp()});next.tasks[i]=after;next.history.unshift({id:D.uid(),taskId:t.id,kind:'manual',before:structuredClone(before),after:structuredClone(after),at:stamp()});}},result.skipped?'已保留待核实信息':'截止信息已更新，日历与计划已同步');
  if(ok&&detailWasOpen)openTask(original[0].id);
  return ok;
}
function duplicateChoice(task,matches){return new Promise(resolve=>{
 const dialog=$('#duplicateDialog');
 function show(id){const match=matches.find(x=>x.task.id===id)||matches[0],old=match.task;
 dialog.innerHTML=`<div class="dialog-head"><h2>发现可能重复或更新的任务</h2></div><div class="dialog-body"><label class="field"><span>选择已有任务进行比较</span><select id="duplicateTarget">${matches.map(m=>`<option value="${esc(m.task.id)}" ${m.task.id===old.id?'selected':''}>${esc(m.task.title)} · ${esc(m.task.course||'未填写课程')}</option>`).join('')}</select></label><p class="small muted">匹配依据：${match.reasons.map(esc).join('；')}。匹配分数不代表时间准确。</p><div class="diff-grid"><div class="diff-side"><strong>已有任务</strong><h3>${esc(old.title)}</h3><p>${esc(old.course||'课程未填')}</p><p>${esc(T.label(old))}</p><p>${esc(T.statuses[old.executionStatus])}</p><p class="text-wrap small">${esc(old.evidence||old.description||'原文未提供')}</p></div><div class="diff-side after"><strong>本次识别</strong><h3>${esc(task.title)}</h3><p>${esc(task.course||'课程未识别')}</p><p>${esc(T.label(task))}</p><p>${esc(T.statuses[task.executionStatus])}</p><p class="text-wrap small">${esc(task.evidence||task.description||'原文未提供')}</p></div></div><details><summary>逐字段差异与时间证据</summary>${D.differences(old,{...task,plan:old.plan}).map(d=>`<p class="small"><b>${esc(fieldNames[d.key])}</b>：${esc(diffValue(d.before))} → ${esc(diffValue(d.after))}</p>`).join('')||'<p>结构化内容一致，可忽略此次识别。</p>'}</details><div class="notice warn">只有点击“关联并更新”才替换旧内容并写入历史。已完成与待批阅状态的变化也由你确认。</div></div><div class="dialog-foot"><button class="button" data-choice="ignore">忽略此次识别</button><button class="button" data-choice="new">保留为新任务</button><button class="button primary" data-choice="update">关联并更新已有任务</button></div>`;
 dialog.querySelector('#duplicateTarget').onchange=e=>show(e.target.value);
 dialog.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{dialog.close();resolve({action:b.dataset.choice,id:old.id});});
 }
 show(matches[0].task.id);dialog.oncancel=()=>resolve({action:'cancel'});dialog.showModal();
});}
async function compareDraft(id){
  syncDrafts();const draft=capture.drafts.find(t=>t.id===id),target=state.tasks.find(t=>t.id===draft?.targetId);
  if(!target){toast('请先选择需要关联的已有任务',true);return;}
  let proposed;try{proposed=D.cleanTask({...draft,id:target.id,plan:target.plan},{strict:true});}catch(error){toast(error.message,true);return;}
  if(!D.differences(target,proposed).length){toast('新旧内容没有变化');return;}
  await mutate(next=>{
    if(!next.sources.some(x=>x.id===capture.source.id))next.sources.unshift(capture.source);
    next.changes.unshift({id:D.uid(),taskId:target.id,sourceId:capture.source.id,baseUpdatedAt:target.updatedAt,before:structuredClone(target),proposed,status:'pending',createdAt:stamp()});
  },'已创建变更对比，原任务尚未修改');route('changes');
}
function renderCalendar(){
  const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth(),start=new Date(year,month,1),offset=(start.getDay()+6)%7;start.setDate(start.getDate()-offset);
  const cells=Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return d;});
  const tasksFor=key=>state.tasks.filter(t=>(t.dueAt||t.dueDate||'').slice(0,10)===key||t.startsAt.slice(0,10)===key);
  return head('日历中心','截止日与活动开始时间同屏呈现；点击任务即可修改，所有模块实时同步。',button('导出ICS日历','ics','','primary'))+
    `<section class="panel"><div class="calendar-toolbar"><h2>${year} 年 ${month+1} 月</h2><div class="actions">${button('← 上月','prev-month','','compact')}${button('今天','today','','compact')}${button('下月 →','next-month','','compact')}</div></div><div class="legend"><span><i></i>截止 / 活动</span><span>仅日期按全天信息展示，不补23:59</span><span>红色：已核实、待行动的临期事项</span></div><div class="calendar-grid">${['一','二','三','四','五','六','日'].map(x=>`<div class="calendar-weekday">周${x}</div>`).join('')}${cells.map(d=>{const key=D.dayKey(d),tasks=tasksFor(key);return `<div class="calendar-cell ${d.getMonth()!==month?'outside':''} ${selectedDay===key?'selected':''}" data-action="select-day" data-day="${key}"><button class="day-number ${key===T.today()?'today':''}" data-action="select-day" data-day="${key}">${d.getDate()}</button>${tasks.slice(0,3).map(t=>`<button class="calendar-task ${!T.actionable(t)?'done':''} ${T.actionable(t)&&t.dateConfirmed&&t.dueAt&&T.epoch(t.dueAt)-Date.now()<=72*3600000?'urgent':''}" data-category="${esc(t.category)}" data-action="detail" data-id="${esc(t.id)}" title="${esc(T.label(t))}">${!t.dateConfirmed?'待确认 · ':''}${t.dueDate===key?'仅日期':t.dueAt.slice(0,10)===key?'截止':'开始'} · ${esc(t.title)}</button>`).join('')}${tasks.length>3?`<small class="muted">另有 ${tasks.length-3} 项</small>`:''}</div>`;}).join('')}</div></section>
    <section class="panel"><div class="panel-head"><h2>${selectedDay} 当天事项</h2>${button('＋ 当天新增','new-day','','compact')}</div>${tasksFor(selectedDay).length?tasksFor(selectedDay).map(taskRow).join(''):empty('当天没有任务','未确认日期的任务仍保留在任务中心。')}</section>`;
}
function diffValue(value){if(value&&Array.isArray(value.items))return `执行计划：${value.items.filter(x=>x.done).length}/${value.items.length}项已完成；${value.rules.startDate}～${value.rules.endDate}`;if(Array.isArray(value))return value.map(x=>typeof x==='object'?x.text:x).join('；')||'无';if(typeof value==='boolean')return value?'已确认':'待确认';if(value&&typeof value==='object')return JSON.stringify(value);if(T.statuses[value])return T.statuses[value];return value?String(value).replace('T',' '):'未提供';}
function renderChanges(){
  const pending=state.changes.filter(x=>x.status==='pending');
  return head('AI通知变更追踪','AI理解通知内容，规则推荐关联候选；由你核对前后证据并决定是否更新。')+
    `<div class="notice">新通知不会自动覆盖已有任务。候选综合标题、课程、截止信息、原文、状态与历史，不代表已确认关联；你可以人工选择任意任务进行比较。</div>
    <h2 class="section-title">待确认变更 · ${pending.length}</h2>${pending.length?pending.map(c=>{
      const diffs=D.differences(c.before,c.proposed);return `<section class="panel change-card"><div class="panel-head"><h2>${esc(c.before.title)}</h2><span class="tag medium">等待人工确认</span></div><div class="diff-grid"><div class="diff-side"><strong>原始任务</strong>${diffs.map(d=>`<div class="diff-row"><b>${fieldNames[d.key]}</b>${esc(diffValue(d.before))}</div>`).join('')}</div><div class="diff-side after"><strong>新通知建议内容</strong>${diffs.map(d=>`<div class="diff-row changed"><b>${fieldNames[d.key]}</b>${esc(diffValue(d.after))}</div>`).join('')}</div></div><details><summary>查看新通知原文</summary>${renderSource(state.sources.find(s=>s.id===c.sourceId))}</details><div class="actions" style="margin-top:15px">${button('确认属于同一事项，应用更新','accept-change',`data-id="${esc(c.id)}"`,'primary')}${button('拒绝变更，保留原任务','reject-change',`data-id="${esc(c.id)}"`,'danger')}</div></section>`;
    }).join(''):`<section class="panel">${empty('暂无待确认的通知变更','到识别中心上传新通知，选择已有任务进行比较。',button('识别新通知','capture','','primary'))}</section>`}
    <section class="panel"><div class="panel-head"><h2>处理记录与任务历史</h2><small>已接受 / 已拒绝 / 手动修改</small></div>${state.changes.filter(c=>c.status!=='pending').map(c=>`<div class="history-entry"><strong>${esc(c.before.title)} <span class="tag ${c.status==='accepted'?'done':''}">${c.status==='accepted'?'已应用':'已拒绝，原任务保留'}</span></strong><p>${new Date(c.createdAt).toLocaleString('zh-CN')}</p>${button('查看任务和历史','detail',`data-id="${esc(c.taskId)}"`,'text compact')}</div>`).join('')}${state.history.filter(h=>h.kind==='manual').slice(0,20).map(h=>`<div class="history-entry"><strong>${esc(h.after.title)} · 手动修改</strong><p>${esc(new Date(h.at).toLocaleString('zh-CN'))}</p>${button('查看详情','detail',`data-id="${esc(h.taskId)}"`,'text compact')}</div>`).join('')}${!state.changes.some(c=>c.status!=='pending')&&!state.history.length?empty('尚无修改记录','应用通知更新或编辑任务后，历史会显示在这里。'):''}</section>`;
}
function renderRadar(){
  const risks=D.risks(state.tasks),soon=state.tasks.filter(t=>T.actionable(t)&&t.dateConfirmed&&t.dueAt&&T.epoch(t.dueAt)>=Date.now()&&T.epoch(t.dueAt)-Date.now()<=48*3600000);
  return head('任务风险雷达','每条预警都有数据依据：截止时间、集中程度、准备清单与个人可用时间。')+
    `<div class="notice ${risks.some(r=>r.severity>=3)?'warn':''}">未来48小时有 ${soon.length} 项任务截止，${soon.filter(t=>t.checklist.some(x=>!x.done)).length} 项仍有准备工作未完成。${risks.length?'建议从下方最高风险任务开始处理。':'当前没有需要关注的风险。'}</div><div class="stats-mini"><span><b>${risks.filter(r=>r.severity===4).length}</b>逾期</span><span><b>${risks.filter(r=>r.severity===3).length}</b>紧急</span><span><b>${risks.filter(r=>r.severity===2).length}</b>关注</span><span><b>${risks.filter(r=>r.severity===1).length}</b>准备 / 日期待确认</span></div>
    <section class="panel">${risks.length?risks.map(r=>`<article class="risk-item ${r.severity>=3?'severe':''}"><header><button class="task-title" data-action="detail" data-id="${esc(r.task.id)}">${esc(r.task.title)}</button><span class="tag risk-${r.severity}">${['','准备提醒','需要关注','紧急处理','已过期'][r.severity]}</span></header><p class="small muted">截止：${esc(T.label(r.task))} · 材料进度 ${D.progress(r.task)}%</p><ul>${r.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="risk-advice">行动建议：${r.suggestions.map(esc).join('；')}。</div></article>`).join(''):empty('当前没有风险任务','完成任务后预警会自动消失。')}</section><p class="small muted" style="margin-top:16px">耗时风险只在你填写“预计耗时”和“截止前剩余可用时间”后计算，不用自然时间代替你的真实可用时间。</p>`;
}
function renderSettings(){return head('系统设置','管理AI连接、本地数据和使用偏好。')+`<div class="grid-equal"><div class="stack"><section class="panel"><h2>AI 服务</h2><div class="settings-row"><div><strong>DeepSeek ${health?.deepseekConfigured?'密钥已配置':'待配置密钥'}</strong><p>当前模型：${esc(health?.model||'deepseek-flash')}</p><p>配置状态不代表真实调用成功；测试会发送一次简短请求。</p></div>${button('实际连接测试','test-ai','','primary')}</div><p class="small muted">${['localhost','127.0.0.1','[::1]'].includes(location.hostname)?'本地维护者可用config-api.cmd配置并重启服务。':health?.deepseekConfigured?'AI由服务端配置，访问者无需填写密钥。':'AI暂不可用，请联系维护者；本地任务管理仍可使用。'}密钥不会在页面展示。</p></section><section class="panel"><h2>本地数据与备份</h2><div class="settings-row"><div><strong>导出完整备份</strong><p>包含任务、原始通知、图片、变更与历史。</p></div>${button('导出JSON','export')}</div><div class="settings-row"><div><strong>恢复备份</strong><p>导入前校验格式；确认后替换当前本地数据。</p></div>${button('导入备份','import')}</div><div class="settings-row"><div><strong>体验完整工作流程</strong><p>演示数据明确标注，可单独清除。</p></div>${button('加载演示数据','demo')}</div><div class="settings-row"><div><strong>清空演示数据</strong><p>只删除带“演示”标记的记录。</p></div>${button('清空演示','clear-demo','','danger')}</div><div class="settings-row"><div><strong>清空所有本地数据</strong><p>此操作需确认，建议先导出备份。</p></div>${button('清空全部','clear-all','','danger')}</div></section></div><div class="stack"><section class="panel"><h2>外观与基础使用</h2><div class="settings-row"><div><strong>${state.theme==='dark'?'深色':'浅色'}主题</strong><p>主题会保存在当前浏览器。</p></div>${button('切换明暗','theme')}</div><div class="notice">1. 上传图片或粘贴通知 → AI拆出多个事项。<br>2. 检查原文与日期 → 编辑后加入任务。<br>3. 在任务详情独立勾选材料、确认截止日期。<br>4. 新通知有变化时关联旧任务 → 比较后接受或拒绝。<br>5. 日历、工作台与风险雷达自动联动。</div><p class="small muted">本地数据保存在当前网址、当前浏览器的IndexedDB。换浏览器、换端口不会自动迁移；清除网站数据会删除记录，请定期备份。通知图片只在识别时发给DeepSeek。</p></section><section class="panel"><h2>关于作品</h2><div class="settings-row"><div><strong>Deadline Hunter——AI校园信息捕手</strong><p>智慧校园AI信息管理与任务执行平台</p></div></div><div class="settings-row"><div><strong>开发团队：路边队</strong><p>参赛人数：3人 · 参赛赛道：智慧校园</p></div><span class="tag">V2.4.2</span></div><p class="small muted" style="margin-top:15px">创新闭环：校园信息捕捉 → 多任务理解 → 通知关联与变更确认 → 材料准备 → 风险分析 → 行动执行。</p></section></div></div>`;}
function renderSource(source){if(!source)return '<p class="small muted">手动创建，或来源记录不存在。</p>';return `<div class="inline-source"><strong>${esc(source.name)}</strong> · ${esc(new Date(source.createdAt).toLocaleString('zh-CN'))}${source.demo?' · 演示数据':''}</div>${source.image&&/^data:image\/(png|jpeg|webp|gif);base64,/.test(source.image)?`<img class="source-image" src="${esc(source.image)}" alt="原始通知图片">`:''}${source.text?`<pre class="source-text">${esc(source.text)}</pre>`:''}`;}
function openTask(id,edit=false,day=''){
  currentTaskId=id||null;const task=state.tasks.find(t=>t.id===id);
  if(id&&!task){toast('任务已删除或不存在',true);return;}
  const t=task||D.cleanTask({title:'新任务',dueDate:day,deadlineKind:day?'date':'pending',executionStatus:'unsubmitted',checklist:[]});
  const dialog=$('#taskDialog');
  if(edit||!id){
    dialog.innerHTML=`<form id="taskForm"><div class="dialog-head"><h2>${id?'编辑任务':'新建任务'}</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="关闭">×</button></div><div class="dialog-body"><div class="form-grid">${inputField('title','任务标题',task?t.title:'','text',true)}${inputField('course','所属课程',t.course,'text',true)}${selectField('category','分类',D.categories,t.category)}${selectField('priority','优先级',['高','中','低'],t.priority)}${statusField(t.executionStatus)}${deadlineFields(t)}${inputField('startsAt','活动开始时间',t.startsAt,'datetime-local')}${inputField('dateText','原文日期描述',t.dateText,'text',true)}${inputField('location','活动地点',t.location,'text',true)}${textField('description','任务说明',t.description)}${textField('checklist','材料 / 准备清单（每行一项）',t.checklist.map(x=>x.text).join('\n'))}${inputField('estimatedHours','预计耗时（小时）',t.estimatedHours||'','number')}${inputField('availableHours','截止前剩余可用时间（小时）',t.availableHours??'','number')}${textField('notes','注意事项',t.notes)}${textField('uncertain','不确定信息（每行一项）',t.uncertain.join('\n'))}</div><label class="check-label"><input name="dateConfirmed" type="checkbox" ${t.dateConfirmed?'checked':''}>我已核实时间依据（缺少日期也可以保存）</label><p class="error" id="formError" role="alert"></p></div><div class="dialog-foot">${button('取消','close-dialog') }<button class="button primary" type="submit">保存任务</button></div></form>`;
    dialog.querySelector('#taskForm').onsubmit=async e=>{
      e.preventDefault();if(saveBusy)return;
      const f=new FormData(e.target),data=Object.fromEntries(f);
      data.checklist=String(data.checklist).split('\n').filter(x=>x.trim()).map(text=>t.checklist.find(old=>old.text===text.trim())||{id:D.uid(),text:text.trim(),done:false});
      data.uncertain=String(data.uncertain).split('\n').filter(x=>x.trim());data.dateConfirmed=f.has('dateConfirmed');
      if(data.dueAt!==t.dueAt&&data.dueAt)data.deadlineKind='datetime';else if(data.dueDate!==t.dueDate&&data.dueDate)data.deadlineKind='date';
      if(data.deadlineKind==='datetime'&&!data.dueAt||data.deadlineKind==='date'&&!data.dueDate)data.deadlineKind='pending';
      data.timeEvidence={...t.timeEvidence,raw:data.dateText,confirmed:data.dateConfirmed,method:'用户编辑并核对时间信息',verification:data.deadlineKind==='none'?'none':data.dateConfirmed?(data.deadlineKind==='date'?'date_only':'confirmed'):'pending'};
      if(data.dueAt!==t.dueAt||data.dueDate!==t.dueDate){data.timeEvidence.inferred=false;data.timeEvidence.yearInferred=false;data.timeEvidence.yearReference='';}
      let updated;try{updated=D.cleanTask({...t,...data,updatedAt:stamp()},{strict:true});}catch(error){$('#formError').textContent=error.message;return;}
      const ok=await mutate(next=>{
        if(id){const i=next.tasks.findIndex(x=>x.id===id);if(i<0)throw new Error('任务已删除');const before=next.tasks[i];next.history.unshift({id:D.uid(),taskId:id,kind:'manual',before:structuredClone(before),after:structuredClone(updated),at:stamp()});next.tasks[i]=updated;}
        else next.tasks.push(updated);
      },id?'任务已更新，日历与风险已同步':'新任务已保存');if(ok)dialog.close();
    };
  }else{
    const sources=[...new Set([task.sourceId,...task.sourceIds].filter(Boolean))].map(id=>state.sources.find(x=>x.id===id)).filter(Boolean);
    const history=state.history.filter(h=>h.taskId===id);
    dialog.innerHTML=`<div class="dialog-head"><div><h2>${esc(t.title)}</h2><div class="task-meta"><span>${esc(t.course||'课程未填写')}</span><span class="tag">${esc(t.category)}</span>${priorityTag(t)}<span class="tag ${T.completed(t)?'done':''}">${esc(T.statuses[t.executionStatus])}</span></div></div><button class="icon-button" data-action="close-dialog" aria-label="关闭">×</button></div><div class="dialog-body"><div class="form-grid"><div><strong class="small">截止信息</strong><p class="red">${esc(T.label(t))}</p></div><div><strong class="small">活动开始</strong><p>${esc(formatDate(t.startsAt))}</p></div><div><strong class="small">活动地点</strong><p>${esc(t.location||'未提供')}</p></div><div><strong class="small">执行状态原文</strong><p>${esc(t.statusText||T.statuses[t.executionStatus])}</p></div></div>${timeEvidenceHTML(t)}${t.description?`<h3 class="section-title">任务说明</h3><p class="small text-wrap">${esc(t.description)}</p>`:''}<h3 class="section-title">材料与准备清单 · ${D.progress(t)}%</h3><div class="progress-track"><span style="width:${D.progress(t)}%"></span></div><div class="checklist-live">${t.checklist.length?t.checklist.map(item=>`<label class="${item.done?'finished':''}"><input type="checkbox" data-check="${esc(item.id)}" data-task="${esc(t.id)}" ${item.done?'checked':''}>${esc(item.text)}</label>`).join(''):'<p class="small muted">尚无清单，可编辑任务添加。</p>'}</div>${t.notes?`<h3 class="section-title">注意事项</h3><p class="small text-wrap">${esc(t.notes)}</p>`:''}${t.uncertain.length?`<div class="notice warn">仍需确认：${t.uncertain.map(esc).join('；')}</div>`:''}<h3 class="section-title">来源与原文证据</h3><p class="small text-wrap">${esc(t.evidence||'未提供原文摘录')}</p>${sources.length?sources.map(renderSource).join(''):'<p class="small muted">手动创建的任务</p>'}<h3 class="section-title">历史修改记录</h3>${history.length?history.map(h=>`<details class="history-entry"><summary>${esc(new Date(h.at).toLocaleString('zh-CN'))} · ${h.kind==='notification'?'通知更新':'手动修改'}</summary>${D.differences(h.before,h.after).map(d=>`<p><strong>${fieldNames[d.key]}</strong>：${esc(diffValue(d.before))} → ${esc(diffValue(d.after))}</p>`).join('')||'<p>仅保存，内容未变化</p>'}</details>`).join(''):'<p class="small muted">尚未修改</p>'}</div><div class="dialog-foot">${button('删除任务','delete',`data-id="${esc(id)}"`,'danger')}${button(T.completed(t)?'恢复未提交':'标记完成','toggle',`data-id="${esc(id)}"`)}${button('编辑任务','edit',`data-id="${esc(id)}"`,'primary')}</div>`;
  }
  if(id&&!edit){window.DHPlannerUI?.detail(t,dialog);DHSimple.tidyDetail(t,dialog);}else DHSimple.tidyForm(dialog);
  if(!dialog.open)dialog.showModal();
}
function confirmAction(title,text){return new Promise(resolve=>{const dialog=$('#confirmDialog');dialog.innerHTML=`<div class="dialog-head"><h2>${esc(title)}</h2></div><div class="dialog-body"><p class="small">${esc(text)}</p></div><div class="dialog-foot"><button class="button" value="cancel">取消</button><button class="button primary" value="ok">确认</button></div>`;dialog.oncancel=()=>{resolve(false);};dialog.querySelectorAll('button').forEach(b=>b.onclick=()=>{dialog.close();resolve(b.value==='ok');});dialog.showModal();});}
async function toggleTask(id){const ok=await mutate(next=>{const t=next.tasks.find(x=>x.id===id);if(!t)throw new Error('任务不存在');t.executionStatus=T.completed(t)?'unsubmitted':'completed';t.status=t.executionStatus==='completed'?'done':'todo';t.updatedAt=stamp();},'任务状态已同步');if(ok&&$('#taskDialog').open)openTask(id);}
async function deleteTask(id){const t=state.tasks.find(x=>x.id===id);if(!t)return;if(!await confirmAction('删除任务？',`将删除“${t.title}”，任务将从日历、工作台及风险雷达移除。`))return;const ok=await mutate(next=>{next.tasks=next.tasks.filter(x=>x.id!==id);next.changes=next.changes.filter(x=>x.taskId!==id);next.history=next.history.filter(x=>x.taskId!==id);},'任务已删除');if(ok)$('#taskDialog').close();}
async function handleChange(id,accept){
  const c=state.changes.find(x=>x.id===id);if(!c||c.status!=='pending')return;
  if(accept&&!await confirmAction('确认应用通知变更？','新通知字段将更新到关联任务；材料中相同项目的勾选状态会保留，旧内容进入历史记录。'))return;
  await mutate(next=>{const proposal=next.changes.find(x=>x.id===id);if(accept)D.applyChange(next,proposal);else proposal.status='rejected';},accept?'变更已应用，日历与工作台已同步':'已拒绝变更，原任务保持不变');
}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
async function checkHealth(){const wake=setTimeout(()=>{$('#connection').textContent='服务正在唤醒，请稍候…';},5000);try{const response=await fetch('/api/health',{cache:'no-store',signal:AbortSignal.timeout(70000)});if(!response.ok)throw new Error();health=await response.json();if(!health.version?.startsWith('2.'))throw new Error();$('#connection').textContent=health.deepseekConfigured?'服务已连接 · DeepSeek已配置':'服务已连接 · 密钥待配置';$('#connection').classList.toggle('ok',health.deepseekConfigured);}catch{$('#connection').textContent=navigator.onLine?'服务未连接 · 本地可用':'离线模式 · 本地可用';health=null;}finally{clearTimeout(wake);}if(page==='settings')render();}
async function testAI(el){el.disabled=true;el.textContent='正在发送测试请求…';try{const response=await fetch('/api/test-connection',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),payload=await response.json();if(!response.ok)throw new Error(payload.error);toast(payload.message);}catch(error){toast(error.message||'连接失败',true);}finally{el.disabled=false;el.textContent='实际连接测试';}}
async function importBackup(file){if(!file)return;try{if(file.size>150*1024*1024)throw new Error('备份超过150 MB');const next=D.validateBackup(JSON.parse(await file.text()));if(!await confirmAction('恢复此备份？',`将使用备份中的 ${next.tasks.length} 项任务替换当前全部数据。建议先导出当前备份。`))return;await mutate(s=>{Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,next);},'备份已恢复');}catch(error){toast(error.message||'备份读取失败',true);}finally{$('#importFile').value='';}}
async function loadDemo(){
  if(state.tasks.some(x=>x.demo)){toast('演示数据已存在，可先清除后重新加载');return;}
  const at=hours=>T.local(Date.now()+hours*3600000);
  await mutate(next=>{
    const source={id:D.uid(),kind:'text',name:'校园演示通知（非真实AI识别）',text:'【演示通知】大学物理实验报告、AI校园应用竞赛与课程考试安排。日期随加载时间生成，仅用于功能演示。',image:'',demo:true,createdAt:stamp()};next.sources.unshift(source);
    const tasks=[
      {title:'大学物理实验报告提交',category:'实验报告',dueAt:at(18),priority:'高',checklist:['补全实验数据','导出PDF报告','课程平台提交'],estimatedHours:4,availableHours:2},
      {title:'AI校园应用竞赛 · 作品提交',category:'竞赛活动',dueAt:at(48),priority:'高',checklist:['设计说明文档','完整源码ZIP','演示视频']},
      {title:'AI校园应用竞赛 · 完成报名',category:'竞赛活动',dueAt:at(-24),priority:'中',checklist:['填写团队信息']},
      {title:'高等数学课程复习',category:'考试安排',startsAt:at(120),priority:'中',checklist:['整理错题','完成模拟练习']},
      {title:'选修课学习总结',category:'课程学习',dueAt:at(48),priority:'低',status:'done',checklist:[]}
    ].map(x=>D.cleanTask({...x,demo:true,dateConfirmed:true,sourceId:source.id,sourceIds:[source.id],description:'可清除的演示任务；不代表真实AI测试。',evidence:'功能演示数据'}));
    next.tasks.push(...tasks);
    const project=tasks[1],P=DHPlanner;project.plan=P.generate({task:project,items:P.makeItems({stageNames:['核对作品要求','实现核心功能','检查并准备交付']}),rules:{startDate:T.today(),endDate:project.dueAt.slice(0,10),bufferDays:0,excludedWeekdays:[],maxPerDay:3}}).plan;project.plan.confirmed=true;
    const before=tasks[0],proposed=D.cleanTask({...before,dueAt:at(66),notes:'演示：教师将实验报告提交时间延期。'});
    const updateSource={id:D.uid(),kind:'text',name:'演示·实验报告延期通知',text:`【演示新通知】大学物理实验报告提交时间调整至 ${formatDate(proposed.dueAt)}，其他要求不变。`,image:'',demo:true,createdAt:stamp()};next.sources.unshift(updateSource);
    next.changes.push({id:D.uid(),taskId:before.id,sourceId:updateSource.id,baseUpdatedAt:before.updatedAt,before:structuredClone(before),proposed,status:'pending',createdAt:stamp()});
  },'演示数据已载入，均已明确标记');
}
async function dailyAction(id,kind,step){
 const original=state.tasks.find(t=>t.id===id);if(!original)return;
 if(kind==='submit'&&!await confirmAction('确认已提交？','只在你已将成果交到要求的平台后确认。'))return;
 await mutate(next=>{const t=next.tasks.find(x=>x.id===id);if(!t||JSON.stringify(t)!==JSON.stringify(original))throw Error('任务已更新，请重新操作。');const before=structuredClone(t);
  if(kind==='focus'){if(t.plan)throw Error('已有计划，请在安排详情修改日期。');t.focusDate=T.today();}
  if(kind==='finish'&&!t.plan)DHWorkbench.finish(t);
  if(kind==='step'){const item=t.plan?.items.find(x=>x.id===step);if(!item)throw Error('该步骤已改变。');item.done=true;item.completedAt=stamp();}
  if(kind==='submit'){t.executionStatus='submitted';t.status='todo';}
  t.updatedAt=stamp();next.history.unshift({id:D.uid(),taskId:id,kind:'manual',before,after:structuredClone(t),at:stamp()});
 },kind==='focus'?'已安排在今天':kind==='submit'?'已标记提交，停止提交催办':'已记录完成；需要提交的任务会继续显示待提交');
}
document.addEventListener('click',async e=>{
  if(e.target.closest('#sidebar a'))menuOpen(false);
  const target=e.target.closest('[data-action]');if(!target||target.disabled)return;const action=target.dataset.action,id=target.dataset.id;
  if(busy&&['add-draft','add-all','compare-draft','discard-draft'].includes(action)){toast('正在识别，请等本次结果返回后再操作事项');return;}
  if(page==='capture'&&!['analyze'].includes(action))syncDrafts();
  if(pages[action]){route(action);return;}
  switch(action){
    case 'guide':menuOpen(false);DHSimple.guide();break;
    case 'menu':menuOpen(!$('#sidebar').classList.contains('open'));break;
    case 'close-menu':menuOpen(false);break;
    case 'next-image':if(!busy&&imageQueue.length&&(!capture.drafts.length||await confirmAction('切换到下一张？','尚未保存的候选事项会清除，请先保存需要的事项。'))){await chooseImage(imageQueue.shift());await analyze();}break;
    case 'clear-queue':imageQueue=[];render();break;
    case 'theme':await mutate(s=>s.theme=s.theme==='dark'?'light':'dark');break;
    case 'new':DHQuickAdd.open();break;
    case 'home-filter':DHSimple.setHomeFilter(target.dataset.filter);render();break;
    case 'load-day':selectedDay=target.dataset.day;calendarMonth=new Date(selectedDay+'T12:00');calendarMonth.setDate(1);route('calendar');break;
    case 'focus-today':await dailyAction(id,'focus');break;
    case 'work-finish':await dailyAction(id,'finish');break;
    case 'step-finish':await dailyAction(id,'step',target.dataset.step);break;
    case 'mark-submitted':await dailyAction(id,'submit');break;
    case 'new-day':openTask(null,true,selectedDay);break;
    case 'detail':openTask(id);break;
    case 'edit':openTask(id,true);break;
    case 'close-dialog':$('#taskDialog').close();break;
    case 'delete':await deleteTask(id);break;
    case 'toggle':await toggleTask(id);break;
    case 'replace-image':$('#imageFile').click();break;
    case 'remove-image':if(!busy){capture.file=null;capture.image='';render();}break;
    case 'analyze':await analyze();break;
    case 'review-time':await reviewTime();break;
    case 'review-saved':await reviewSavedTimes([id]);break;
    case 'review-saved-all':await reviewSavedTimes(state.tasks.filter(t=>T.actionable(t)&&TimeReview.needs(t)).map(t=>t.id));break;
    case 'review-one':await reviewTime([id]);break;
    case 'discard-draft':capture.drafts=capture.drafts.filter(t=>t.id!==id);render();break;
    case 'add-draft':await addDraft([id]);break;
    case 'add-all':await addDraft(capture.drafts.map(t=>t.id));break;
    case 'compare-draft':await compareDraft(id);break;
    case 'prev-month':calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);render();break;
    case 'next-month':calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);render();break;
    case 'today':calendarMonth=new Date(T.today()+'T12:00');calendarMonth.setDate(1);selectedDay=T.today();render();break;
    case 'select-day':selectedDay=target.dataset.day;render();break;
    case 'ics':download('Deadline-Hunter.ics',D.ics(state.tasks),'text/calendar;charset=utf-8');toast('已导出日历；未填写完整日期的任务不会导出');break;
    case 'accept-change':await handleChange(id,true);break;
    case 'reject-change':await handleChange(id,false);break;
    case 'test-ai':await testAI(target);break;
    case 'export':{const body=JSON.stringify(state,null,2),bytes=new Blob([body]).size;if(bytes>5*1024*1024&&!await confirmAction('备份包含原图',`备份约${(bytes/1024/1024).toFixed(1)} MB，包含图片与原文。确认继续导出？`))break;download('Deadline-Hunter-Backup.json',body,'application/json');toast('已导出备份，请妥善保存通知原文');break;}
    case 'import':$('#importFile').click();break;
    case 'demo':await loadDemo();break;
    case 'clear-demo':if(await confirmAction('清空演示数据？','只清除标注为演示的任务、通知、变更与关联历史。'))await mutate(next=>{const ids=new Set(next.tasks.filter(t=>t.demo).map(t=>t.id));next.tasks=next.tasks.filter(t=>!t.demo);next.sources=next.sources.filter(s=>!s.demo);next.changes=next.changes.filter(c=>!ids.has(c.taskId));next.history=next.history.filter(h=>!ids.has(h.taskId));},'演示数据已清除');break;
    case 'clear-all':if(await confirmAction('清空全部本地数据？','任务、通知证据、变更记录与历史都将删除。此操作不可撤销，请先导出备份。'))await mutate(next=>{next.tasks=[];next.sources=[];next.changes=[];next.history=[];},'本地数据已清空');break;
  }
});
document.addEventListener('change',async e=>{
  if(e.target.matches('[data-check]')){const ok=await mutate(next=>{const t=next.tasks.find(t=>t.id===e.target.dataset.task);t.checklist.find(x=>x.id===e.target.dataset.check).done=e.target.checked;t.updatedAt=stamp();},'准备进度已保存');if(ok)openTask(currentTaskId);else e.target.checked=!e.target.checked;}
  if(e.target.id==='statusFilter'){filter.status=e.target.value;render();}
  if(e.target.id==='categoryFilter'){filter.category=e.target.value;render();}
  if(e.target.id==='sortFilter'){filter.sort=e.target.value;render();}
  if(e.target.id==='importFile')await importBackup(e.target.files[0]);
});
document.addEventListener('input',e=>{if(e.target.id==='taskSearch'){const pos=e.target.selectionStart;filter.search=e.target.value;render();$('#taskSearch').focus();$('#taskSearch').setSelectionRange(pos,pos);}});
window.addEventListener('hashchange',()=>{routeRevision++;closeDialogs();syncDrafts();page=pages[location.hash.slice(1)]?location.hash.slice(1):'dashboard';menuOpen(false);render();window.scrollTo(0,0);});
window.addEventListener('dragover',e=>{e.preventDefault();});window.addEventListener('drop',e=>e.preventDefault());
setInterval(()=>{if(state&&['dashboard','radar'].includes(page)&&!saveBusy&&!$('#taskDialog').open)render();},60000);
setInterval(()=>{if(state)window.DHPush?.sync(state.tasks);},60000);
(async()=>{try{state=await CampusStore.read();page=pages[location.hash.slice(1)]?location.hash.slice(1):'dashboard';render();await checkHealth();}catch(error){app.innerHTML=`<section class="panel"><h1>本地工作空间无法打开</h1><p class="error">${esc(error.message)}</p><p>请通过 start.bat 启动，并使用支持IndexedDB的浏览器普通窗口。</p></section>`;}})();
