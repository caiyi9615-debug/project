'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {analyzeNotification,fail}=require('./ai');
const {createPush}=require('./push');
const {advise}=require('./advisor');
const Trust=require('./trust');
const ROOT=__dirname, PUBLIC=path.join(ROOT,'public');
const MAX_FILE_BYTES=10*1024*1024,MAX_BODY_BYTES=15*1024*1024;
const TYPES=['image/png','image/jpeg','image/webp','image/gif'];

// 同 V1：配置只在后端读取，系统环境变量优先于本地 .env。
const envPath=path.join(ROOT,'.env');
if(fs.existsSync(envPath))for(const line of fs.readFileSync(envPath,'utf8').split(/\r?\n/)){
  const match=line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if(match&&!(match[1] in process.env))process.env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2').trim();
}
function json(res,status,payload,headers={}){
 const body=JSON.stringify(payload);
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(body);
}
function cors(req){
 const origin=req.headers.origin;if(!origin)return {};
 try{
  const parsed=new URL(origin);
  const extras=(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim());
  if(!['http:','https:'].includes(parsed.protocol)||!(parsed.host===req.headers.host||extras.includes(origin)))return {};
  return {'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
 }catch{return {};}
}
function readJson(req){return new Promise((resolve,reject)=>{
 let size=0,oversize=false;const chunks=[];
 req.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY_BYTES){oversize=true;return;}if(!oversize)chunks.push(chunk);});
 req.on('end',()=>{if(oversize){reject(fail('请求超过15 MB，请选择不超过10 MB的图片。',413));return;}try{const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));const body=JSON.parse(text||'{}');Trust.validateText(body);resolve(body);}catch(error){reject(error.publicMessage?error:fail('请求必须是有效UTF-8编码的JSON，请重新粘贴文字。',400));}});
 req.on('error',()=>reject(fail('读取上传内容失败。',400)));
});}
function validateImage(image){
 if(!image||typeof image!=='object')throw fail('图片内容无效。',400);
 const mimeType=String(image.mimeType||'').toLowerCase(),data=String(image.data||'');
 if(!TYPES.includes(mimeType))throw fail('格式不支持，请使用PNG、JPG、WEBP或GIF。',400);
 if(!data||data.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw fail('图片Base64内容无效。',400);
 const bytes=Buffer.from(data,'base64');
 if(bytes.length>MAX_FILE_BYTES)throw fail('图片超过10 MB。',400);
 const detected=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png'
  :bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg'
  :['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6))?'image/gif'
  :bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':'';
 if(!detected||detected!==mimeType)throw fail('图片内容与格式不匹配或已损坏，请重新导出PNG/JPG。',400);
 return {mimeType,data};
}
function serveStatic(req,res){
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{json(res,400,{error:'地址无效。'});return;}
 if(pathname==='/')pathname='/index.html';
 const file=path.resolve(PUBLIC,`.${pathname}`);
 if(!file.startsWith(PUBLIC+path.sep)){json(res,403,{error:'禁止访问。'});return;}
 if(['.mp4','.webm'].includes(path.extname(file))){
  fs.stat(file,(error,stat)=>{
   if(error||!stat.isFile()){json(res,404,{error:'视频文件不存在。'});return;}
   const headers={'Content-Type':path.extname(file)==='.mp4'?'video/mp4':'video/webm','Accept-Ranges':'bytes','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
   let start=0,end=stat.size-1,status=200;
   if(req.headers.range){
    const match=req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
    if(match&&(match[1]||match[2])){start=match[1]?Number(match[1]):Math.max(0,stat.size-Number(match[2]));end=match[1]?(match[2]?Math.min(Number(match[2]),stat.size-1):stat.size-1):stat.size-1;}
    if(!match||!(match[1]||match[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=stat.size||end<start){res.writeHead(416,{...headers,'Content-Range':`bytes */${stat.size}`});res.end();return;}
    status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
   }
   headers['Content-Length']=end-start+1;res.writeHead(status,headers);
   if(req.method==='HEAD'){res.end();return;}
   const stream=fs.createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  });return;
 }
 fs.readFile(file,(error,content)=>{
  if(error){json(res,404,{error:'文件不存在。'});return;}
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.vtt':'text/vtt; charset=utf-8'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':pathname.endsWith('.webmanifest')?'application/manifest+json':path.extname(file)==='.png'?'image/png':mime,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:content);
 });
}
function createServer(){
 const push=createPush();
 const requests=new Map();let windowStart=Date.now(),total=0,active=0;
 function admit(req,res,headers){
  const now=Date.now();if(now-windowStart>=60000){requests.clear();total=0;windowStart=now;}
  const ip=process.env.RENDER==='true'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress;
  const count=requests.get(ip)||0,max=Math.max(1,Number(process.env.AI_RATE_LIMIT_PER_MINUTE)||8);
  if(count>=max||total>=60||active>=3){json(res,429,{error:'AI请求较多，请稍后重试。任务管理和本地计划仍可使用。'},{...headers,'Retry-After':'60'});return false;}
  requests.set(ip,count+1);total++;active++;res.once('close',()=>active--);return true;
 }
 const server=http.createServer(async(req,res)=>{
  const headers=cors(req),origin=req.headers.origin;
  if(req.url.startsWith('/api/')&&origin&&!headers['Access-Control-Allow-Origin']){json(res,403,{error:'该网页来源未允许访问API。'});return;}
  if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return;}
  if(['/api/analyze','/api/advisor','/api/test-connection'].includes(req.url)&&req.method==='POST'){
   if(req.headers['sec-fetch-site']==='cross-site'){json(res,403,{error:'跨站AI请求未允许。'},headers);return;}
   if(!admit(req,res,headers))return;
  }
  if(req.url.startsWith('/api/push/')){
   try{await push.handle(req,res,readJson,json,headers);}catch(error){if(!res.destroyed)json(res,error.status||503,{ok:false,error:error.publicMessage||'提醒服务暂不可用，本地任务仍可使用。'},headers);}return;
  }
  if(req.url==='/api/advisor'&&req.method==='POST'){
   try{if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail('请使用JSON请求。',415);const body=await readJson(req);const result=await advise(body);json(res,200,{ok:true,result},headers);}
   catch(error){if(!res.destroyed)json(res,error.status||500,{ok:false,error:error.publicMessage||'AI规划失败，本地任务未改变。'},headers);}return;
  }
  if(req.url==='/api/health'&&req.method==='GET'){
   json(res,200,{ok:true,app:'Deadline Hunter',version:'2.5.0',team:'路边队',provider:'DeepSeek',deepseekConfigured:!!(process.env.DEEPSEEK_API_KEY||'').trim(),model:process.env.DEEPSEEK_MODEL||'deepseek-flash',maxFileBytes:MAX_FILE_BYTES,acceptedMimeTypes:TYPES},headers);return;
  }
  if(['/api/analyze','/api/test-connection'].includes(req.url)&&req.method==='POST'){
   try{
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail('请使用JSON请求。',415);
    const body=await readJson(req);
    if(!body||typeof body!=='object'||Array.isArray(body))throw fail('请求格式无效。',400);
    if(req.url==='/api/test-connection'){
     await analyzeNotification({text:'连接测试：请准备一份课程笔记。未提供日期。'});
     json(res,200,{ok:true,message:'DeepSeek 已完成实际请求，连接正常。'},headers);return;
    }
    if(body.text!=null&&typeof body.text!=='string')throw fail('通知文字格式无效。',400);
    const text=(body.text||'').trim();if(text.length>20000)throw fail('文字超过20000字，请分段识别。',400);
    const image=body.image?validateImage(body.image):null;
    if(!image&&!text)throw fail('请上传图片或粘贴通知文字。',400);
    const result=await analyzeNotification({text,image});json(res,200,{ok:true,result},headers);
   }catch(error){if(!res.destroyed)json(res,error.status||500,{ok:false,error:error.publicMessage||'处理失败，请重试。'},headers);}
   return;
  }
  if(req.method==='GET'||req.method==='HEAD'){serveStatic(req,res);return;}
  json(res,405,{error:'请求方式不支持。'},headers);
 });
 server.requestTimeout=120000;server.headersTimeout=15000;
 return server;
}
if(require.main===module){
 const port=Number(process.env.PORT||8795);
 if(!Number.isInteger(port)||port<1||port>65535){console.error('PORT必须是1到65535的整数。');process.exit(1);}
 const server=createServer();
 server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口${port}已占用，请关闭该端口的旧服务窗口，或修改本项目.env中的PORT。`:error.message);process.exitCode=1;});
 const host=process.env.HOST||(process.env.RENDER==='true'?'0.0.0.0':'127.0.0.1');
 server.listen(port,host,()=>{
  const url=`http://127.0.0.1:${port}/`;
  console.log(`Deadline Hunter V2.5.0 · 路边队 · 快捷收件与今日行动\n监听：${host}:${port}\n本机访问：${url}\n按Ctrl+C停止；云端请使用Render提供的HTTPS网址。`);
  if(process.platform==='win32'&&process.env.OPEN_BROWSER==='1')spawn('cmd.exe',['/d','/s','/c',`start "" "${url}"`],{detached:true,stdio:'ignore',windowsHide:true}).unref();
 });
}
module.exports={createServer,validateImage,MAX_FILE_BYTES};
