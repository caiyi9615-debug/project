'use strict';
window.TimeReview={
  needs(task){return task.deadlineKind!=='none'&&(!task.dateConfirmed||task.deadlineKind==='pending');},
  groups(tasks){const relative=tasks.filter(t=>DHTime.classify(t.dateText,t)==='relative'),duration=tasks.filter(t=>DHTime.classify(t.dateText,t)==='duration');return relative.length&&duration.length?[tasks.filter(t=>!relative.includes(t)),relative]:[tasks];},
  open(tasks,context={}){
    const T=DHTime,D=DH,dialog=document.querySelector('#timeDialog');
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const original=structuredClone(tasks);let working=structuredClone(tasks);
    const previousBase=context.baseAt||tasks.find(t=>t.timeEvidence?.baseAt)?.timeEvidence.baseAt||'';
    return new Promise(resolve=>{
      dialog.setAttribute('aria-labelledby','timeReviewTitle');
      dialog.innerHTML=`<div class="dialog-head"><div><h2 id="timeReviewTitle">核实时间与状态</h2><p class="small muted">${tasks.length} 项 · Asia/Shanghai（UTC+8）</p></div><button type="button" class="review-close" id="closeTime" aria-label="关闭时间核实"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="dialog-body"><p class="review-explainer">剩余时长需要完整截图时间；暂时没有，也能保存为待核实。</p><section class="base-time" aria-labelledby="baseTimeTitle"><div class="base-time-heading"><h3 id="baseTimeTitle">这张截图的拍摄时间</h3><span>填写一次，整批共用</span></div><div class="base-time-fields"><label class="field"><span>拍摄日期与时刻</span><input id="screenshotAt" type="datetime-local" value="${esc(previousBase)}"></label><label class="field"><span>时间来源（需你核实）</span><select id="baseSource"><option>用户手动核实的截图拍摄时间</option><option>用户已核实的截图完整时间文字</option><option>用户已核实的EXIF辅助信息</option></select></label></div><div class="base-time-bottom"><p>手机状态栏时刻、上传时间和文件修改时间不能单独作为拍摄时间。</p><button class="button" id="calculateBatch" type="button">应用并推算</button></div><p id="baseError" class="error" role="alert"></p></section><div class="review-list-heading"><h3>逐项核实 <span class="muted small">${tasks.length} 项</span></h3><button class="button text compact" id="expandTimeRows" type="button">展开全部</button></div><div id="timeRows"></div><p class="review-evidence-note">推算结果会保留依据与“推算值”标记，勾选确认不会将它变成原文中的准确时刻。</p></div><div class="dialog-foot"><span class="review-foot-note">没有时间？可以先保存为待核实。</span><button type="button" class="button" id="skipTime">暂时跳过</button><button type="button" class="button primary" id="applyTime">应用核实信息</button></div>`;
      function rows(){
        const expanded=new Set([...dialog.querySelectorAll('.time-row-details[open]')].map(el=>el.closest('[data-row]').dataset.row));
        dialog.querySelector('#timeRows').innerHTML=working.map((t,i)=>`<article class="time-review-row" data-row="${i}"><details class="time-row-details" ${expanded.has(String(i))?'open':''}><summary><div class="review-row-heading"><span class="review-row-number">${i+1}</span><h3>${esc(t.title)}</h3><span class="review-status">${esc(T.statuses[t.executionStatus]||'未知')}</span><svg class="review-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></div><p class="review-row-source">${esc(t.course||'课程未识别')} · 原文：${esc(t.dateText||'未识别时间')}</p><div class="review-row-time"><p class="calculation-preview">${esc(T.label(t))}</p><span class="review-disclosure-label">展开修改</span></div></summary><div class="review-row-editor"><p class="review-method">${esc(t.timeEvidence?.method||'待人工核实')}</p><div class="form-grid"><label class="field"><span>截止信息方式</span><select name="deadlineKind">${[['datetime','准确日期和时刻'],['date','保留仅有日期'],['pending','标记待核实'],['none','暂不设置截止时间']].map(([v,l])=>`<option value="${v}" ${t.deadlineKind===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field"><span>任务状态</span><select name="executionStatus">${Object.entries(T.statuses).map(([v,l])=>`<option value="${v}" ${t.executionStatus===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field full review-datetime" ${t.deadlineKind==='date'||t.deadlineKind==='none'?'hidden':''}><span>准确截止时间（不填不推测）</span><input type="datetime-local" name="dueAt" value="${esc(t.dueAt)}"></label><label class="field full review-date" ${t.deadlineKind!=='date'?'hidden':''}><span>仅日期（包含年份，不补具体时刻）</span><input type="date" name="dueDate" value="${esc(t.dueDate)}"></label></div></div></details><label class="check-label review-confirm"><input type="checkbox" name="confirmed" ${t.dateConfirmed?'checked':''}><span>已核对本项时间依据</span></label></article>`).join('');
        updateDisclosure();
      }
      function updateDisclosure(){
        for(const details of dialog.querySelectorAll('.time-row-details'))details.querySelector('.review-disclosure-label').textContent=details.open?'收起修改':'展开修改';
        const all=[...dialog.querySelectorAll('.time-row-details')];
        dialog.querySelector('#expandTimeRows').textContent=all.length&&all.every(el=>el.open)?'收起全部':'展开全部';
      }
      function updateRow(row){
        const t=working[Number(row.dataset.row)],kind=row.querySelector('[name="deadlineKind"]').value;
        const dueAt=T.valid(row.querySelector('[name="dueAt"]').value)||'',dueDate=T.dateOnly(row.querySelector('[name="dueDate"]').value)||'';
        const manualChanged=dueAt!==t.dueAt||dueDate!==t.dueDate;
        const preview={...t,deadlineKind:(kind==='datetime'&&!dueAt||kind==='date'&&!dueDate)?'pending':kind,dueAt:kind==='datetime'?dueAt:'',dueDate:kind==='date'?dueDate:'',dateConfirmed:row.querySelector('[name="confirmed"]').checked,timeEvidence:{...t.timeEvidence,...(manualChanged?{inferred:false,yearInferred:false,yearReference:''}:{})}};
        row.querySelector('.calculation-preview').textContent=T.label(preview);
        row.querySelector('.review-method').textContent=manualChanged?'用户直接填写/核对截止信息':t.timeEvidence?.method||'待人工核实';
        row.querySelector('.review-status').textContent=T.statuses[row.querySelector('[name="executionStatus"]').value]||'未知';
        row.querySelector('.review-datetime').hidden=['date','none'].includes(kind);
        row.querySelector('.review-date').hidden=kind!=='date';
      }
      function collect(){
        for(const row of dialog.querySelectorAll('[data-row]')){
          const i=Number(row.dataset.row),t=working[i],kind=row.querySelector('[name="deadlineKind"]').value;
          const dueAt=T.valid(row.querySelector('[name="dueAt"]').value)||'',dueDate=T.dateOnly(row.querySelector('[name="dueDate"]').value)||'';
          const manualChanged=dueAt!==t.dueAt||dueDate!==t.dueDate;
          t.executionStatus=row.querySelector('[name="executionStatus"]').value;t.status=t.executionStatus==='completed'?'done':'todo';
          t.deadlineKind=kind==='datetime'&&!dueAt||kind==='date'&&!dueDate?'pending':kind;
          t.dueAt=t.deadlineKind==='datetime'?dueAt:'';t.dueDate=t.deadlineKind==='date'?dueDate:'';
          const confirmed=row.querySelector('[name="confirmed"]').checked&&['datetime','date'].includes(t.deadlineKind);
          t.dateConfirmed=confirmed;t.timeEvidence={...t.timeEvidence,timezone:T.ZONE,confirmed,
            verification:t.deadlineKind==='none'?'none':confirmed?(t.deadlineKind==='date'?'date_only':'confirmed'):t.timeEvidence?.inferred&&t.dueAt?'estimated':'pending',
            ...(manualChanged?{method:'用户直接填写/核对截止信息',inferred:false,yearInferred:false,yearReference:'',precision:t.deadlineKind==='date'?'仅日期':'分钟'}:{})};
        }
      }
      rows();
      const relative=tasks.some(t=>['duration','relative'].includes(T.classify(t.dateText,t)));
      dialog.querySelector('.base-time').hidden=!relative;
      const messageTime=tasks.some(t=>T.classify(t.dateText,t)==='relative'),mixed=messageTime&&tasks.some(t=>T.classify(t.dateText,t)==='duration');
      if(messageTime){dialog.querySelector('#baseTimeTitle').textContent='这条通知是什么时候发的？';dialog.querySelector('.base-time-fields label span').textContent='通知原始发布日期与时刻';dialog.querySelector('#baseSource').innerHTML='<option>用户核实的通知原始发布时间</option>';dialog.querySelector('.base-time-bottom p').textContent='截图拍摄、上传和文件修改时间不能代替消息发送时间。';}

      dialog.querySelector('.review-explainer').textContent=relative?(messageTime?'相对日期使用通知原始发布时间；没有可靠依据也可先保存待核实。':'剩余时长使用完整截图拍摄时间；没有时间也能保存待核实。'):'原文月日和时刻已保留；黄色标记的年份只是建议。核对后可一键确认，不需要填写截图时间。';
      const yearTasks=tasks.filter(t=>t.timeEvidence?.yearInferred&&!t.dateConfirmed);
      if(yearTasks.length){const bar=document.createElement('div');bar.className='year-review-bar notice warn';bar.innerHTML=`<label class="field"><span>统一确认这批缺失年份</span><input id="reviewYear" type="number" min="1900" max="2200" value="${Number((yearTasks[0].dueAt||yearTasks[0].dueDate).slice(0,4))}"></label><button type="button" class="button" id="confirmYears">确认这${yearTasks.length}项的年份</button>`;dialog.querySelector('.review-list-heading').before(bar);bar.querySelector('button').onclick=()=>{collect();const year=Number(bar.querySelector('input').value);if(!Number.isInteger(year)||year<1900||year>2200){bar.querySelector('input').reportValidity();return;}let invalid=false;for(const t of working.filter(t=>t.timeEvidence?.yearInferred)){const day=String(year)+(t.dueAt||t.dueDate).slice(4,10);if(!T.dateOnly(day)){invalid=true;continue;}if(t.dueAt)t.dueAt=day+t.dueAt.slice(10);else t.dueDate=day;t.dateConfirmed=true;t.timeEvidence={...t.timeEvidence,confirmed:true,verification:t.dueAt?'confirmed':'date_only',method:t.timeEvidence.method+'；用户已确认年份'+year};}rows();if(invalid){let error=bar.querySelector('[role=alert]');if(!error){error=document.createElement('p');error.className='error';error.setAttribute('role','alert');bar.append(error);}error.textContent='所选年份不支持某个日期（例如闰日），请展开单项核对。';}};}
      dialog.querySelector('#timeRows').addEventListener('input',e=>{
        const row=e.target.closest('[data-row]');if(!row)return;
        if(e.target.name==='dueAt'&&e.target.value)row.querySelector('[name="deadlineKind"]').value='datetime';
        if(e.target.name==='dueDate'&&e.target.value)row.querySelector('[name="deadlineKind"]').value='date';
        updateRow(row);
      });
      dialog.querySelector('#timeRows').addEventListener('change',e=>{const row=e.target.closest('[data-row]');if(row)updateRow(row);});
      dialog.querySelector('#timeRows').addEventListener('toggle',updateDisclosure,true);
      dialog.querySelector('#expandTimeRows').onclick=()=>{const details=[...dialog.querySelectorAll('.time-row-details')],open=!details.every(el=>el.open);for(const item of details)item.open=open;updateDisclosure();};
      dialog.querySelector('#calculateBatch').onclick=()=>{
        collect();if(mixed){dialog.querySelector('#baseError').textContent='相对日期与剩余时长的依据不同，请分别核实这些任务。';return;}const base=T.valid(dialog.querySelector('#screenshotAt').value),source=dialog.querySelector('#baseSource').value;
        if(!base){dialog.querySelector('#baseError').textContent=messageTime?'请填写通知原始发布日期和时刻；也可以跳过或直接填准确截止。':'请填写包含年份的完整拍摄日期和时刻；也可以跳过，或直接填写准确截止时间。';return;}
        working=working.map(t=>['duration','relative'].includes(T.classify(t.dateText,t))?D.cleanTask(T.resolve(t,base,source)):t);
        dialog.querySelector('#baseError').textContent='';rows();
      };
      dialog.querySelector('#applyTime').onclick=()=>{collect();dialog.close();resolve({tasks:working,baseAt:T.valid(dialog.querySelector('#screenshotAt').value)||''});};
      dialog.querySelector('#skipTime').onclick=()=>{collect();const kept=original.map((t,i)=>({...t,executionStatus:working[i].executionStatus,status:working[i].executionStatus==='completed'?'done':'todo'}));dialog.close();resolve({tasks:kept,baseAt:context.baseAt||'',skipped:true});};
      dialog.oncancel=()=>resolve({tasks:original,baseAt:context.baseAt||'',skipped:true,cancelled:true});
      dialog.querySelector('#closeTime').onclick=()=>{dialog.dispatchEvent(new Event('cancel'));dialog.close();};
      dialog.showModal();
    });
  }
};
