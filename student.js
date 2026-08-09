import { db, isFirebaseConfigured } from './firebase-service.js';
import { collection, getDocs, doc, setDoc, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const EXAM_COUNT=50, EXAM_SECONDS=75*60, MAX_VIOLATIONS=3;
let questions=[],answers=[],current=0,timeLeft=EXAM_SECONDS,timer=null,active=false,violations=0,student=null,startedAt=null,attemptToken='',registrationId='';
const $=id=>document.getElementById(id);
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a}
function normalize(s){return String(s||'').trim()}
function showRegError(msg){$('registerMsg').textContent=msg;$('registerMsg').classList.remove('hidden')}
function randomToken(){return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`}
async function sha256(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function fetchExam(){
  const snap=await getDocs(collection(db,'questions'));
  const bank=snap.docs.map(d=>({id:d.id,...d.data()})).filter(q=>q.active!==false && Array.isArray(q.options) && q.options.length===4);
  if(bank.length<EXAM_COUNT) throw new Error(`ระบบยังมีข้อสอบพร้อมใช้งานเพียง ${bank.length} ข้อ ต้องมีอย่างน้อย ${EXAM_COUNT} ข้อ กรุณาแจ้งผู้ดูแลระบบ`);
  return shuffle(bank).slice(0,EXAM_COUNT).map(q=>{
    const mixed=shuffle(q.options.map((text,original)=>({text,original})));
    return {id:q.id,level:q.level||'general',q:q.q,options:mixed.map(x=>x.text),originalIndices:mixed.map(x=>x.original)};
  });
}
async function registerAttempt(){
  const regId=await sha256(student.studentId);
  attemptToken=randomToken();
  const ref=doc(db,'registrations',regId);
  await setDoc(ref,{...student,attemptToken,registeredAt:serverTimestamp(),registeredAtClient:new Date().toISOString(),status:'started'});
  return regId;
}
async function start(){
  $('registerMsg').classList.add('hidden');
  if(!isFirebaseConfigured()) return showRegError('เว็บไซต์ยังไม่ได้เชื่อม Firebase กรุณาแจ้งผู้ดูแลระบบให้ตั้งค่า firebase-config.js');
  const name=normalize($('name').value),studentId=normalize($('studentId').value),className=normalize($('className').value),department=normalize($('department').value);
  if(!name||!studentId||!className||!department) return showRegError('กรุณากรอกชื่อ ชั้น/กลุ่มเรียน แผนกวิชา และเลขนักศึกษาให้ครบถ้วน');
  if(!$('accept').checked) return showRegError('กรุณายืนยันว่าได้อ่านคำชี้แจงก่อนเข้าสอบ');
  $('startBtn').disabled=true;$('startBtn').textContent='กำลังลงทะเบียน...';
  try{
    student={name,studentId,className,department};
    questions=await fetchExam();
    registrationId=await registerAttempt();
  }catch(e){
    console.error(e);$('startBtn').disabled=false;$('startBtn').textContent='ลงทะเบียนและเริ่มสอบ';
    if(e?.code==='permission-denied') return showRegError('เลขนักศึกษานี้มีประวัติลงทะเบียนสอบแล้ว หรือสิทธิ์ฐานข้อมูลไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ');
    return showRegError(e?.message||'ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่');
  }
  startedAt=new Date().toISOString(); answers=new Array(EXAM_COUNT).fill(-1); $('screen-register').classList.add('hidden');$('screen-exam').classList.remove('hidden'); buildNav();buildWatermark();active=true;
  try{await document.documentElement.requestFullscreen?.()}catch{}
  render();startTimer();
}
function buildWatermark(){const w=$('watermark');w.innerHTML='';for(let i=0;i<30;i++){const s=document.createElement('span');s.textContent=`${student.name} · ${student.studentId}`;w.appendChild(s)}w.classList.remove('hidden')}
function buildNav(){const nav=$('nav');nav.innerHTML='';questions.forEach((_,i)=>{const b=document.createElement('button');b.textContent=i+1;b.onclick=()=>{current=i;render()};nav.appendChild(b)})}
function render(){const q=questions[current];$('qLabel').textContent=`ข้อที่ ${current+1} จาก ${EXAM_COUNT}`;$('qText').textContent=q.q;$('progress').style.width=`${(current+1)/EXAM_COUNT*100}%`;const wrap=$('options');wrap.innerHTML='';['ก','ข','ค','ง'].forEach((letter,i)=>{const lab=document.createElement('label');lab.className='option'+(answers[current]===i?' selected':'');lab.innerHTML=`<input type="radio" name="ans" ${answers[current]===i?'checked':''}><span class="letter">${letter}.</span><span>${escapeHtml(q.options[i])}</span>`;lab.onclick=()=>{answers[current]=i;render()};wrap.appendChild(lab)});requestAnimationFrame(()=>{const items=[...wrap.querySelectorAll('.option')];items.forEach(x=>x.style.minHeight='0px');const h=Math.max(...items.map(x=>x.scrollHeight));items.forEach(x=>x.style.minHeight=h+'px')});$('prevBtn').disabled=current===0;$('nextBtn').disabled=current===EXAM_COUNT-1;updateNav()}
function updateNav(){[...$('nav').children].forEach((b,i)=>{b.classList.toggle('answered',answers[i]!==-1);b.classList.toggle('current',i===current)});const n=answers.filter(x=>x!==-1).length;$('answered').textContent=`ตอบแล้ว ${n}/${EXAM_COUNT}`;$('submitBtn').disabled=n!==EXAM_COUNT}
function escapeHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function fmt(sec){const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':')}
function startTimer(){clearInterval(timer);$('timer').textContent=fmt(timeLeft);timer=setInterval(()=>{if(!active)return;timeLeft--;$('timer').textContent=fmt(Math.max(0,timeLeft));if(timeLeft<=300)$('timer').style.color='var(--danger)';if(timeLeft<=0){clearInterval(timer);finish('timeup')}},1000)}
function payload(status){
  const questionIds=questions.map(q=>q.id);
  const selectedOriginal=answers.map((a,i)=>a<0?-1:questions[i].originalIndices[a]);
  return {student,startedAt,submittedAtClient:new Date().toISOString(),status,violations,questionIds,selectedOriginal,attemptToken,registrationId,examCount:EXAM_COUNT,maxScore:20};
}
async function finish(status='submitted'){
  if(!active)return;active=false;clearInterval(timer);$('submitBtn').disabled=true;
  const p=payload(status);
  try{
    const ref=await addDoc(collection(db,'submissions'),{...p,submittedAt:serverTimestamp()});
    $('doneRef').textContent=`เลขอ้างอิงการส่ง: ${ref.id}`;
  }catch(e){
    console.error(e);active=true;startTimer();alert('ยังส่งคำตอบเข้าฐานข้อมูลไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วกดส่งอีกครั้ง');return;
  }
  $('watermark').classList.add('hidden');$('screen-exam').classList.add('hidden');$('screen-done').classList.remove('hidden');try{document.exitFullscreen?.()}catch{}
}
function violation(){if(!active)return;violations++;$('violations').textContent=violations;if(violations>MAX_VIOLATIONS){finish('terminated').then(()=>$('lockOverlay').classList.remove('hidden'))}}
$('startBtn').onclick=start;$('prevBtn').onclick=()=>{current=Math.max(0,current-1);render()};$('nextBtn').onclick=()=>{current=Math.min(EXAM_COUNT-1,current+1);render()};$('submitBtn').onclick=()=>{if(answers.some(x=>x===-1))return;if(confirm('ยืนยันส่งข้อสอบ? หลังส่งแล้วจะไม่สามารถแก้ไขคำตอบได้'))finish('submitted')};
document.addEventListener('visibilitychange',()=>{if(document.hidden)violation()});document.addEventListener('fullscreenchange',()=>{if(active&&!document.fullscreenElement)violation()});['copy','cut','paste','contextmenu'].forEach(evt=>document.addEventListener(evt,e=>{if(active){e.preventDefault();violation()}}));document.addEventListener('keydown',e=>{if(active&&((e.ctrlKey||e.metaKey)&&['c','v','x','p','u','s'].includes(e.key.toLowerCase()))){e.preventDefault();violation()}});window.addEventListener('beforeunload',e=>{if(active){e.preventDefault();e.returnValue=''}});
