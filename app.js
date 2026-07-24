
const STORAGE_KEY = "biumchaeum_v19_bookings";
const WORK_KEY = "biumchaeum_v19_working";
const ADMIN_PASSWORD = "1011";
const TIMES = ["09:00","10:30","12:00","13:30","15:00","16:30","18:00","19:30"];

const $ = (id) => document.getElementById(id);
const today = new Date();
const dateKey = today.toISOString().slice(0,10);
$("todayLabel").textContent = `${today.getMonth()+1}월 ${today.getDate()}일 예약`;

let bookings = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
let working = localStorage.getItem(WORK_KEY) === "true";
let watchId = null;
let map, vehicleMarker, locationMarker;
let manualCompleteUntil = 0;

const taereung = [37.6179, 127.0750];
map = L.map("map", {zoomControl:true}).setView(taereung, 14);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom:19, attribution:"&copy; OpenStreetMap"
}).addTo(map);
locationMarker = L.marker(taereung).addTo(map).bindPopup("태릉입구역").openPopup();

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
}
function todayBookings(){
  return bookings.filter(b => b.date === dateKey).sort((a,b)=>a.time.localeCompare(b.time));
}
function slotNow(){
  const now = new Date();
  const mins = now.getHours()*60+now.getMinutes();
  return todayBookings().find(b=>{
    const [h,m]=b.time.split(":").map(Number);
    const start=h*60+m;
    return mins>=start && mins<start+90;
  });
}
function renderSlots(){
  const list = $("slots");
  list.innerHTML="";
  TIMES.forEach(time=>{
    const b = todayBookings().find(x=>x.time===time);
    const current = b && slotNow()?.id===b.id && Date.now()>manualCompleteUntil;
    const el=document.createElement("div");
    el.className="slot"+(b?" busy":"")+(current?" current":"");
    el.innerHTML=b
      ? `<strong>${time} · ${current?"작업중":"예약됨"}</strong><span>${escapeHtml(b.area)} · ${escapeHtml(b.job)}</span><span>${escapeHtml(b.name)} / ${escapeHtml(b.phone)}</span>`
      : `<strong>${time} · 예약 가능</strong><span>시간을 선택해 예약하세요</span>`;
    list.appendChild(el);
  });
  const select=$("time");
  const chosen=select.value;
  select.innerHTML='<option value="">시간 선택</option>'+TIMES.map(t=>{
    const used=todayBookings().some(b=>b.time===t);
    return `<option value="${t}" ${used?"disabled":""}>${t}${used?" (예약됨)":""}</option>`;
  }).join("");
  if([...select.options].some(o=>o.value===chosen&&!o.disabled)) select.value=chosen;
  renderStatus();
  renderAdmin();
}
function renderStatus(){
  const current = Date.now()>manualCompleteUntil ? slotNow() : null;
  let title="😊 지금 가능", loc=working?"📍 이동 중":"📍 태릉입구역 부근 대기중", badge="😊 가능";
  if(current){ title="🧹 작업중"; loc=`📍 ${current.area} · ${current.job}`; badge="🧹 작업중"; }
  else if(!working){ title="🌙 오늘 업무 종료"; loc="📍 GPS가 중지되었습니다"; badge="🌙 종료"; }
  $("statusTitle").textContent=title;
  $("statusLocation").textContent=loc;
  $("statusBadge").textContent=badge;
  showStatusTemporarily();
}
let hideTimer;
function showStatusTemporarily(){
  clearTimeout(hideTimer);
  $("statusCard").classList.remove("fade");
  $("statusBadge").classList.add("hidden");
  hideTimer=setTimeout(()=>{
    $("statusCard").classList.add("fade");
    $("statusBadge").classList.remove("hidden");
  },5000);
}
$("statusBadge").onclick=showStatusTemporarily;

