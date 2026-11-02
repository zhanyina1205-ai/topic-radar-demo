import {baseProfile, day, lanes, ranked} from "./assets/recommend.js";

const el = id => document.getElementById(id);
const lane = el("lane"), period = el("period");
const platforms = ["全部平台","抖音","微博"];
const dates = Array.from({length:7}, (_,i) => day(Date.now()-i*86400000));
const slices = new Map();
let selected = platforms[0], onlySaved = false, loading = true;
let saved;
try { saved = JSON.parse(localStorage.getItem("radar-public-collection") || "{}") || {}; }
catch { saved = {}; }
const node = (tag, value, cls) => {
  const item = document.createElement(tag);
  if(value) item.textContent = value;
  if(cls) item.className = cls;
  return item;
};
function showCard(card, i) {
  const story = node("article", "", "story"), body = node("div", "", "storybody");
  const ref = card.refs[0];
  body.append(node("div", ref.platform+"　·　"+ref.date+"　·　话题归档","chips"));
  const detail = node("details"); detail.append(node("summary", card.title),node("p",card.reason),node("p",card.opening));
  const ol = node("ol"); for(const step of card.outline) ol.append(node("li",step)); detail.append(ol);
  for(const s of card.refs) {
    let u; try {u = new URL(s.url)}catch {continue}
    if(u.protocol!=="https:"||!["s.weibo.com","www.douyin.com"].includes(u.hostname)) continue;
    const a = node("a",s.platform+" · "+s.title+" ↗");a.href=u.href;a.target="_blank";a.rel="noreferrer";
    const p=node("p");p.append(a);detail.append(p);
  }
  body.append(detail,node("p",card.timing,"storyfoot"));
  const id=lane.value+"|"+card.key, star=node("button",saved[id]?"★":"☆","save");
  star.setAttribute("aria-label",saved[id]?"取消收藏":"收藏选题");star.setAttribute("aria-pressed",String(!!saved[id]));
  star.onclick=()=>{if(saved[id])delete saved[id];else saved[id]={lane:lane.value,card};try{localStorage.setItem("radar-public-collection",JSON.stringify(saved));}catch{el("saved-status").textContent="当前浏览器无法保存，收藏仅在本次访问有效。";}render();};
  story.append(node("span",String(i+1).padStart(2,"0"),"idx"),body,star);return story;
}
function render() {
  const rows=[...slices.values()].flat(), latest=rows.reduce((a,b)=>a>b.date?a:b.date,"");
  const stale=latest && latest<dates[6];
  const now=stale?Date.parse(latest+"T23:59:59+08:00"):Date.now();
  el("coverage").textContent=(loading?"正在检查最近 7 天的公开归档。 ":"")+(latest?(stale?"当前为历史试读，筛选相对于 "+latest+"。":"最新可用归档 "+latest+"。"):"暂无可用归档。")+" 点击选题标题查看提纲和出处。";
  el("heading").textContent=lane.value+(onlySaved?" · 我的收藏":" · 推荐");
  const profile=baseProfile(lane.value);
  const cards=onlySaved?Object.values(saved).filter(s=>s?.lane===lane.value && s.card?.refs?.length && (selected===platforms[0] || s.card.refs.some(r=>r.platform===selected))).map(s=>s.card):
    ranked(profile,rows.filter(s=>selected===platforms[0]||s.platform===selected),{},Number(period.value),now).slice(0,5);
  period.disabled=onlySaved;
  el("cards").replaceChildren(...(cards.length?cards.map(showCard):[node("p",onlySaved?"这个赛道还没有匹配的收藏。":"这个范围暂时没有匹配选题，可切换赛道或放宽筛选。","empty")]));
  el("saved").textContent=onlySaved?"返回赛道推荐":"查看我的收藏";el("saved").setAttribute("aria-pressed",String(onlySaved));
  for(const b of el("filters").children){const on=b.textContent===selected;b.className=on?"sel":"";b.setAttribute("aria-pressed",String(on))}
}
for(const v of Object.keys(lanes))lane.add(new Option(v,v));
for(const v of platforms){const b=node("button",v);b.onclick=()=>{selected=v;render()};el("filters").append(b)}
lane.onchange=period.onchange=render;el("saved").onclick=()=>{onlySaved=!onlySaved;render()};el("date").textContent=day().replaceAll("-"," / ");
async function refresh(platform,date){
 const weibo=platform==="微博", path=weibo?"justjavac/weibo-trending-hot-search/HEAD/raw/"+date+".json":"SnailDev/douyin-hot-hub/HEAD/raw/"+date+"/hot-search.json";
 const res=await fetch("https://raw.githubusercontent.com/"+path,{signal:AbortSignal.timeout(6500)});if(!res.ok)return;
 const data=await res.json(); const rows=weibo?data.filter(s=>s.title&&s.url?.startsWith("/weibo?")).map(s=>({title:s.title,url:"https://s.weibo.com"+s.url,date,platform})):
   data.data.word_list.filter(w=>w.word&&w.position>0).map(w=>({title:w.word,url:"https://www.douyin.com/search/"+encodeURIComponent(w.word),date,platform,at:Date.parse(data.data.active_time.replace(" ","T")+"+08:00"),rank:w.position}));
 if(rows.length)slices.set(platform+date,rows);
}
async function start(){
 try{const res=await fetch("./assets/snapshot.json");if(res.ok){for(const s of (await res.json()).rows){const key=s.platform+s.date;if(!slices.has(key))slices.set(key,[]);slices.get(key).push(s)}}}catch{}
 render();await Promise.allSettled(dates.flatMap(d=>platforms.slice(1).map(p=>refresh(p,d))));loading=false;render();
}
start();
