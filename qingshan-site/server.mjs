import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { teams,duties,jobs,heal,newEvent,validChoice,occupant,canPlace,fill,applyChoice } from './rules.mjs';

const folder = fileURLToPath(new URL('./data/',import.meta.url));
mkdirSync(folder,{recursive:true});
const db=new DatabaseSync(process.env.QINGSHAN_DB || folder+'qingshan.sqlite');
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify({
  admin:null, invite:null, users:[], events:[], sessions:{}
}));
const load=()=>JSON.parse(db.prepare('SELECT body FROM state WHERE id=1').get().body);
const save=state=>db.prepare('UPDATE state SET body=? WHERE id=1').run(JSON.stringify(state));
const token=(size=24)=>randomBytes(size).toString('hex');
const digest=value=>createHash('sha256').update(value).digest('hex');
const secret=value=>{
  const salt=token(16);
  return salt+':'+scryptSync(value,salt,32).toString('hex');
};
function matches(value,stored) {
  if(typeof value!=='string'||value.length>256||!stored)return false;
  const [salt,expected]=stored.split(':');
  return timingSafeEqual(scryptSync(value,salt,32),Buffer.from(expected,'hex'));
}
const lifetime=21*24*60*60*1000;
const secure=process.env.QINGSHAN_HTTPS==='1';
const failures=new Map();
function error(message,status=400){throw Object.assign(new Error(message),{status});}
function need(test,message,status){if(!test) error(message,status);}
function pass(value){need(typeof value==='string'&&value.length>=10&&value.length<=128,'密码需为 10～128 个字符');return value;}
function name(value){
  need(typeof value==='string','请输入游戏 ID');
  const id=value.trim();
  need(id.length>0&&[...id].length<=50&&!/[\p{Cc}\p{Bidi_Control}]/u.test(id),'游戏 ID 需为 1～50 个字符');
  return id;
}
function importMembers(state,text){
  need(typeof text==='string','请粘贴游戏 ID');
  const names=[...new Set(text.split(/\r?\n/).filter(line=>line.trim()).map(name))];
  need(names.length>0&&names.length<=200&&!names.includes('admin'),'每次导入 1～200 个游戏 ID，每行一个');
  const existing=new Set(state.users.map(user=>user.name));
  const missing=names.filter(id=>!existing.has(id));
  for(const id of missing)state.users.push({id:randomUUID(),name:id,status:'unregistered',history:[]});
  return missing.length;
}
function seedRoster(){
  const file=process.env.QINGSHAN_ROSTER_FILE;
  if(!file)return;
  db.exec('BEGIN IMMEDIATE');
  try{
    const state=load();
    if(!state.rosterSeeded){
      const count=importMembers(state,readFileSync(file,'utf8'));
      state.rosterSeeded=true;
      save(state);
      console.log('首次导入名册 '+count+' 人');
    }
    db.exec('COMMIT');
  }catch(err){db.exec('ROLLBACK');throw err;}
}
function userBy(state,id){
  const user=state.users.find(item=>item.id===id);
  need(user,'成员不存在',404);
  return user;
}
function eventBy(state,id){
  const event=state.events.find(item=>item.id===id);
  need(event,'活动不存在',404);
  return event;
}
function publicEvent(state,event){
  const names=new Map(state.users.map(user=>[user.id,user.name]));
  const {order,...fields}=event;
  return {...fields,entries:event.entries.map(entry=>({...entry,name:names.get(entry.id)}))};
}
function session(req,state){
  const raw=(req.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith('qs='));
  if(!raw)return {};
  const key=digest(raw.slice(3));
  const found=Object.hasOwn(state.sessions,key)&&state.sessions[key];
  return found&&found.until>Date.now()?{id:found.id,key}:{};
}
function signIn(req,res,state,id){
  const old=session(req,state);
  if(old.key)delete state.sessions[old.key];
  for(const [key,entry] of Object.entries(state.sessions))if(entry.until<=Date.now())delete state.sessions[key];
  const raw=token();
  state.sessions[digest(raw)]={id,until:Date.now()+lifetime};
  cookie(res,raw,lifetime/1000);
}
function cookie(res,value,age){
  res.setHeader('Set-Cookie',`qs=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure?'; Secure':''}`);
}
function checkRate(req){
  const ip=req.socket.remoteAddress||'local';
  const now=Date.now();
  for(const [key,item] of failures)if(item.until<=now)failures.delete(key);
  const rate=failures.get(ip)||{count:0,until:now+10*60*1000};
  need(rate.count<35,'尝试次数过多，请十分钟后再试',429);
  rate.count++;
  failures.set(ip,rate);
  return ()=>failures.delete(ip);
}
async function jsonBody(req){
  need(req.headers['content-type']?.split(';')[0]==='application/json','请求格式无效',415);
  need(!['cross-site','same-site'].includes(req.headers['sec-fetch-site']),'请从报名网站提交',403);
  const origin=req.headers.origin;
  if(origin){
    const expected=process.env.QINGSHAN_ORIGIN || (secure?'https://':'http://')+req.headers.host;
    need(origin===expected,'请从报名网站提交',403);
  }
  const chunks=[];
  let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;need(bytes<=65536,'请求过大',413);chunks.push(chunk);}
  let data;
  try{data=JSON.parse(Buffer.concat(chunks));}catch{error('请求格式无效');}
  need(data&&typeof data==='object'&&!Array.isArray(data),'请求格式无效');
  return data;
}

