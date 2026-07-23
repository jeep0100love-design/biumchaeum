
const STORAGE_KEY = "biumchaeum_v5";
const ADMIN_PIN = "1004"; // 실제 운영 전 반드시 변경하세요.
const TAEREUNG = { lat: 37.6174, lng: 127.0750 };
const GONGNEUNG_CENTER = { lat: 37.6265, lng: 127.0785 };
const GONGNEUNG_RADIUS_M = 2400;

const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {
  bookingOpen: true,
  working: false,
  reservations: [],
  sharedLocation: null
};

let watchId = null;
let marker = null;
let accuracyCircle = null;
let isAdmin = false;

const $ = id => document.getElementById(id);
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

function toast(msg){
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"), 2400);
}

function createTimes(select){
  select.innerHTML = "";
  for(let h=8; h<=21; h++){
    for(const m of [0,30]){
      if(h===21 && m===30) continue;
      const t = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      const o = document.createElement("option");
      o.value=t; o.textContent=t; select.appendChild(o);
    }
  }
}
createTimes($("reserveTime"));
createTimes($("editTime"));
$("reserveDate").value = new Date().toISOString().slice(0,10);

const map = L.map("map").setView([TAEREUNG.lat, TAEREUNG.lng], 14);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

function distanceM(a,b){
  const R=6371000, toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLng=toRad(b.lng-a.lng);
  const s=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}

function publicLocation(raw){
  if(distanceM(raw,GONGNEUNG_CENTER)<=GONGNEUNG_RADIUS_M){
    return {...TAEREUNG, label:"태릉입구역 부근 대기중", privacy:true, accuracy:0};
  }
  return {...raw, label:"현재 이동중", privacy:false};
}

function renderMap(){
  let loc;
  if(state.working && state.sharedLocation){
    loc = state.sharedLocation;
    $("locationText").textContent = `📍 ${loc.label}`;
    $("liveBadge").textContent="LIVE";
    $("liveBadge").className="badge on";
  }else{
    loc = {...TAEREUNG, label:"오늘은 위치 공유가 종료되었습니다."};
    $("locationText").textContent = "📍 오늘은 위치 공유가 종료되었습니다.";
    $("liveBadge").textContent="OFF";
    $("liveBadge").className="badge off";
  }
  const ll=[loc.lat,loc.lng];
  if(!marker) marker=L.marker(ll).addTo(map);
  else marker.setLatLng(ll);
  marker.bindPopup(loc.label).openPopup();
  map.setView(ll, state.working?15:14);
  if(accuracyCircle){ map.removeLayer(accuracyCircle); accuracyCircle=null; }
  if(state.working && loc.accuracy && !loc.privacy){
    accuracyCircle=L.circle(ll,{radius:loc.accuracy}).addTo(map);
  }
}

function renderStatus(){
  $("shopStatus").textContent = state.bookingOpen ? "😊 예약 가능" : "😢 예약 불가";
  $("reserveBtn").disabled = !state.bookingOpen;
  $("reserveBtn").textContent = state.bookingOpen ? "예약 신청하기 😊" : "지금은 예약이 어려워요 😢";
}

function occupied(date,time,ignoreId=null){
  return state.reservations.some(r=>r.id!==ignoreId && r.date===date && r.time===time && !["취소"].includes(r.status));
}

$("reserveBtn").addEventListener("click", ()=>{
  if(!state.bookingOpen) return toast("지금은 예약을 받지 않고 있어요 😢");
  const r={
    id: crypto.randomUUID(),
    name:$("customerName").value.trim(),
    phone:$("customerPhone").value.trim(),
    dong:$("customerDong").value.trim(),
    date:$("reserveDate").value,
    time:$("reserveTime").value,
    memo:$("memo").value.trim(),
    status:"신청",
    createdAt:new Date().toISOString()
  };
  if(!r.name || !r.phone || !r.date) return toast("이름, 연락처, 날짜를 확인해주세요.");
  if(occupied(r.date,r.time)) return toast("이미 예약된 시간이에요. 다른 시간을 골라주세요 😢");
  state.reservations.push(r); save(); renderReservations();
  toast("🎉 감사합니다! 예약이 접수되었습니다 💙");
  // Firebase Cloud Function 또는 FCM 호출 위치
});

