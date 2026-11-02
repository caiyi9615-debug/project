'use strict';
window.DHPush=(()=>{
 let cfg=null,checking=false,message='正在检查后台配置…',latest=null,draining=false,currentTasks=[];
 const key='dh-push-device-v1';
 const saved=()=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
 const supported=()=>isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
 const text=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function api(path,body){const r=await fetch('/api/push/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});let p;try{p=await r.json();}catch{throw new Error('提醒服务尚未就绪，请等待Render唤醒后重试。');}if(!r.ok)throw new Error(p.error||'提醒请求失败');return p;}
 function tasks(values){return values.map(t=>({id:t.id,title:t.title,dueAt:t.dueAt,deadlineKind:t.deadlineKind,dateConfirmed:t.dateConfirmed,timeEvidence:{verification:t.timeEvidence?.verification},executionStatus:t.executionStatus,demo:t.demo}));}
 function update(){const panel=document.querySelector('#push-settings');if(panel)paint(panel);}
 async function check(){if(checking)return;checking=true;try{const r=await fetch('/api/push/config',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error();cfg=await r.json();message=cfg.configured?(saved()?'此设备已开启；请同步任务并发送测试通知。':'后台变量已配置；请开启此设备的通知并测试。'):'后台尚未配置，关闭网页后的提醒未生效。请先完成免费推送部署说明。';}catch{message='无法连接提醒服务，本地任务不受影响。';}finally{checking=false;update();}}
 function paint(panel){
  panel.hidden=!cfg?.configured&&!saved();
  const enabled=!!saved(),can=supported();
  panel.innerHTML=`<h2>系统推送 · 免费试用</h2><p>截止前24小时、12小时、3小时、1小时、30分钟提醒。只同步已核实准确截止时间、明确未提交/逾期的非演示任务。</p><div class="notice ${cfg?.configured?'':'warn'}" role="status">${text(message)}</div><p class="small muted">免费定时器每5分钟检查；网络、后台唤醒和系统设置可能延迟或丢失通知，不代替闹钟。服务端接受发送不等于设备已收到。</p>${!can?'<div class="notice warn">当前环境不支持推送。苹果需iOS 16.4以上，将网站添加到主屏幕后从图标打开；安卓和电脑请用支持推送的浏览器，不要在微信内打开。</div>':''}<label class="field"><span>提醒邀请码（首次开启时填写，不是DeepSeek密钥）</span><input id="push-join" type="password" autocomplete="off" maxlength="200" placeholder="由维护者在Render配置"></label><div class="actions"><button type="button" class="button primary" id="push-enable" ${!can||!cfg?.configured?'disabled':''}>${enabled?'重新订阅':'开启此设备通知'}</button><button type="button" class="button" id="push-sync" ${!enabled?'disabled':''}>同步提醒任务</button><button type="button" class="button" id="push-test" ${!enabled?'disabled':''}>发送测试通知</button><button type="button" class="button danger" id="push-disable" ${!enabled?'disabled':''}>关闭并删除云端提醒</button></div><p class="small muted">开启即同意将任务ID、标题、截止时刻和此设备推送订阅上传到Supabase；不上传图片、通知原文、材料或AI密钥。每台设备单独开启，当前不提供跨设备任务同步。连续30天未同步会自动清理云端订阅。</p>`;
  panel.querySelector('#push-enable').onclick=async e=>{
   const joinCode=panel.querySelector('#push-join').value;
   if(!joinCode){message='请先填写提醒邀请码。';update();return;}
   e.target.disabled=true;
   try{
    // 直接由用户点击触发权限申请，符合iOS手势要求。
    const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('未获得通知权限。若曾拒绝，请在系统/浏览器网站设置中手动开启。');
    await navigator.serviceWorker.register('/sw.js');const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub){const bin=atob(cfg.publicKey.replace(/-/g,'+').replace(/_/g,'/'));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(bin,c=>c.charCodeAt(0))});}
    const token=saved()?.token||Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
    const result=await api('subscribe',{token,joinCode,subscription:sub.toJSON(),tasks:tasks(currentTasks)});
    localStorage.setItem(key,JSON.stringify({token}));message=result.message+' 请点击发送测试通知。';
   }catch(e){message=e.message||'开启失败，请检查设备和网络。';}finally{update();}
  };
  panel.querySelector('#push-sync').onclick=()=>sync(currentTasks);
  panel.querySelector('#push-test').onclick=async e=>{e.target.disabled=true;try{message=(await api('test',{token:saved()?.token})).message;}catch(e){message=e.message;}update();};
  panel.querySelector('#push-disable').onclick=async e=>{e.target.disabled=true;try{
   await api('disable',{token:saved()?.token});localStorage.removeItem(key);latest=null;
   message='云端订阅与提醒已删除。';
   try{const reg=await navigator.serviceWorker.getRegistration('/');const sub=await reg?.pushManager.getSubscription();await sub?.unsubscribe();}catch{message+=' 浏览器订阅清理未完成，可在网站权限中关闭通知。';}
  }catch(e){message='关闭失败，云端提醒可能仍存在：'+e.message;}update();};
 }
 async function sync(values){
  currentTasks=values;if(!saved())return;
  latest=tasks(values);if(draining)return;
  draining=true;
  try{while(latest&&saved()){const list=latest;latest=null;await api('sync',{token:saved().token,tasks:list});message='提醒摘要已同步：'+new Date().toLocaleTimeString('zh-CN')+'；定时器是否运行请在Supabase Cron检查。';}}
  catch(e){message='提醒未同步，云端可能仍使用旧状态：'+e.message+'。本地保存正常，请重新同步。';}
  finally{draining=false;update();}
 }
 function mount(app,state){currentTasks=state.tasks;const panel=document.createElement('section');panel.className='panel';panel.id='push-settings';panel.style.marginBottom='20px';app.append(panel);paint(panel);if(!cfg&&!checking)check();}
 return {mount,sync};
})();