function choiceFrom(data){
  const choice={job:data.job,team:data.team,duty:heal(data.job)?'治疗':data.duty};
  need(validChoice(choice.job,choice.team,choice.duty),'请选择有效的职业、团别和职责');
  return choice;
}
function placeEntry(event,entry,target,swap){
  const origin=entry.place;
  const other=occupant(event,target.team,target.squad,target.seat);
  if(other===entry)return;
  need(!other||swap,'目标已有人，请确认交换');
  if(other&&origin)other.place=null;
  if(other&&!origin)error('请先腾出目标位置');
  entry.place=null;
  need(canPlace(event,entry,target,true),'目标位未开放，或与治疗规则不符');
  entry.place=target;
  if(other){
    need(canPlace(event,other,origin,true),'交换后与治疗规则不符');
    other.place=origin;
  }
  fill(event);
}
function memberView(user){
  return {id:user.id,name:user.name,status:user.status,last:user.last,rename:user.rename,history:user.history};
}

function readApi(url,state,auth){
  const isAdmin=auth.id==='admin';
  const user=auth.id&&!isAdmin?userBy(state,auth.id):null;
  if(url.pathname==='/api/me')return {admin:isAdmin,needsSetup:!state.admin,user:user&&memberView(user),teams,duties,jobs};
  need(isAdmin||user?.status==='approved','请登录并等待成员审核',401);
  if(url.pathname==='/api/events')return state.events.filter(item=>isAdmin||item.published)
    .map(({id,title,starts,deadline,published})=>({id,title,starts,deadline,published}));
  if(url.pathname==='/api/admin/users'){
    need(isAdmin,'需要管理员权限',403);
    return state.users.map(memberView);
  }
  if(url.pathname==='/api/event'){
    const event=eventBy(state,url.searchParams.get('id'));
    need(isAdmin||event.published,'活动还未发布',404);
    return publicEvent(state,event);
  }
  error('页面不存在',404);
}