function inGongneung(lat,lng){
  return lat>37.61 && lat<37.635 && lng>127.065 && lng<127.095;
}
function startWork(){
  working=true; localStorage.setItem(WORK_KEY,"true");
  if(!navigator.geolocation){
    alert("이 기기에서는 위치 기능을 사용할 수 없습니다.");
    renderStatus(); return;
  }
  watchId=navigator.geolocation.watchPosition(pos=>{
    const {latitude:lat, longitude:lng}=pos.coords;
    const shown=inGongneung(lat,lng)?taereung:[lat,lng];
    if(vehicleMarker) map.removeLayer(vehicleMarker);
    vehicleMarker=L.marker(shown,{title:"차량 위치"}).addTo(map).bindPopup(inGongneung(lat,lng)?"공릉동 보호 위치: 태릉입구역":"현재 차량 위치");
    map.setView(shown,15);
    $("statusLocation").textContent=inGongneung(lat,lng)?"📍 태릉입구역 부근 이동중":"📍 현재 위치에서 이동중";
  },err=>{
    console.warn(err); $("statusLocation").textContent="📍 위치 권한을 확인해주세요";
  },{enableHighAccuracy:true,maximumAge:10000,timeout:15000});
  renderStatus();
}
function endWork(){
  working=false; localStorage.setItem(WORK_KEY,"false");
  if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null}
  if(vehicleMarker){map.removeLayer(vehicleMarker);vehicleMarker=null}
  map.setView(taereung,14);
  renderStatus();
}
$("workStartBtn").onclick=startWork;
$("workEndBtn").onclick=endWork;
$("completeBtn").onclick=()=>{
  manualCompleteUntil=Date.now()+90*60*1000;
  renderStatus(); renderSlots();
  $("formMessage").textContent="작업 완료 처리되었습니다. 지금 예약 가능합니다.";
};

$("bookingForm").addEventListener("submit",e=>{
  e.preventDefault();
  const data={
    id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),
    date:dateKey,time:$("time").value,name:$("name").value.trim(),
    phone:$("phone").value.trim(),area:$("area").value.trim(),job:$("job").value.trim()
  };
  if(!data.time || !data.name || !data.phone || !data.area || !data.job) return;
  if(todayBookings().some(b=>b.time===data.time)){
    $("formMessage").textContent="이미 예약된 시간입니다."; return;
  }
  bookings.push(data); save(); e.target.reset();
  $("formMessage").textContent=`${data.time} 예약이 등록되었습니다.`;
  renderSlots();
});

$("resetTodayBtn").onclick=()=>{
  if(confirm("오늘 예약을 모두 삭제할까요?")){
    bookings=bookings.filter(b=>b.date!==dateKey);save();renderSlots();
  }
};
$("adminBtn").onclick=()=>{$("adminPassword").value="";$("adminMessage").textContent="";$("adminDialog").showModal()};
$("adminLoginBtn").onclick=(e)=>{
  e.preventDefault();
  if($("adminPassword").value===ADMIN_PASSWORD){
    $("adminDialog").close(); renderAdmin(); $("adminPanel").showModal();
  } else $("adminMessage").textContent="비밀번호가 올바르지 않습니다.";
};
$("adminCloseBtn").onclick=()=>$("adminPanel").close();
function renderAdmin(){
  const box=$("adminBookings"); if(!box) return;
  const list=todayBookings();
  box.innerHTML=list.length?list.map(b=>`
    <div class="admin-item">
      <strong>${b.time} · ${escapeHtml(b.name)}</strong>
      <div>${escapeHtml(b.phone)} / ${escapeHtml(b.area)}</div>
      <div>${escapeHtml(b.job)}</div>
      <button data-delete="${b.id}">삭제</button>
    </div>`).join(""):"오늘 예약이 없습니다.";
  box.querySelectorAll("[data-delete]").forEach(btn=>btn.onclick=()=>{
    bookings=bookings.filter(b=>b.id!==btn.dataset.delete);save();renderSlots();
  });
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
setInterval(()=>{renderSlots()},60000);
renderSlots();

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js"));
}
