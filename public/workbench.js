(function(root){
 'use strict';
 const T=typeof module!=='undefined'&&module.exports?require('./time'):root.DHTime;
 const P=typeof module!=='undefined'&&module.exports?require('./planner'):root.DHPlanner;
 function workDone(t){return t.plan?P.summary(t).complete:t.workCompleted===true;}
 function pendingSubmission(t){return T.actionable(t)&&workDone(t);}
 function needsSubmission(t){return ['作业提交','实验报告'].includes(t.category)||/提交|上传|上交|交付|报告/.test(t.title+' '+t.description);}
 function kind(t){const text=t.title+' '+t.description;if(/考试|复习|背诵|阅读.*(?:章|篇)/.test(text))return 'study';if(/项目|竞赛|比赛|开发|答辩/.test(text))return 'project';if(t.category==='实验报告'||P.suggestion(t)?.total>1)return 'stages';return 'simple';}
 function finish(t){t.workCompleted=true;if(!needsSubmission(t)){t.executionStatus='completed';t.status='done';}}
 function dayLoad(tasks,state={},today=T.today(),days=7){
  const prefs=state.advisorPreferences||{},capacity=Number(prefs.dailyMinutes)>0?Number(prefs.dailyMinutes):null,off=state.plannerPreferences?.excludedWeekdays||[];
  return Array.from({length:days},(_,i)=>{const date=P.add(today,i);let minutes=0,unknown=0,actions=0;
   for(const t of tasks.filter(T.actionable)){
    if(workDone(t))continue;
    if(t.plan){for(const item of t.plan.items.filter(x=>!x.done&&x.date===date)){actions++;if(item.minutes>0)minutes+=item.minutes;else unknown++;}}
    else if(t.focusDate===date){actions++;if(t.estimatedHours>0)minutes+=Math.round(t.estimatedHours*60);else unknown++;}
   }
   const due=tasks.filter(t=>T.actionable(t)&&(t.dueAt||t.dueDate||'').slice(0,10)===date),limit=capacity===null?null:off.includes(P.weekday(date))?0:capacity;
   return {date,minutes,unknown,actions,due:due.length,unverified:due.filter(t=>!t.dateConfirmed).length,capacity:limit,overload:limit!==null&&minutes>limit};
  });
 }
 function overview(tasks,state={},today=T.today()){
  const active=tasks.filter(T.actionable),pending=active.filter(pendingSubmission),todayItems=[],backlog=[];
  for(const t of active.filter(t=>!workDone(t))){
   if(t.plan){for(const item of t.plan.items.filter(x=>!x.done&&x.date)){const value={task:t,item,minutes:item.minutes||0};if(item.date===today)todayItems.push(value);else if(item.date<today)backlog.push(value);}}
   else if(t.focusDate){const value={task:t,item:null,minutes:Math.round(t.estimatedHours*60)||0};if(t.focusDate===today)todayItems.push(value);else if(t.focusDate<today)backlog.push(value);}
  }
  const end=P.add(today,6),week=active.filter(t=>{const d=(t.dueAt||t.dueDate||'').slice(0,10);return d&&d>=today&&d<=end;});
  const urgent=active.filter(t=>{const d=(t.dueAt||t.dueDate||'').slice(0,10);return d&&d<=end&&!pendingSubmission(t);}).sort((a,b)=>(a.dueAt||a.dueDate).localeCompare(b.dueAt||b.dueDate));
  return {active,pending,todayItems,backlog,week,urgent,later:active.filter(t=>!urgent.includes(t)&&!pending.includes(t)&&!todayItems.some(x=>x.task.id===t.id)&&!backlog.some(x=>x.task.id===t.id)),load:dayLoad(tasks,state,today),minutes:todayItems.reduce((n,x)=>n+x.minutes,0),unknown:todayItems.filter(x=>!x.minutes).length};
 }
 const api={workDone,pendingSubmission,needsSubmission,finish,kind,dayLoad,overview};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DHWorkbench=api;
})(globalThis);