function writeApi(path,data,req,res,state,auth){
  if(path==='/api/setup'){
    need(!state.admin,'管理员已完成初始化，请用 admin 登录',409);
    const reset=checkRate(req);
    const code=typeof data.code==='string'?data.code.trim().toLowerCase():'';
    need(setupCode&&code===setupCode,'初始化码不匹配，请复制当前运行窗口中冒号后的 24 位字符',403);
    state.admin=secret(pass(data.password));
    state.invite=secret(pass(data.invite));
    signIn(req,res,state,'admin');
    reset();
    return {};
  }
  if(path==='/api/login'){
    const reset=checkRate(req);
    const id=name(data.name);
    const user=state.users.find(item=>item.name===id);
    need(id==='admin'?matches(data.password,state.admin):matches(data.password,user?.password),'游戏 ID 或密码不正确',401);
    signIn(req,res,state,id==='admin'?'admin':user.id);
    reset();
    return {};
  }
  if(path==='/api/register'){
    const reset=checkRate(req);
    const user=state.users.find(item=>item.name===name(data.name));
    need(matches(data.invite,state.invite)&&user&&!user.password,'邀请码或名册 ID 无效，或账号已注册',403);
    user.password=secret(pass(data.password));
    user.status='pending';
    signIn(req,res,state,user.id);
    reset();
    return {};
  }
  if(path==='/api/reset'){
    const reset=checkRate(req);
    const user=state.users.find(item=>item.name===name(data.name));
    need(user?.reset?.until>Date.now()&&typeof data.code==='string'&&
      user.reset.hash===digest(data.code),'重置码无效或已过期',403);
    user.password=secret(pass(data.password));
    delete user.reset;
    for(const [key,entry] of Object.entries(state.sessions))if(entry.id===user.id)delete state.sessions[key];
    signIn(req,res,state,user.id);
    reset();
    return {};
  }
  if(path==='/api/logout'){
    if(auth.key)delete state.sessions[auth.key];
    cookie(res,'',0);
    return {};
  }
  need(auth.id,'请先登录',401);
  if(path.startsWith('/api/admin/')){
    need(auth.id==='admin','需要管理员权限',403);
    return adminWrite(path,data,state);
  }
  need(auth.id!=='admin','请用成员账号报名',403);
  const user=userBy(state,auth.id);
  need(user.status==='approved','管理员审核通过后可操作',403);
  if(path==='/api/rename'){
    const next=name(data.name);
    need(next!=='admin'&&!state.users.some(item=>item.name===next),'该游戏 ID 已使用');
    user.rename=next;
    return {};
  }
  const event=eventBy(state,data.event);
  need(event.published,'活动还未发布',404);
  if(path==='/api/cancel'){
    event.entries=event.entries.filter(item=>item.id!==user.id);
    fill(event);
    return publicEvent(state,event);
  }
  if(path==='/api/signup'){
    const choice=choiceFrom(data);
    const prior=event.entries.find(item=>item.id===user.id);
    need(prior||Date.now()<Date.parse(event.deadline),'报名已截止');
    const hadSeat=Boolean(prior?.place);
    const entry=applyChoice(event,user.id,choice);
    if(hadSeat&&!entry.place&&!data.confirmWait)return {confirmWait:true};
    user.last=choice;
    return publicEvent(state,event);
  }
  error('页面不存在',404);
}

