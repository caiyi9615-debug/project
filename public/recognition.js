(function(root){
  'use strict';
  const normal=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
  function splitText(text,limit=3500){
    if(typeof text!=='string')throw new TypeError('通知文字格式无效');
    if(text.length>20000)throw new RangeError('通知文字超过20000字，请先缩短通知');
    if(!Number.isInteger(limit)||limit<1||limit>20000)throw new RangeError('分段长度无效');
    const chunks=[];let current='';
    function flush(){if(current.trim())chunks.push(current.trim());current='';}
    function append(piece){if(current.length+piece.length>limit)flush();current+=piece;}
    for(const line of text.match(/[^\n]*\n|[^\n]+$/g)||[]){
      if(line.length<=limit){append(line);continue;}
      // Prefer paragraph/line boundaries, then sentence endings. A single long
      // sentence still needs a bounded slice so the retry cannot repeat truncation.
      for(const sentence of line.match(/[^。！？!?；;]*[。！？!?；;]+|[^。！？!?；;]+$/gu)||[]){
        let start=0;
        while(sentence.length-start>limit){
          let end=start+limit;
          if(/[\uD800-\uDBFF]/.test(sentence[end-1])&&/[\uDC00-\uDFFF]/.test(sentence[end]))end--;
          if(end===start)throw new RangeError('分段长度不足以容纳完整字符');
          append(sentence.slice(start,end));flush();start=end;
        }
        if(start<sentence.length)append(sentence.slice(start));
      }
    }
    flush();return chunks;
  }
  function unique(values){
    const seen=new Set();
    return values.filter(value=>{
      if(typeof value!=='string'||!value.trim())return false;
      const key=normal(value);if(seen.has(key))return false;seen.add(key);return true;
    });
  }
  function mergeTasks(tasks){
    if(!Array.isArray(tasks))throw new TypeError('识别任务格式无效');
    const result=[],groups=new Map();
    for(const original of tasks){
      const task=structuredClone(original);
      if(!task||typeof task!=='object')throw new TypeError('识别任务格式无效');
      const title=normal(task.title);
      // Without a known date, keep distinct raw time descriptions separate rather
      // than collapsing two ambiguous deadlines into one confident-looking task.
      const rawTime=task.dueAt||task.dueDate||task.startsAt?'':normal(task.dateText||task.timeEvidence?.raw);
      const key=JSON.stringify([title,normal(task.course),task.deadlineKind||'',task.dueAt||'',task.dueDate||'',task.startsAt||'',task.executionStatus||'',rawTime]);
      const candidates=groups.get(key)||[];
      const compatible=(a,b)=>!normal(a)||!normal(b)||normal(a)===normal(b);
      const previous=title&&candidates.find(candidate=>compatible(candidate.description,task.description)&&compatible(candidate.location,task.location));
      if(!previous){result.push(task);candidates.push(task);groups.set(key,candidates);continue;}
      previous.description=previous.description||task.description||'';
      previous.location=previous.location||task.location||'';
      for(const field of ['uncertain','aiNotes','sourceIds'])previous[field]=unique([...(previous[field]||[]),...(task[field]||[])]);
      for(const field of ['evidence','notes'])previous[field]=unique([previous[field]||'',task[field]||'']).join('\n');
      const items=new Map();
      for(const item of [...(previous.checklist||[]),...(task.checklist||[])]){
        const text=typeof item==='string'?item:item?.text,key=normal(text);
        if(!key)continue;
        if(items.has(key)){
          const kept=items.get(key);kept.done=kept.done===true||item?.done===true;
        }else items.set(key,typeof item==='string'?{text:item,done:false}:structuredClone(item));
      }
      previous.checklist=[...items.values()];
      // A duplicate from another segment must not erase the less certain result.
      previous.dateConfirmed=previous.dateConfirmed===true&&task.dateConfirmed===true;
      if(previous.timeEvidence||task.timeEvidence){
        const before=previous.timeEvidence||{},incoming=task.timeEvidence||{};
        previous.timeEvidence={...incoming,...before,
          raw:unique([before.raw||'',incoming.raw||'']).join('\n'),
          sourceSpan:unique([before.sourceSpan||'',incoming.sourceSpan||'']).join('\n'),
          method:unique([before.method||'',incoming.method||'']).join('；'),
          yearReference:before.yearReference||incoming.yearReference||'',
          inferred:before.inferred===true||incoming.inferred===true,
          yearInferred:before.yearInferred===true||incoming.yearInferred===true,
          confirmed:previous.dateConfirmed};
        if(!previous.dateConfirmed)previous.timeEvidence.verification=previous.timeEvidence.inferred?'estimated':'pending';
      }
    }
    return result;
  }
  const api={splitText,mergeTasks};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DHRecognition=api;
})(typeof window!=='undefined'?window:globalThis);
