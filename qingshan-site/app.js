import { saveRosterImage } from './roster-image.js';

const root=document.querySelector('#app');
const notice=document.querySelector('#notice');
const editor=document.querySelector('#editor');
const eventTime=document.querySelector('#event-time');
const shell=document.querySelector('.shell');
let account, events=[], members=[], event, tab='signup', side=0, authMode='login', busy=false;
let eventId=new URL(location.href).searchParams.get('event');
const colors={'铁衣':'#dc9457','素问':'#d975a4','血河':'#d66c64','九灵':'#9d77cd','神相':'#879ce0','碎梦':'#74bacb','龙吟':'#59ae92','玄机':'#a9b94f','鸿音':'#cba343','潮光':'#359bd1','沧澜':'#3663a0'};
const teamNames=['进攻团','防守团'];
const jobColor=job=>colors[job.split('·')[0]];
const healing=job=>['素问·素心','鸿音·妙音'].includes(job);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const button=(label,action,extra='')=>`<button type="button" data-action="${action}" ${extra}>${label}</button>`;
const opt=(value,label,active)=>`<option value="${esc(value)}" ${String(value)===String(active)?'selected':''}>${esc(label)}</option>`;
const select=(label,key,values,value)=>`<label>${label}<select name="${key}">${values.map(item=>opt(item,item,value)).join('')}</select></label>`;
const field=(label,key,type='text',extra='')=>`<label>${label}<input name="${key}" type="${type}" ${extra} required></label>`;
const submit=label=>`<div class="actions"><button type="submit" class="primary">${label}</button></div>`;
const dt=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const dates=value=>dt.format(new Date(value));
const localInput=value=>value?new Date(Date.parse(value)+8*3600000).toISOString().slice(0,16):'';
const entryOf=id=>event?.entries.find(item=>item.id===id);
const myEntry=()=>entryOf(account.user?.id);
const at=(team,squad,seat)=>event.entries.find(item=>item.place?.team===team&&item.place.squad===squad&&item.place.seat===seat);
const position=entry=>`${teamNames[entry.place.team]} · ${entry.place.squad+1} 队 · ${entry.place.seat+1} 号位`;
const invitationInput=field('统一邀请码','invite','password','autocomplete="off" minlength="10" maxlength="128"');
const passwordInput=field('个人密码','password','password','autocomplete="new-password" minlength="10" maxlength="128"');
const idInput=field('游戏 ID','name','text','autocomplete="username" maxlength="50"');
const stateNames={approved:'已审核',pending:'待审核',unregistered:'未注册'};