function adminWrite(path,data,state){
  if(path==='/api/admin/invite'){state.invite=secret(pass(data.invite));return {};}
  if(path==='/api/admin/import'){
    return {count:importMembers(state,data.names)};
  }
  if(path==='/api/admin/member'){
    const user=userBy(state,data.id);
    if(data.action==='approve'){
      need(user.status==='pending','该成员没有待审核注册');
      user.status='approved';
    }else if(data.action==='reject'){
      need(user.status==='pending','该成员没有待审核注册');
      delete user.password;
      user.status='unregistered';
      for(const [key,entry] of Object.entries(state.sessions))if(entry.id===user.id)delete state.sessions[key];
    }else if(data.action==='rename'){
      const next=name(data.name||user.rename);
      need(next!=='admin'&&!state.users.some(item=>item.name===next),'该游戏 ID 已使用');
      user.history.push(user.name);
      user.name=next;
      delete user.rename;
    }else if(data.action==='reset'){
      need(user.password,'该成员尚未注册');
      const code=token(6);
      user.reset={hash:digest(code),until:Date.now()+60*60*1000};
      return {code};
    }else error('操作无效');
    return {};
  }
  if(path==='/api/admin/event'){
    need(typeof data.title==='string'&&data.title.trim()&&data.title.length<=80,'请输入 80 字以内的活动名称');
    const starts=Date.parse(data.starts),deadline=Date.parse(data.deadline);
    need(Number.isFinite(starts)&&Number.isFinite(deadline)&&deadline<=starts,'请设置有效的开打和截止时间');
    const event=data.event?eventBy(state,data.event):newEvent('', '', '', randomUUID());
    Object.assign(event,{title:data.title.trim(),starts:new Date(starts).toISOString(),deadline:new Date(deadline).toISOString(),published:data.publish===true||event.published});
    if(!data.event)state.events.push(event);
    return publicEvent(state,event);
  }
  const event=eventBy(state,data.event);
  if(path==='/api/admin/plan'){
    const {team,squad,seat,duty}=data;
    need(Number.isInteger(team)&&team>=0&&team<2&&Number.isInteger(squad)&&squad>=0&&squad<5&&
      Number.isInteger(seat)&&seat>=0&&seat<6&&duties.includes(duty)&&!(squad===0&&seat===0),'位置或职责无效');
    const next=[...event.plans[team][squad]];
    next[seat]=duty;
    const healSlots=next.filter(role=>role==='治疗').length;
    need(healSlots>=1&&healSlots<=2,'每个小队需要 1～2 个治疗位');
    need(!occupant(event,team,squad,seat)||
      heal(occupant(event,team,squad,seat).job)===(duty==='治疗'),'请先将当前成员调离该格');
    event.plans[team][squad]=next;
    fill(event);
  }else if(path==='/api/admin/assign'){
    const entry=event.entries.find(item=>item.id===data.id);
    need(entry,'请先为该成员报名');
    const target=occupant(event,data.team,data.squad,data.seat);
    if(Object.hasOwn(data,'expected'))need((target?.id||'')===data.expected,'这个位置刚有变动，请刷新编队后再操作',409);
    placeEntry(event,entry,{team:data.team,squad:data.squad,seat:data.seat},data.swap===true);
  }else if(path==='/api/admin/signup'){
    const user=userBy(state,data.id);
    need(user.status==='approved','成员尚未通过审核');
    applyChoice(event,user.id,choiceFrom(data));
  }else if(path==='/api/admin/cancel'){
    event.entries=event.entries.filter(item=>item.id!==data.id);
    fill(event);
  }else error('页面不存在',404);
  return publicEvent(state,event);
}

const assets=new Map([
  ['/', ['./index.html','text/html; charset=utf-8']],
  ['/app.js',['./app.js','text/javascript; charset=utf-8']],
  ['/roster-image.js',['./roster-image.js','text/javascript; charset=utf-8']],
  ['/style.css',['./style.css','text/css; charset=utf-8']],
  ['/character-cover.webp',['./character-cover.webp','image/webp']],
  ['/landscape.png',['../qingshan-preview/qingshan-landscape.png','image/png']]
]);
const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  try{
    const url=new URL(req.url,'http://localhost');
    if(assets.has(url.pathname)&&req.method==='GET'){
      const [file,type]=assets.get(url.pathname);
      res.writeHead(200,{'Content-Type':type});
      res.end(readFileSync(new URL(file,import.meta.url)));
      return;
    }
    need(url.pathname.startsWith('/api/'),'页面不存在',404);
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    if(req.method==='GET'){
      const state=load();
      res.end(JSON.stringify(readApi(url,state,session(req,state))));
      return;
    }
    need(req.method==='POST','请求方法无效',405);
    const data=await jsonBody(req);
    db.exec('BEGIN IMMEDIATE');
    try{
      const state=load();
      const result=writeApi(url.pathname,data,req,res,state,session(req,state));
      if(!result.confirmWait)save(state);
      db.exec('COMMIT');
      res.end(JSON.stringify(result));
    }catch(err){db.exec('ROLLBACK');throw err;}
  }catch(err){
    res.statusCode=err.status||500;
    if(!err.status)console.error(err);
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({error:err.status?err.message:'操作失败，请稍后重试'}));
  }
});
const host=process.env.QINGSHAN_HOST||'127.0.0.1';
seedRoster();
const setupCode=load().admin ? null : token(12);
server.listen(Number(process.env.PORT||8787),host,()=>{
  console.log(`青山帮战报名 http://${host}:${server.address().port}`);
  if(setupCode)console.log('管理员首次初始化码（仅供管理员使用）: '+setupCode);
});
