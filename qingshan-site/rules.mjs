export const teams = ['进攻团', '防守团'];
export const duties = ['拆塔', '保镖', '输出', '机动', '治疗'];
export const jobs = ['九灵','玄机','潮光','神相','碎梦','血河','龙吟','铁衣·御','铁衣·破',
  '沧澜·狂澜','沧澜·镇海','鸿音·惊鸿','鸿音·妙音','素问·天问','素问·素心'];
export const heal = job => ['鸿音·妙音', '素问·素心'].includes(job);

function squad(main, last=main) {
  return [main, main, main, main, '治疗', last];
}

export function planFor(team) {
  return team === teams[0]
    ? [squad('拆塔','保镖'), squad('拆塔','保镖'), squad('保镖'), squad('机动'), squad('机动')]
    : [squad('输出'), squad('输出'), squad('输出'), squad('机动'), squad('机动')];
}

export function newEvent(title, starts, deadline, id) {
  return { id, title, starts, deadline, published: false, entries: [], order: 0,
    plans: teams.map(planFor), open: [false,false] };
}

export function validChoice(job, team, duty) {
  return jobs.includes(job) && teams.includes(team) &&
    (heal(job) ? duty==='治疗' : duties.slice(0,4).includes(duty));
}

export function occupant(event, team, squad, seat) {
  return event.entries.find(entry => entry.place?.team===team &&
    entry.place.squad===squad && entry.place.seat===seat);
}

export function canPlace(event, entry, place, allowLeader=false) {
  const {team,squad,seat}=place;
  if (![team,squad,seat].every(Number.isInteger) || team<0 || team>1 ||
    squad<0 || squad>(event.open[team]?4:3) || seat<0 || seat>5) return false;
  const leader=squad===0&&seat===0;
  if (occupant(event,team,squad,seat) || (leader&&!allowLeader)) return false;
  const role=event.plans[team][squad][seat];
  if (!leader && (heal(entry.job)!==(role==='治疗'))) return false;
  if (!heal(entry.job)) return true;
  const active=event.entries.filter(other=>other.place&&heal(other.job));
  const local=active.filter(other=>other.place.team===team&&other.place.squad===squad);
  return active.length<14 && local.length<2;
}

export function fill(event) {
  const waiting=event.entries.filter(entry=>!entry.place).sort((a,b)=>a.order-b.order);
  const hasFilledBase=team=>event.plans[team].slice(0,4).every((roles,i)=>
    roles.every((_,j)=>(i===0&&j===0)||occupant(event,team,i,j)));
  function nextPlace(entry,team){
    for(let squad=0;squad<(event.open[team]?5:4);squad++){
      for (let seat=0;seat<6;seat++) {
        const place={team,squad,seat};
        if(entry.duty===event.plans[team][squad][seat]&&canPlace(event,entry,place))return place;
      }
    }
    return null;
  }
  let opened;
  do{
    opened=false;
    for(let team=0;team<2;team++)if(!event.open[team]&&hasFilledBase(team)){
      event.open[team]=true;
      opened=true;
    }
    for(const entry of waiting)if(!entry.place)entry.place=nextPlace(entry,teams.indexOf(entry.team));
    for(let team=0;team<2;team++)if(!event.open[team]&&hasFilledBase(team)){
      event.open[team]=true;
      opened=true;
    }
  }while(opened);
}

export function applyChoice(event, id, choice) {
  let entry=event.entries.find(item=>item.id===id);
  if(!entry){
    entry={id,order:++event.order,place:null};
    event.entries.push(entry);
  }
  if(entry.team!==choice.team||entry.duty!==choice.duty) {
    if(entry.place && !(entry.place.squad===0&&entry.place.seat===0&&
      entry.team===choice.team&&heal(entry.job)===heal(choice.job))) entry.place=null;
  }
  Object.assign(entry,choice);
  fill(event);
  return entry;
}