async function api(path,data){
  const init=data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)};
  const response=await fetch('/api/'+path,init);
  const payload=await response.json();
  if(!response.ok)throw Object.assign(Error(payload.error||'操作失败'),{status:response.status});
  return payload;
}
function say(message='',error=false){
  notice.hidden=!message;
  notice.classList.toggle('error',error);
  notice.textContent=message;
}
async function run(task){
  if(busy)return;
  busy=true;
  const current=document.activeElement;
  if(current instanceof HTMLButtonElement)current.disabled=true;
  say();
  try{await task();}catch(err){say(err.message,true);}
  finally{busy=false;if(current instanceof HTMLButtonElement)current.disabled=false;}
}
function setEventId(id){
  eventId=id;
  const url=new URL(location.href);
  if(id)url.searchParams.set('event',id);else url.searchParams.delete('event');
  history.replaceState(null,'',url);
}
async function loadEvent(){
  event=eventId?await api('event?id='+encodeURIComponent(eventId)):null;
}
async function sync(){
  account=await api('me');
  event=null;
  if(account.admin||account.user?.status==='approved'){
    events=await api('events');
    if(account.admin) members=await api('admin/users');
    if(!eventId&&events.length)setEventId(events.at(-1).id);
    if(eventId&&events.some(item=>item.id===eventId))await loadEvent();
    if(eventId&&!event)say('该活动尚未发布或已不存在',true);
    if(myEntry()?.place)side=myEntry().place.team;
  }else{
    events=[];
    members=[];
  }
  render();
}
function authPage(){
  const mode=account.needsSetup?'setup':authMode;
  if(mode==='setup')return `<section class="content"><form class="panel narrow stack" data-form="setup"><h2>首次设置</h2><p class="muted">请使用服务启动时显示的初始化码，为 admin 设置密码。</p>${field('初始化码','code','password','autocomplete="off"')}${field('管理员密码','password','password','autocomplete="new-password" minlength="10"')}${invitationInput}${submit('完成设置')}</form></section>`;
  const labels={login:'登录',register:'注册并提交审核',reset:'重置密码'};
  const loginPassword=field('密码','password','password','autocomplete="current-password"');
  return `<section class="content"><form class="panel narrow stack" data-form="${mode}"><h2>${labels[mode]}</h2>${idInput}
    ${mode==='register'?invitationInput:''}${mode==='reset'?field('一次性重置码','code','text','autocomplete="one-time-code"'):''}
    ${mode==='login'?loginPassword:passwordInput}${submit(labels[mode])}
    <div class="actions">${Object.entries({login:'返回登录',register:'首次注册',reset:'忘记密码'}).filter(([id])=>id!==mode).map(([id,label])=>button(label,'auth-'+id)).join('')}</div>
    </form></section>`;
}
function nav(){
  const pages=account.admin?{roster:'全团编队',admin:'活动管理',members:'成员管理'}:{signup:'我的报名',roster:'全团编队',profile:'个人资料'};
  if(!Object.hasOwn(pages,tab))tab=account.admin?'admin':'signup';
  const name=account.admin?'管理员':account.user.name;
  return `<nav class="bar" aria-label="页面"><div class="nav-tabs">${Object.entries(pages).map(([id,label])=>button(label,'tab-'+id,`aria-pressed="${tab===id}"`)).join('')}</div>
    <div class="nav-person"><span class="avatar" aria-hidden="true">${esc([...name][0])}</span><span class="identity">${esc(name)}</span>${button('退出','logout','class="quiet"')}</div></nav>`;
}
function choiceFields(choice={}){
  return select('本场职业与姿态','job',account.jobs,choice.job)+select('参战团','team',teamNames,choice.team)+
    select('职责','duty',account.duties,choice.duty||'拆塔');
}
function selectEvent(){
  if(!events.length)return '';
  return `<label class="event-picker">活动<select id="event-select">${events.map(item=>opt(item.id,item.title+(item.published?'':'（草稿）'),eventId)).join('')}</select></label>`;
}
function pageHeading(title,controls=''){
  return `<div class="page-heading"><h2>${title}</h2>${controls}</div>`;
}
function timing(){
  return `<dl class="event-timing"><div><dt>开打时间</dt><dd>${dates(event.starts)}</dd></div><div><dt>报名截止</dt><dd>${dates(event.deadline)}</dd></div></dl>`;
}
function reason(entry){
  if(healing(entry.job)&&event.entries.filter(item=>item.place&&healing(item.job)).length>=14)return '全场治疗已达 14 人';
  return entry.team+'暂无可用的'+entry.duty+'位';
}
function signup(){
  const mine=myEntry();
  const latest=mine||account.user.last;
  const status=mine?.place?'已报名 · '+position(mine):mine?'候补 · '+reason(mine):'待报名';
  const closed=!mine&&Date.now()>=Date.parse(event.deadline);
  return `<section class="content stack">${pageHeading('我的报名',selectEvent())}<article class="event-sheet">
    <header class="event-masthead"><div class="summary"><h3>${esc(event.title)}</h3><span class="badge ${mine?.place?'positive':mine?'pending':''}">${esc(status)}</span></div>${timing()}</header>
    <form class="stack signup-form" data-form="signup">
      ${latest?`<dl class="choice-recap"><div><dt>职业与姿态</dt><dd class="badge job" style="--job:${jobColor(latest.job)}">${esc(latest.job)}</dd></div><div><dt>参战团</dt><dd>${esc(latest.team)}</dd></div><div><dt>职责</dt><dd>${esc(latest.duty)}</dd></div></dl>`:''}
      <div id="choices" class="form-grid" ${latest?'hidden':''}>${choiceFields(latest)}</div>
      <div class="actions signup-actions">${closed?'<span class="muted">本场报名已截止</span>':`<button class="primary" type="submit">${mine?'更新报名':'确认报名'}</button>${latest?button('修改选择','edit-choice'):''}`}
      ${mine?.place?button('查看我的位置','locate'):''}${mine?button('取消报名','cancel','class="quiet"'):''}</div>
    </form></article></section>`;
}
function roster(){
  const mine=myEntry();
  const active=event.entries.filter(item=>item.place);
  const waiting=event.entries.filter(item=>!item.place).sort((a,b)=>a.order-b.order);
  const headings=event.plans[side].map((roles,squad)=>{
    const squadMembers=active.filter(item=>item.place.team===side&&item.place.squad===squad);
    const detail=squad===4&&!event.open[side]?'未开放':squadMembers.length+'/6'+(squadMembers.some(item=>healing(item.job))?'':' · 缺治疗');
    return `<th scope="col">第 ${squad+1} 队<small>${detail}</small></th>`;
  }).join('');
  const rows=Array.from({length:6},(_,seat)=>`<tr><th scope="row">${seat+1}</th>${event.plans[side].map((roles,squad)=>{
    const member=at(side,squad,seat), closed=squad===4&&!event.open[side], leader=squad===0&&seat===0;
    const label=member?.name||(closed?'未开放':leader?'团长预留':roles[seat]+'空位');
    const extra=member?`<small>${esc(member.job)} · ${leader?'团长':roles[seat]}${member===mine?' · 我':''}</small>`:closed&&account.admin?`<small>${roles[seat]}</small>`:'';
    const cls='seat'+(member?' filled':'')+(member&&member===mine?' mine':'')+(closed?' closed':'');
    const style=member?` style="--job:${jobColor(member.job)}"`:'';
    const markup=`<strong>${esc(label)}</strong>${extra}`;
    return `<td>${account.admin?button(markup,'seat',`class="${cls}"${style} data-squad="${squad}" data-seat="${seat}"`):`<div class="${cls}"${style}>${markup}</div>`}</td>`;
  }).join('')}</tr>`).join('');
  return `<section class="content stack">${pageHeading('全团编队',selectEvent())}
    <dl class="roster-stats"><div><dt>正式参战</dt><dd>${active.length}<small> / 60</small></dd></div><div><dt>治疗</dt><dd>${active.filter(item=>healing(item.job)).length}<small> / 14</small></dd></div><div><dt>候补</dt><dd>${waiting.length}</dd></div></dl>
    <div class="roster-board" data-side="${side}">
    <div class="board-toolbar"><div class="team-tabs" aria-label="选择团队">${teamNames.map((label,index)=>button(label,'side-'+index,`aria-pressed="${side===index}"`)).join('')}</div><div class="actions">${button('刷新名单','refresh','class="quiet"')}${button('导出名单图片','export')}</div></div>
    <div class="grid-scroll" tabindex="0" role="region" aria-label="编队网格，可横向滑动"><table><thead><tr><th scope="col">号位</th>${headings}</tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="panel waitlist"><div class="summary"><h3>候补名单</h3>${account.admin&&event.published?button('代成员报名','proxy-signup'):''}</div>${waiting.length?`<ol>${waiting.map(item=>`<li><strong>${esc(item.name)}</strong> · ${esc(item.job)} · ${esc(item.team)} · ${esc(item.duty)}<small class="muted">（${reason(item)}）</small></li>`).join('')}</ol>`:'<p class="muted">暂无候补</p>'}</div></section>`;
}
function profile(){
  return `<section class="content stack">${pageHeading('个人资料')}<form class="panel narrow stack" data-form="rename"><div class="profile-identity"><span class="avatar" aria-hidden="true">${esc([...account.user.name][0])}</span><div><span class="muted">当前游戏 ID</span><h3>${esc(account.user.name)}</h3></div></div>
    ${account.user.rename?`<p class="muted">待审核的新 ID　${esc(account.user.rename)}</p>`:''}
    ${field('新游戏 ID','name','text','maxlength="50"')}${submit('提交改名申请')}</form></section>`;
}
function adminEvents(){
  return `<section class="content stack">${pageHeading('活动管理',button('创建帮战','create-event','class="primary"'))}${selectEvent()}
    ${event?`<article class="event-sheet"><header class="event-masthead"><div class="summary"><h3>${esc(event.title)}</h3><span class="badge ${event.published?'positive':'pending'}">${event.published?'已发布':'草稿'}</span></div>${timing()}</header><div class="actions signup-form">${button('编辑当前活动','edit-event')}${event.published?button('复制活动链接','share','class="primary"'):''}</div></article>`:'<div class="panel empty"><h3>还没有活动</h3><p class="muted">创建帮战后，可以在这里编辑和分享报名链接。</p></div>'}
    </section>`;
}
function memberPage(){
  return `<section class="content stack">${pageHeading('成员管理',`<div class="actions">${button('导入名册','import','class="primary"')}${button('更换统一邀请码','invite')}</div>`)}
    <div class="member-board"><div class="summary member-heading"><h3>成员名册 · ${members.length} 人</h3><span class="badge pending">待审核 ${members.filter(item=>item.status==='pending'||item.rename).length} 人</span></div>
    <div class="member-list">${members.slice().sort((a,b)=>Number(b.status==='pending'||Boolean(b.rename))-Number(a.status==='pending'||Boolean(a.rename))).map(item=>`<div class="member-row"><div class="profile-identity"><span class="avatar" aria-hidden="true">${esc([...item.name][0])}</span><div><strong>${esc(item.name)}</strong> <span class="badge ${item.status==='approved'?'positive':item.status==='pending'?'pending':''}">${stateNames[item.status]}</span>
      ${item.rename?`<p class="muted">申请改名为 ${esc(item.rename)}</p>`:''}${item.history.length?`<small class="muted">曾用 ID　${item.history.map(esc).join('、')}</small>`:''}</div></div><div class="actions">
      ${item.status==='pending'?button('通过','approve',`data-id="${item.id}"`)+button('退回','reject',`data-id="${item.id}"`):''}
      ${button(item.rename?'审核改名':'代改 ID','member-name',`data-id="${item.id}"`)}
      ${item.status!=='unregistered'?button('重置密码','member-reset',`data-id="${item.id}"`):''}</div></div>`).join('')}</div></div></section>`;
}
function render(){
  shell.classList.toggle('is-auth',!account.admin&&(!account.user||account.user.status==='pending'));
  eventTime.hidden=!event||tab==='signup'||tab==='admin';
  eventTime.textContent=event?`${dates(event.starts)} 开打`:'';
  if(!account.admin&&!account.user){root.innerHTML=authPage();return;}
  if(account.user?.status==='pending'){
    root.innerHTML=`<section class="content"><div class="panel narrow stack"><span class="badge pending">审核中</span><h2>等待管理员审核</h2><p>${esc(account.user.name)} 的注册申请已提交。</p><div class="actions">${button('刷新审核状态','reload','class="primary"')}${button('退出','logout')}</div></div></section>`;
    return;
  }
  const header=nav();
  const view=tab==='members'?memberPage():tab==='admin'?adminEvents():tab==='profile'?profile():
    !event?`<section class="content stack">${selectEvent()}<p class="muted">暂无可查看的活动</p></section>`:tab==='roster'?roster():signup();
  root.innerHTML=header+view;
  const form=root.querySelector('[data-form="signup"]');
  if(form)syncDuty(form);
}
function dialog(title,content){
  editor.innerHTML=`<div class="summary"><h2 id="editor-title">${title}</h2>${button('关闭','close')}</div>${content}`;
  if(!editor.open)editor.showModal();
}
function formDialog(title,key,fields,label){
  dialog(title,`<form class="stack" data-form="${key}">${fields}${submit(label)}</form>`);
  const form=editor.querySelector('form');
  if(form.elements.job)syncDuty(form);
}
function syncDuty(form){
  const {job,duty,team}=form.elements;
  const isHeal=healing(job.value);
  const healOption=[...duty.options].find(item=>item.value==='治疗');
  healOption.hidden=!isHeal;
  healOption.disabled=!isHeal;
  duty.disabled=isHeal;
  if(isHeal)duty.value='治疗';
  else if(!duty.value||duty.value==='治疗')duty.value=team.value===teamNames[0]?'拆塔':'输出';
}
function eventDialog(current){
  formDialog(current?'编辑活动':'创建帮战','event',
    `<input type="hidden" name="event" value="${esc(current?.id)}">${field('活动名称','title','text',`maxlength="80" value="${esc(current?.title)}"`)}
    ${field('开打时间（北京时间）','starts','datetime-local',`value="${localInput(current?.starts)}"`)}
    ${field('报名截止时间（北京时间）','deadline','datetime-local',`value="${localInput(current?.deadline)}"`)}
    ${current?.published?'<p class="muted">该活动已发布</p>':select('发布方式','publish',['发布','保存草稿'],'发布')}`,current?'保存活动':'创建活动');
}
function seatDialog(squad,seat){
  const current=at(side,squad,seat);
  const leader=squad===0&&seat===0;
  const target=`<input type="hidden" name="team" value="${side}"><input type="hidden" name="squad" value="${squad}"><input type="hidden" name="seat" value="${seat}">`;
  const closed=squad===4&&!event.open[side];
  const entries=event.entries.slice().sort((a,b)=>a.order-b.order).filter(item=>item!==current);
  const move=closed?'':`<form class="stack" data-form="assign">${target}
    <label>${leader?'指定已报名的团长':'选择已报名成员'}<select name="id" required>${opt('','请选择成员','')}${entries.map(item=>opt(item.id,item.name+' · '+item.job+(item.place?' · '+position(item):' · 候补'))).join('')}</select></label>
    <input type="hidden" name="swap" value="${Boolean(current)}"><input type="hidden" name="expected" value="${current?.id||''}">${submit(current?'确认交换位置':'确认安排')}</form>`;
  const plan=leader?'':`<form class="stack panel" data-form="plan">${target}${select('位置职责','duty',account.duties,event.plans[side][squad][seat])}${submit('保存职责')}</form>`;
  dialog(teamNames[side]+' · '+(squad+1)+' 队 · '+(seat+1)+' 号位',`<div class="stack"><p>${current?esc(current.name+' · '+current.job):closed?'第五队尚未开放':leader?'团长预留':'空位'}</p>${move}${plan}${current?button('取消该成员报名','admin-cancel',`data-id="${current.id}"`):''}</div>`);
}

