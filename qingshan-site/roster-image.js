const teams=['进攻团','防守团'];
const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'short'});

function textLines(ctx,value,x,y,width,max=2){
  const chars=[...value];
  let line='';
  let row=0;
  for(const [index,char] of chars.entries()){
    const last=row===max-1;
    if(ctx.measureText(line+char+(last&&index<chars.length-1?'…':'')).width>width&&line){
      ctx.fillText(line+(last?'…':''),x,y+row*25);
      if(last)return;
      row++;
      line='';
    }
    line+=char;
  }
  ctx.fillText(line,x,y+row*25);
}

export async function saveRosterImage(event,scope,jobColor){
  const sides=scope==='两团合图'?[0,1]:[teams.indexOf(scope)];
  const canvas=document.createElement('canvas');
  canvas.width=1100;
  canvas.height=145+sides.length*615;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f6f8f2';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#23503a';
  ctx.font='bold 44px "Microsoft YaHei", sans-serif';
  ctx.fillText('青山帮战编队',32,60);
  ctx.fillStyle='#344e40';
  ctx.font='22px "Microsoft YaHei", sans-serif';
  textLines(ctx,event.title+' · 开打 '+time.format(new Date(event.starts)),32,98,1030,1);
  ctx.font='17px "Microsoft YaHei", sans-serif';
  ctx.fillText('生成于 '+time.format(new Date()),32,126);
  for(const [index,side] of sides.entries()){
    const top=151+index*615;
    ctx.fillStyle='#23503a';
    ctx.font='bold 27px "Microsoft YaHei", sans-serif';
    ctx.fillText(teams[side],32,top+29);
    for(let squad=0;squad<5;squad++){
      const x=77+squad*200;
      const closed=squad===4&&!event.open[side];
      ctx.fillStyle='#e6f1e8';
      ctx.fillRect(x,top+41,190,36);
      ctx.fillStyle='#294638';
      ctx.font='bold 19px "Microsoft YaHei", sans-serif';
      ctx.fillText('第 '+(squad+1)+' 队',x+11,top+65);
      for(let seat=0;seat<6;seat++){
        const y=top+84+seat*83;
        if(squad===0){
          ctx.fillStyle='#52685c';
          ctx.font='19px "Microsoft YaHei", sans-serif';
          ctx.fillText(String(seat+1).padStart(2,'0'),34,y+41);
        }
        const member=event.entries.find(item=>item.place?.team===side&&item.place.squad===squad&&item.place.seat===seat);
        const leader=squad===0&&seat===0;
        const role=event.plans[side][squad][seat];
        ctx.fillStyle=closed?'#edf0ed':'#fffefa';
        ctx.fillRect(x,y,190,75);
        if(member){
          ctx.globalAlpha=.16;
          ctx.fillStyle=jobColor(member.job);
          ctx.fillRect(x,y,190,75);
          ctx.globalAlpha=1;
        }
        ctx.fillStyle='#20392f';
        ctx.font='bold 19px "Microsoft YaHei", sans-serif';
        textLines(ctx,member?.name||(closed?'未开放':leader?'团长预留':role+'空位'),x+10,y+24,170);
        if(member){
          ctx.font='15px "Microsoft YaHei", sans-serif';
          ctx.fillStyle='#455e50';
          ctx.fillText(member.job+' · '+(leader?'团长':role),x+10,y+67);
        }
      }
    }
  }
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('无法生成名单图片');
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download='青山帮战编队-'+scope+'.png';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30_000);
}
