'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const keys=require('web-push').generateVAPIDKeys();
const file=path.join(__dirname,'../.env.push.generated');
const text=`# 只在你本机查看，勿上传GitHub或分享截图。替换示例网址。\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=https://你的Render网址.onrender.com\nPUSH_JOIN_CODE=${crypto.randomBytes(16).toString('hex')}\nPUSH_CRON_SECRET=${crypto.randomBytes(32).toString('hex')}\n`;
try{fs.writeFileSync(file,text,{flag:'wx',mode:0o600});console.log('已生成 .env.push.generated，请用记事本打开。没有覆盖现有 .env。不要上传此生成文件。');}
catch(e){console.error(e.code==='EEXIST'?'文件已存在，请使用原来的密钥；不要随意重新生成，否则需要各设备重新订阅。':'生成失败：'+e.message);process.exitCode=1;}