$("adminLoginBtn").addEventListener("click", ()=>{
  if(isAdmin){
    isAdmin=false; $("adminPanel").classList.add("hidden"); $("adminLoginBtn").textContent="관리자 열기"; return;
  }
  const pin=prompt("관리자 비밀번호를 입력하세요.");
  if(pin===ADMIN_PIN){
    isAdmin=true; $("adminPanel").classList.remove("hidden"); $("adminLoginBtn").textContent="관리자 닫기"; renderReservations();
  } else toast("비밀번호가 맞지 않아요.");
});

$("toggleBookingBtn").addEventListener("click", ()=>{
  state.bookingOpen=!state.bookingOpen; save(); renderStatus();
  toast(state.bookingOpen?"😊 예약을 다시 받습니다.":"😢 예약 접수를 잠시 닫았습니다.");
});

function startLocation(){
  if(!navigator.geolocation) return toast("이 기기에서는 위치 기능을 사용할 수 없습니다.");
  if(watchId!==null) navigator.geolocation.clearWatch(watchId);
  state.working=true; save(); renderMap();
  watchId=navigator.geolocation.watchPosition(pos=>{
    const raw={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy};
    state.sharedLocation=publicLocation(raw);
    save(); renderMap();
    // Firebase Realtime Database 또는 Firestore 전송 위치
  }, err=>{
    toast("위치 권한을 허용해주세요.");
    console.error(err);
  },{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  toast("🟢 출근했습니다. 위치 공유를 시작합니다.");
}

function stopLocation(){
  if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null;}
  state.working=false; state.sharedLocation=null; save(); renderMap();
  toast("🔴 퇴근했습니다. 위치 공유가 완전히 중지되었습니다.");
}
$("startWorkBtn").addEventListener("click",startLocation);
$("stopWorkBtn").addEventListener("click",stopLocation);

function renderReservations(){
  const box=$("reservationList");
  if(!state.reservations.length){box.innerHTML='<p class="hint">아직 예약이 없습니다.</p>';return;}
  box.innerHTML="";
  [...state.reservations].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).forEach(r=>{
    const el=document.createElement("div"); el.className="reservation-item";
    el.innerHTML=`
      <div class="reservation-head">
        <strong>${escapeHtml(r.date)} ${escapeHtml(r.time)} · ${escapeHtml(r.name)}</strong>
        <span class="status-pill">${escapeHtml(r.status)}</span>
      </div>
      <p>${escapeHtml(r.phone)} · ${escapeHtml(r.dong||"동네 미입력")}</p>
      <p>${escapeHtml(r.memo||"요청사항 없음")}</p>
      <div class="item-actions">
        <button class="secondary" data-edit="${r.id}">수정</button>
        <button class="danger" data-delete="${r.id}">삭제</button>
      </div>`;
    box.appendChild(el);
  });
  box.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openEdit(b.dataset.edit));
  box.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>{
    if(confirm("이 예약을 삭제할까요?")){
      state.reservations=state.reservations.filter(r=>r.id!==b.dataset.delete);save();renderReservations();toast("예약을 삭제했습니다.");
    }
  });
}
function openEdit(id){
  const r=state.reservations.find(x=>x.id===id); if(!r)return;
  $("editId").value=r.id;$("editName").value=r.name;$("editPhone").value=r.phone;
  $("editDong").value=r.dong;$("editDate").value=r.date;$("editTime").value=r.time;
  $("editStatus").value=r.status;$("editMemo").value=r.memo;
  $("editDialog").showModal();
}
$("saveEditBtn").addEventListener("click",e=>{
  e.preventDefault();
  const id=$("editId").value;
  const r=state.reservations.find(x=>x.id===id); if(!r)return;
  const newDate=$("editDate").value,newTime=$("editTime").value;
  if(occupied(newDate,newTime,id)) return toast("그 시간에는 다른 예약이 있습니다.");
  Object.assign(r,{
    name:$("editName").value.trim(),
    phone:$("editPhone").value.trim(),
    dong:$("editDong").value.trim(),
    date:newDate,time:newTime,status:$("editStatus").value,memo:$("editMemo").value.trim(),
    updatedAt:new Date().toISOString()
  });
  save();renderReservations();$("editDialog").close();
  toast("✏️ 고객 예약을 수정했습니다.");
  // Firebase 연동 시 고객에게 변경 알림 발송 위치
});
function escapeHtml(s=""){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}

renderStatus(); renderMap(); renderReservations();
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