async function action(buttonNode){
  const {action:key,id,squad,seat}=buttonNode.dataset;
  if(key.startsWith('auth-')){authMode=key.slice(5);render();return;}
  if(key.startsWith('tab-')){
    tab=key.slice(4);
    if(tab==='roster'&&myEntry()?.place)side=myEntry().place.team;
    if(tab==='roster'&&eventId)await loadEvent();
    if(tab==='members')members=await api('admin/users');
    render();return;
  }
  if(key.startsWith('side-')){side=Number(key.at(-1));render();return;}
  if(key==='reload'){await sync();return;}
  if(key==='close'){editor.close();return;}
  if(key==='logout'){await api('logout',{});await sync();return;}
  if(key==='edit-choice'){const fields=document.querySelector('#choices');fields.hidden=!fields.hidden;return;}
  if(key==='refresh'){await loadEvent();render();return;}
  if(key==='locate'){
    await loadEvent();
    const mine=myEntry();
    if(!mine?.place){render();say('当前位置已变更，请查看最新报名状态');return;}
    side=mine.place.team;tab='roster';render();
    root.querySelector('.mine')?.scrollIntoView({block:'nearest',inline:'center'});
    return;
  }
  if(key==='cancel'){
    if(!confirm('取消本场报名？当前席位可能由候补补入。'))return;
    event=await api('cancel',{event:event.id});await sync();say('已取消报名');return;
  }
  if(key==='create-event'||key==='edit-event'){eventDialog(key==='edit-event'?event:null);return;}
  if(key==='share'){
    const url=new URL(location.href);
    await navigator.clipboard.writeText(url.href).then(()=>say('活动链接已复制'),()=>dialog('活动链接',`<label>复制下方链接<input readonly value="${esc(url.href)}"></label>`));
    return;
  }
  if(key==='seat'){seatDialog(Number(squad),Number(seat));return;}
  if(key==='admin-cancel'){
    if(!confirm('取消该成员的本场报名？空位可能由候补补入。'))return;
    await api('admin/cancel',{event:event.id,id});
    editor.close();await sync();say('已取消该成员本场报名');return;
  }
  if(key==='export'){
    formDialog('导出编队图片','export',select('导出范围','scope',[...teamNames,'两团合图'],teamNames[side]),'下载 PNG');return;
  }
  if(key==='proxy-signup'){
    const choices=members.filter(item=>item.status==='approved').map(item=>opt(item.id,item.name));
    formDialog('代成员报名','proxy',`<label>成员<select name="id" required>${opt('','请选择成员','')}${choices.join('')}</select></label><div class="form-grid">${choiceFields()}</div>`,'确认报名');return;
  }
  if(key==='import'){formDialog('导入名册','import','<label>游戏 ID（每行一个）<textarea name="names" rows="8" required></textarea></label>','导入');return;}
  if(key==='invite'){formDialog('更换统一邀请码','invite',invitationInput,'保存邀请码');return;}
  if(key==='member-name'){
    const member=members.find(item=>item.id===id);
    formDialog('更新成员游戏 ID','member-name',`<input type="hidden" name="id" value="${id}">${field('新游戏 ID','name','text',`maxlength="50" value="${esc(member.rename||member.name)}"`)}`,'确认更改');return;
  }
  if(key==='approve'||key==='reject'){
    await api('admin/member',{id,action:key});await sync();say(key==='approve'?'已通过审核':'已退回，可重新注册');return;
  }
  if(key==='member-reset'){
    const {code}=await api('admin/member',{id,action:'reset'});
    dialog('一次性密码重置码',`<label>请只转交给该成员（1 小时内有效）<input readonly value="${code}"></label>`);return;
  }
}
async function handleForm(form){
  const key=form.dataset.form;
  const data=Object.fromEntries(new FormData(form));
  if(form.elements.duty)data.duty=form.elements.duty.value;
  if(['login','setup','reset','register','rename'].includes(key)){
    try{await api(key,data);}catch(err){
      if(key==='setup'&&err.status===409){authMode='login';await sync();}
      throw err;
    }
    await sync();
    if(key==='rename')say('改名申请已提交');
    return;
  }
  if(key==='signup'){
    data.event=event.id;
    let result=await api('signup',data);
    if(result.confirmWait){
      if(!confirm('新选择暂无合适位置，保存后将释放原位并进入候补。继续吗？'))return;
      result=await api('signup',{...data,confirmWait:true});
    }
    event=result;
    await sync();
    const current=myEntry();
    say(current?.place?'已安排 · '+position(current):current?'已进入候补 · '+reason(current):'报名状态已变动，请刷新查看');return;
  }
  if(key==='export'){
    await loadEvent();
    await saveRosterImage(event,data.scope,jobColor);
    editor.close();return;
  }
  if(key==='event'){
    const result=await api('admin/event',{...data,starts:data.starts+'+08:00',deadline:data.deadline+'+08:00',publish:data.publish==='发布'});
    setEventId(result.id);
  }else if(key==='member-name')await api('admin/member',{...data,action:'rename'});
  else if(key==='plan'||key==='assign'){
    const coords={team:Number(data.team),squad:Number(data.squad),seat:Number(data.seat)};
    await api('admin/'+key,{...data,...coords,event:event.id,swap:data.swap==='true'});
  }else if(key==='proxy')await api('admin/signup',{...data,event:event.id});
  else {
    const result=await api('admin/'+key,data);
    if(key==='import')say('已新增 '+result.count+' 名成员');
  }
  editor.close();
  await sync();
  if(key!=='import')say('已保存');
}
document.addEventListener('click',ev=>{
  const control=ev.target.closest('button[data-action]');
  if(control)run(()=>action(control));
});
document.addEventListener('submit',ev=>{
  if(!ev.target.matches('form[data-form]'))return;
  ev.preventDefault();
  run(()=>handleForm(ev.target));
});
document.addEventListener('change',ev=>{
  const control=ev.target;
  if(control.id==='event-select')run(async()=>{setEventId(control.value);await loadEvent();render();});
  if(control.name==='job'&&control.form?.elements.duty)syncDuty(control.form);
});
run(sync);
