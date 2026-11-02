(function (root) {
  'use strict';
  const T=typeof module!=='undefined'&&module.exports?require('./time'):root.DHTime;
  const P=typeof module!=='undefined'&&module.exports?require('./planner'):root.DHPlanner;
  const categories = ['课程学习', '作业提交', '实验报告', '考试安排', '竞赛活动', '校园事务', '其他'];
  const uid = () => globalThis.crypto.randomUUID();
  const pad = n => String(n).padStart(2, '0');
  function dayKey(value = new Date()) {
    const d = value instanceof Date ? value : new Date(value);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function validDate(value) {
    return T.valid(value);
  }
  function cleanTask(value, { strict = false } = {}) {
    if (!value || typeof value !== 'object') throw new Error('任务格式无效');
    const title = String(value.title || '').trim().slice(0, 150);
    if (!title) throw new Error('请填写任务标题');
    const dueAt = validDate(value.dueAt);
    const startsAt = validDate(value.startsAt);
    const dueDate=T.dateOnly(value.dueDate)||'';
    if(strict&&value.dueDate&&!dueDate)throw new Error('仅日期字段无效');
    const deadlineKind=['datetime','date','pending','none'].includes(value.deadlineKind)?value.deadlineKind:dueAt?'datetime':dueDate?'date':startsAt?'none':'pending';
    const executionStatus=T.status(value.executionStatus||value.statusText||value.status,value.status);
    const rawTime=value.timeEvidence&&typeof value.timeEvidence==='object'?value.timeEvidence:{};
    const timeEvidence={raw:String(rawTime.raw??value.dateText??'').slice(0,1000),type:Object.hasOwn(T.types,rawTime.type)?rawTime.type:T.classify(String(value.dateText||''),value),timezone:T.ZONE,
      baseAt:T.valid(rawTime.baseAt)||'',baseSource:String(rawTime.baseSource||'未提供可靠截图时间').slice(0,200),method:String(rawTime.method||'原文提取，待人工核实').slice(0,1000),
      inferred:rawTime.inferred===true,yearInferred:rawTime.yearInferred===true,yearReference:T.dateOnly(rawTime.yearReference)||'',sourceSpan:String(rawTime.sourceSpan||value.dateText||'').slice(0,1000),precision:String(rawTime.precision||'未知').slice(0,200),confirmed:rawTime.confirmed===true||value.dateConfirmed===true,
      verification:['pending','estimated','confirmed','date_only','none'].includes(rawTime.verification)?rawTime.verification:(value.dateConfirmed?'confirmed':'pending')};
    // 只在有实际日期且经过用户确认时修正显示，不把无日期事项冒充精确时间。
    if(timeEvidence.confirmed&&(deadlineKind==='datetime'&&dueAt||deadlineKind==='date'&&dueDate)){
      if(['pending','estimated'].includes(timeEvidence.verification))timeEvidence.verification=deadlineKind==='date'?'date_only':'confirmed';
      if(!timeEvidence.raw.trim()){timeEvidence.type='manual';timeEvidence.method='用户直接填写并确认（无原文时间依据）';}
      else if(timeEvidence.method==='原文提取，待人工核实')timeEvidence.method='原文提取，用户已核对';
      if(timeEvidence.precision==='未知')timeEvidence.precision=deadlineKind==='date'?'仅日期':'分钟';
    }
    if (strict && value.dueAt && !dueAt) throw new Error('截止日期无效');
    if (strict && value.startsAt && !startsAt) throw new Error('开始日期无效');
    const checklist = Array.isArray(value.checklist) ? value.checklist.slice(0, 40).map(item => ({
      id: typeof item?.id === 'string' ? item.id : uid(),
      text: String(typeof item === 'string' ? item : item?.text || '').trim().slice(0, 300),
      done: typeof item === 'object' && item?.done === true
    })).filter(x => x.text) : [];
    const uncertain = Array.isArray(value.uncertain) ? value.uncertain.map(String).slice(0, 15) : [];
    if (value.dueAt && !dueAt) uncertain.push('AI 返回的截止日期无效，需人工确认');
    if (value.startsAt && !startsAt) uncertain.push('AI 返回的开始日期无效，需人工确认');
    return {
      id: typeof value.id === 'string' ? value.id : uid(), title,
      description: String(value.description || '').slice(0, 4000), dueAt:deadlineKind==='datetime'?dueAt:'', startsAt,
      dueDate:deadlineKind==='date'?dueDate:'',deadlineKind,timezone:T.ZONE,timeEvidence,executionStatus,course:String(value.course||'').slice(0,200),statusText:String(value.statusText||'').slice(0,100),
      dateText: String(value.dateText || '').slice(0, 500),
      location: String(value.location || '').slice(0, 300),
      category: categories.includes(value.category) ? value.category : '其他',
      priority: ['高', '中', '低'].includes(value.priority) ? value.priority : '中',
      status: executionStatus==='completed'?'done':'todo', checklist,workCompleted:value.workCompleted===true,focusDate:T.dateOnly(value.focusDate)||'',
      plan:P.clean(value.plan,{strict}),planSuggestion:P.suggestion({planSuggestion:value.planSuggestion,title,description:value.description,evidence:value.evidence}),
      notes: String(value.notes || '').slice(0, 2000), evidence: String(value.evidence || '').slice(0, 2000),
      uncertain,aiNotes:Array.isArray(value.aiNotes)?value.aiNotes.map(x=>String(x).slice(0,500)).slice(0,15):[], dateConfirmed: timeEvidence.confirmed,
      estimatedHours: Math.max(0, Math.min(1000, Number(value.estimatedHours) || 0)),
      availableHours: value.availableHours === '' || value.availableHours == null ? null : Math.max(0, Math.min(1000, Number(value.availableHours) || 0)),
      sourceId: typeof value.sourceId === 'string' ? value.sourceId : '',
      sourceIds: Array.isArray(value.sourceIds) ? value.sourceIds.filter(x => typeof x === 'string') : [],
      demo: value.demo === true,
      createdAt: validTimestamp(value.createdAt), updatedAt: validTimestamp(value.updatedAt)
    };
  }
  function validTimestamp(value) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : new Date().toISOString(); }
  function progress(task) { return task.checklist.length ? Math.round(task.checklist.filter(x => x.done).length / task.checklist.length * 100) : 0; }
  function statistics(tasks, now = new Date()) {
    const today = T.today(now.getTime()), end=now.getTime()+7*86400000;
    const open = tasks.filter(T.actionable);
    return {
      today: open.filter(t => (t.dueAt||t.dueDate||'').slice(0,10)===today).length,
      week: open.filter(t => t.dueAt ? T.epoch(t.dueAt)>=now.getTime()&&T.epoch(t.dueAt)<=end : t.dueDate>=today&&t.dueDate<=T.today(end)).length,
      soon: open.filter(t => t.dueAt&&t.dateConfirmed&&T.epoch(t.dueAt)>=now.getTime()&&T.epoch(t.dueAt)-now.getTime()<=72*3600000).length,
      done: tasks.filter(T.completed).length,
      total: tasks.length
    };
  }
  function risks(tasks, now = new Date()) {
    const open = tasks.filter(T.actionable);
    const dates = new Map();
    for (const t of open) if (t.dueAt||t.dueDate) {const key=(t.dueAt||t.dueDate).slice(0,10);dates.set(key,(dates.get(key)||0)+1);}
    return open.map(task => {
      const reasons = [], suggestions = []; let severity = 0;
      if(task.executionStatus==='overdue'){severity=4;reasons.push('原始平台状态为已逾期，请核对最新状态');suggestions.push('查看平台能否补交，必要时联系教师');}
      const hours = task.dueAt&&task.dateConfirmed ? (T.epoch(task.dueAt) - now.getTime()) / 3600000 : null;
      if (hours !== null && hours < 0) { severity = 4; reasons.push('已过期，尚未完成'); suggestions.push('确认是否仍可补交，并联系负责人'); }
      else if (hours !== null && hours <= 24) { severity = 3; reasons.push('24 小时内截止'); suggestions.push('优先完成并预留提交缓冲时间'); }
      else if (hours !== null && hours <= 72) { severity = 2; reasons.push('3 天内截止'); suggestions.push('现在安排准备与检查时间'); }
      const day=(task.dueAt||task.dueDate||'').slice(0,10);
      if(day&&dates.get(day)>=2){severity=Math.max(severity,2);reasons.push(`同一天有 ${dates.get(day)} 项任务集中截止（未核实日期不代表精确时间）`);suggestions.push('核对日期并拆分工作量，提前完成其中一项');}
      if(task.dueDate){severity=Math.max(severity,1);reasons.push(`${task.dueDate} 仅有日期，不计算小时级倒计时`);suggestions.push('核实具体截止时刻；不自动设为23:59');}
      const missing = task.checklist.filter(x => !x.done).length;
      if (missing) { severity = Math.max(severity, 1); reasons.push(`还有 ${missing} 项材料或准备工作未完成`); suggestions.push('先完成清单中影响提交的材料'); }
      if (task.estimatedHours > 0 && task.availableHours !== null && task.estimatedHours > task.availableHours) {
        severity = Math.max(severity, 3); reasons.push(`预计需 ${task.estimatedHours} 小时，剩余可用 ${task.availableHours} 小时`); suggestions.push('缩小范围、请求协作或调整可用时间');
      }
      if(task.deadlineKind!=='none'&&(!(task.dueAt||task.dueDate||task.startsAt)||!task.dateConfirmed)){severity=Math.max(severity,1);reasons.push(task.timeEvidence?.inferred?'截止时间为推算值，尚未核实':'日期尚未人工确认');suggestions.push('核对时间依据；核实前不触发小时级逾期提醒');}
      if(task.executionStatus==='unknown'){severity=Math.max(severity,1);reasons.push('任务执行状态未知');suggestions.push('确认是否已提交或已完成');}
      const plan=P.summary(task,T.today(now.getTime()));
      if(plan?.overdue){severity=Math.max(severity,2);reasons.push(`个人执行计划有${plan.overdue}项安排已过日但未完成（不等同于通知已逾期）`);suggestions.push('核对实际进度，并按个人习惯重新安排剩余计划');}
      if(plan?.changed){severity=Math.max(severity,1);reasons.push('截止信息已变化，原执行计划需要重新核对');suggestions.push('预览并确认剩余计划，不自动覆盖已完成部分');}
      return { task, severity, reasons, suggestions: [...new Set(suggestions)] };
    }).filter(x => x.severity).sort((a,b) => b.severity - a.severity || (a.task.dueAt || '9999').localeCompare(b.task.dueAt || '9999'));
  }
  const trackedFields = ['title','course','executionStatus','description','dueAt','dueDate','deadlineKind','timeEvidence','startsAt','dateText','location','priority','category','notes','evidence','uncertain','checklist','dateConfirmed','plan'];
  function differences(before, after) {
    return trackedFields.filter(key => {
      if (key === 'checklist') return JSON.stringify(before[key].map(x => x.text)) !== JSON.stringify(after[key].map(x => x.text));
      return JSON.stringify(before[key]??'') !== JSON.stringify(after[key]??'');
    }).map(key => ({ key, before: structuredClone(before[key]??''), after: structuredClone(after[key]??'') }));
  }
  function similarity(a,b) {
    const compact = text => String(text).toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
    a = compact(a); b = compact(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const grams = s => new Set([...s].slice(0,-1).map((_,i)=>s.slice(i,i+2)));
    const x = grams(a), y = grams(b);
    if (!x.size || !y.size) return 0;
    return 2 * [...x].filter(g=>y.has(g)).length / (x.size+y.size);
  }
  function candidates(task, tasks, sources=[], history=[]) {
    return tasks.map(old=>{
      const titleScore=Math.max(similarity(task.title,old.title),...history.filter(h=>h.taskId===old.id).map(h=>similarity(task.title,h.before.title)));
      const courseScore=task.course&&old.course?similarity(task.course,old.course):0;
      const dateMatch=!!(task.dueAt||task.dueDate)&&(task.dueAt||task.dueDate)===(old.dueAt||old.dueDate);
      const chapterA=task.title.match(/第([一二三四五六七八九十百\d]+)章/),chapterB=old.title.match(/第([一二三四五六七八九十百\d]+)章/);
      const eligible=titleScore>=.7&&!(chapterA&&chapterB&&chapterA[1]!==chapterB[1]);
      const source=sources.find(s=>s.id===old.sourceId),sameSource=!!task.sourceFingerprint&&task.sourceFingerprint===source?.fingerprint;
      const score=Math.min(1,Math.max(0,.6*titleScore+(task.title===old.title?.trim()? .1:0)+.15*courseScore+.1*Number(dateMatch)+.05*similarity(task.evidence,old.evidence)+.07*Number(sameSource)+.03*Number(task.executionStatus===old.executionStatus)-(task.course&&old.course&&courseScore<.15?.35:0)));
      return {task:old,score,eligible,reasons:[`标题 ${Math.round(titleScore*100)}%`,...(task.course&&old.course?[`课程 ${Math.round(courseScore*100)}%`]:[]),...(dateMatch?['截止时间一致']:[]),...(sameSource?['原始通知一致']:[]),...(task.executionStatus===old.executionStatus?['状态一致']:[])]};
    }).filter(x=>x.eligible&&x.score>=.4).sort((a,b)=>b.score-a.score).slice(0,4);
  }
  function applyChange(state, proposal) {
    const index = state.tasks.findIndex(t=>t.id===proposal.taskId);
    if (index < 0) throw new Error('关联任务已删除');
    const before = state.tasks[index];
    if (before.updatedAt !== proposal.baseUpdatedAt) throw new Error('任务已修改，请重新比较后再确认');
    const after = cleanTask({ ...before, ...proposal.proposed, id:before.id,
      plan:before.plan,workCompleted:before.workCompleted,focusDate:before.focusDate,planSuggestion:proposal.proposed.planSuggestion||before.planSuggestion,
      createdAt:before.createdAt, updatedAt:new Date().toISOString(),
      checklist: proposal.proposed.checklist.map(item=>{ const old=before.checklist.find(x=>x.text===item.text); return old || item; }),
      sourceId:before.sourceId || proposal.sourceId,
      sourceIds:[...new Set([...before.sourceIds,before.sourceId,proposal.sourceId].filter(Boolean))]
    });
    state.history.unshift({id:uid(),taskId:before.id,kind:'notification',before,after,at:new Date().toISOString(),sourceId:proposal.sourceId});
    state.tasks[index]=after; proposal.status='accepted';
    return after;
  }
  function ics(tasks) {
    const escape = s => String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
    const utc = date => (date instanceof Date?date:new Date(T.epoch(date))).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Roadside Team//Deadline Hunter 2.0//ZH','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
    for (const t of tasks.filter(x=>x.dueAt || x.dueDate || x.startsAt)) {
      lines.push('BEGIN:VEVENT',`UID:${t.id}@deadline-hunter.local`,`DTSTAMP:${utc(new Date())}`,
        t.dueDate?`DTSTART;VALUE=DATE:${t.dueDate.replace(/-/g,'')}`:`DTSTART:${utc(t.dueAt || t.startsAt)}`,`SUMMARY:${escape((!t.dateConfirmed?'[待核实] ':'')+t.title)}`,
        `STATUS:${t.dateConfirmed?'CONFIRMED':'TENTATIVE'}`,
        `DESCRIPTION:${escape(`${t.description}\n${t.notes}\n截止依据：${T.label(t)}\n原文：${t.dateText}\n材料：${t.checklist.map(x=>x.text).join('、')}`)}`,
        `LOCATION:${escape(t.location)}`,'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    const encoder=new TextEncoder();
    return lines.flatMap(line=>{
      const folded=[]; let part=''; let limit=75;
      for(const ch of line) { if(encoder.encode(part+ch).length>limit) { folded.push(part); part=' '+ch; limit=75; } else part+=ch; }
      folded.push(part); return folded;
    }).join('\r\n')+'\r\n';
  }
  function validateBackup(data) {
    if (!data || data.version!==2 || !Array.isArray(data.tasks) || !Array.isArray(data.sources) || !Array.isArray(data.changes) || !Array.isArray(data.history)) throw new Error('不是有效的 V2 备份文件');
    if (data.tasks.length > 5000 || data.sources.length>5000) throw new Error('备份条目过多');
    const state=structuredClone(data);
    const ids=new Set();
    state.tasks=state.tasks.map(t=>{const clean=cleanTask(t,{strict:true}); if(ids.has(clean.id))throw new Error('备份存在重复任务 ID'); ids.add(clean.id);return clean;});
    if(state.sources.some(s=>!s || typeof s.id!=='string' || typeof s.text!=='string' || (s.image && !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s.image))))throw new Error('备份通知来源无效');
    if(state.changes.some(c=>!c || typeof c.id!=='string' || !['pending','accepted','rejected'].includes(c.status) || !c.proposed || typeof c.taskId!=='string'))throw new Error('备份变更记录无效');
    if(state.history.some(h=>!h || typeof h.id!=='string' || typeof h.taskId!=='string' || !h.before || !h.after))throw new Error('备份历史记录无效');
    for(const c of state.changes) c.proposed=cleanTask(c.proposed,{strict:true});
    for(const h of state.history) {h.before=cleanTask(h.before,{strict:true});h.after=cleanTask(h.after,{strict:true});}
    return state;
  }
  function radarGroups(tasks,today=T.today()){
    const groups=[[],[],[],[]],nearEnd=P.add(today,3);
    for(const task of tasks.filter(T.actionable)){
      const date=(task.dueAt||task.dueDate||'').slice(0,10),near=!!date&&date<=nearEnd,missing=task.checklist.filter(x=>!x.done).length;
      groups[(near?0:2)+(missing>=2?0:1)].push(task);
    }
    return groups;
  }
  function deadlineHeatmap(tasks,today=T.today()){
    const end=T.dateOnly(today)||T.today(),counts=new Map();
    for(const task of tasks){const date=(task.dueAt||task.dueDate||'').slice(0,10);if(!date)continue;const c=counts.get(date)||{count:0,unverified:0};c.count++;if(!task.dateConfirmed)c.unverified++;counts.set(date,c);}
    return Array.from({length:126},(_,i)=>{const date=P.add(end,i-125);return {date,...(counts.get(date)||{count:0,unverified:0})};});
  }
  const api={categories,uid,dayKey,validDate,cleanTask,progress,statistics,risks,differences,candidates,applyChange,ics,validateBackup,radarGroups,deadlineHeatmap};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  else root.DH=api;
})(globalThis);
