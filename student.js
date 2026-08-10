import { db, isFirebaseConfigured } from './firebase-service.js';
import { SUBJECTS, EXAM_ROOM_CODE } from './subjects.js';
import { collection, getDocs, query, where, doc, setDoc, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const EXAM_COUNT=50, EXAM_SECONDS=75*60, MAX_VIOLATIONS=3;
let selectedSubject=null, questions=[], answers=[], current=0, timeLeft=EXAM_SECONDS, timer=null, active=false, violations=0, student=null, startedAt=null, attemptToken='', registrationId='';
const $=id=>document.getElementById(id);

function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function normalize(s){return String(s||'').trim()}
function showRegError(msg){$('registerMsg').textContent=msg;$('registerMsg').classList.remove('hidden')}
function randomToken(){return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}
async function sha256(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function escapeHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function applyTheme(theme){document.body.dataset.theme=theme||''}

let unlockedSubjectId = null;

function renderSubjects(){
  const g=$('subjectGrid');
  g.innerHTML='';

  SUBJECTS.forEach(s=>{
    const card=document.createElement('div');
    card.className=`subject-card theme-${s.theme}`;
    const unlocked=unlockedSubjectId===s.id;

    card.innerHTML=`
      <div class="subject-head">
        <span class="subject-icon">${s.icon}</span>
        <span class="subject-code">${escapeHtml(s.code)}</span>
      </div>
      <strong>${escapeHtml(s.name)}</strong>
      <span class="subject-meta">ข้อสอบ 50 ข้อ · คะแนนเต็ม 20 · เวลา 75 นาที</span>
      <div class="subject-lock">🔒 กรอกรหัสเข้าห้องสอบเพื่อปลดล็อก</div>
      <div class="subject-code-box">
        <input class="subject-code-input" type="password" autocomplete="off" inputmode="text"
          aria-label="รหัสเข้าห้องสอบ ${escapeHtml(s.name)}"
          placeholder="กรอกรหัสเข้าห้องสอบ" data-subject-id="${s.id}">
        <button class="btn secondary subject-unlock" type="button">ปลดล็อก</button>
      </div>
      <div class="subject-code-msg ${unlocked?'ok':''}" aria-live="polite">
        ${unlocked?'✓ รหัสถูกต้อง พร้อมเข้าสู่หน้าลงทะเบียน':''}
      </div>
      ${unlocked?'<button class="btn subject-enter-btn" type="button">เข้าสู่หน้าลงทะเบียน →</button>':''}
    `;

    const input=card.querySelector('.subject-code-input');
    const unlockBtn=card.querySelector('.subject-unlock');
    const tryUnlock=()=>unlockSubject(s, input, card);
    unlockBtn.addEventListener('click',tryUnlock);
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();tryUnlock();}});

    const enterBtn=card.querySelector('.subject-enter-btn');
    if(enterBtn) enterBtn.addEventListener('click',()=>chooseSubject(s));

    g.appendChild(card);
  });
}

function unlockSubject(s,input,card){
  const msg=card.querySelector('.subject-code-msg');
  const value=normalize(input.value).toUpperCase();
  if(value===EXAM_ROOM_CODE.toUpperCase()){
    unlockedSubjectId=s.id;
    renderSubjects();
    const fresh=[...document.querySelectorAll('.subject-card')].find(x=>x.querySelector(`[data-subject-id="${s.id}"]`));
    fresh?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }else{
    msg.classList.remove('ok');
    msg.classList.add('bad');
    msg.textContent='รหัสเข้าห้องสอบไม่ถูกต้อง กรุณาตรวจสอบกับครูผู้สอน';
    input.focus();
    input.select();
  }
}

function chooseSubject(s){
  if(unlockedSubjectId!==s.id) return;
  selectedSubject=s;applyTheme(s.theme);
  $('subjectTag').textContent=s.tag;
  $('subjectTitle').textContent=s.name;
  $('subjectCodeText').textContent=`รหัสวิชา ${s.code}`;
  $('screen-subject').classList.add('hidden');
  $('screen-register').classList.remove('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
}
function backSubjects(){
  selectedSubject=null;applyTheme('');
  $('screen-register').classList.add('hidden');$('screen-subject').classList.remove('hidden');$('registerMsg').classList.add('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
}

async function fetchExam(){
  const qref=query(collection(db,'questions'),where('subjectId','==',selectedSubject.id));
  const snap=await getDocs(qref);
  const bank=snap.docs.map(d=>({id:d.id,...d.data()})).filter(q=>q.active!==false && Array.isArray(q.options) && q.options.length===4);
  if(bank.length<EXAM_COUNT) throw new Error(`วิชา ${selectedSubject.name} มีข้อสอบพร้อมใช้งานเพียง ${bank.length} ข้อ ต้องมีอย่างน้อย ${EXAM_COUNT} ข้อ`);
  return shuffle(bank).slice(0,EXAM_COUNT).map(q=>{
    const mixed=shuffle(q.options.map((text,original)=>({text,original})));
    return {id:q.id,q:q.q,options:mixed.map(x=>x.text),originalIndices:mixed.map(x=>x.original)};
  });
}
async function registerAttempt(){
  const regId=await sha256(`${selectedSubject.id}::${student.studentId}`);
  attemptToken=randomToken();
  await setDoc(doc(db,'registrations',regId),{
    ...student,subjectId:selectedSubject.id,subjectCode:selectedSubject.code,subjectName:selectedSubject.name,
    attemptToken,registeredAt:serverTimestamp(),registeredAtClient:new Date().toISOString(),status:'started'
  });
  return regId;
}
async function start(){
  $('registerMsg').classList.add('hidden');
  if(!selectedSubject) return showRegError('กรุณาเลือกวิชาที่ต้องการสอบ');
  if(!isFirebaseConfigured()) return showRegError('เว็บไซต์ยังไม่ได้เชื่อม Firebase กรุณาแจ้งผู้ดูแลระบบ');
  const name=normalize($('name').value),studentId=normalize($('studentId').value),className=normalize($('className').value),department=normalize($('department').value);
  if(!name||!studentId||!className||!department) return showRegError('กรุณากรอกชื่อ ชั้น/กลุ่มเรียน แผนกวิชา และเลขนักศึกษาให้ครบถ้วน');
  if(!$('accept').checked) return showRegError('กรุณายืนยันว่าได้อ่านคำชี้แจงก่อนเข้าสอบ');

  $('startBtn').disabled=true;$('startBtn').textContent='กำลังลงทะเบียน...';
  try{
    student={name,studentId,className,department};questions=await fetchExam();registrationId=await registerAttempt();
  }catch(e){
    console.error(e);$('startBtn').disabled=false;$('startBtn').textContent='ลงทะเบียนและเริ่มสอบ';
    if(e?.code==='permission-denied') return showRegError('ไม่สามารถลงทะเบียนได้: เลขนักศึกษานี้อาจเคยลงทะเบียนวิชานี้แล้ว หรือ Firestore Rules ยังไม่ตรงกับระบบ กรุณาติดต่อผู้ดูแลระบบ');
    return showRegError(e?.message||'ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่');
  }
  startedAt=new Date().toISOString();answers=new Array(EXAM_COUNT).fill(-1);timeLeft=EXAM_SECONDS;current=0;violations=0;
  $('screen-register').classList.add('hidden');$('screen-exam').classList.remove('hidden');
  $('examSubjectMini').textContent=`${selectedSubject.code} · ${selectedSubject.name}`;
  buildNav();buildWatermark();active=true;try{await document.documentElement.requestFullscreen?.()}catch{}render();startTimer();
}
function buildWatermark(){const w=$('watermark');w.innerHTML='';for(let i=0;i<30;i++){const s=document.createElement('span');s.textContent=`${student.name} · ${student.studentId} · ${selectedSubject.code}`;w.appendChild(s)}w.classList.remove('hidden')}
function buildNav(){const nav=$('nav');nav.innerHTML='';questions.forEach((_,i)=>{const b=document.createElement('button');b.textContent=i+1;b.onclick=()=>{current=i;render()};nav.appendChild(b)})}
function render(){
  const q=questions[current];$('qLabel').textContent=`${selectedSubject.code} · ข้อที่ ${current+1} จาก ${EXAM_COUNT}`;$('qText').textContent=q.q;$('progress').style.width=`${(current+1)/EXAM_COUNT*100}%`;
  const wrap=$('options');wrap.innerHTML='';
  ['ก','ข','ค','ง'].forEach((letter,i)=>{
    const lab=document.createElement('label');lab.className='option'+(answers[current]===i?' selected':'');
    lab.innerHTML=`<input type="radio" name="ans" ${answers[current]===i?'checked':''}><span class="letter">${letter}.</span><span>${escapeHtml(q.options[i])}</span>`;
    lab.onclick=()=>{answers[current]=i;render()};wrap.appendChild(lab);
  });
  requestAnimationFrame(()=>{const items=[...wrap.querySelectorAll('.option')];items.forEach(x=>x.style.minHeight='0px');const h=Math.max(...items.map(x=>x.scrollHeight));items.forEach(x=>x.style.minHeight=h+'px')});
  $('prevBtn').disabled=current===0;$('nextBtn').disabled=current===EXAM_COUNT-1;updateNav();
}
function updateNav(){[...$('nav').children].forEach((b,i)=>{b.classList.toggle('answered',answers[i]!==-1);b.classList.toggle('current',i===current)});const n=answers.filter(x=>x!==-1).length;$('answered').textContent=`ตอบแล้ว ${n}/${EXAM_COUNT}`;$('submitBtn').disabled=n!==EXAM_COUNT}
function fmt(sec){const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':')}
function startTimer(){clearInterval(timer);$('timer').style.color='';$('timer').textContent=fmt(timeLeft);timer=setInterval(()=>{if(!active)return;timeLeft--;$('timer').textContent=fmt(Math.max(0,timeLeft));if(timeLeft<=300)$('timer').style.color='var(--danger)';if(timeLeft<=0){clearInterval(timer);finish('timeup')}},1000)}
function payload(status){
  const questionIds=questions.map(q=>q.id),selectedOriginal=answers.map((a,i)=>a<0?-1:questions[i].originalIndices[a]);
  return {student,subjectId:selectedSubject.id,subjectCode:selectedSubject.code,subjectName:selectedSubject.name,startedAt,submittedAtClient:new Date().toISOString(),status,violations,questionIds,selectedOriginal,attemptToken,registrationId,examCount:EXAM_COUNT,maxScore:20};
}
async function finish(status='submitted'){
  if(!active)return;active=false;clearInterval(timer);$('submitBtn').disabled=true;
  try{const ref=await addDoc(collection(db,'submissions'),{...payload(status),submittedAt:serverTimestamp()});$('doneRef').textContent=`เลขอ้างอิงการส่ง: ${ref.id}`}
  catch(e){console.error(e);active=true;startTimer();alert('ยังส่งคำตอบเข้าฐานข้อมูลไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วกดส่งอีกครั้ง');return}
  $('doneSubject').textContent=`${selectedSubject.code} ${selectedSubject.name}`;$('watermark').classList.add('hidden');$('screen-exam').classList.add('hidden');$('screen-done').classList.remove('hidden');try{document.exitFullscreen?.()}catch{}
}
function violation(){if(!active)return;violations++;$('violations').textContent=violations;if(violations>MAX_VIOLATIONS){finish('terminated').then(()=>$('lockOverlay').classList.remove('hidden'))}}

renderSubjects();
$('backSubjectBtn').onclick=backSubjects;$('startBtn').onclick=start;
$('prevBtn').onclick=()=>{current=Math.max(0,current-1);render()};$('nextBtn').onclick=()=>{current=Math.min(EXAM_COUNT-1,current+1);render()};
$('submitBtn').onclick=()=>{if(answers.some(x=>x===-1))return;if(confirm('ยืนยันส่งข้อสอบ? หลังส่งแล้วจะไม่สามารถแก้ไขคำตอบได้'))finish('submitted')};
document.addEventListener('visibilitychange',()=>{if(document.hidden)violation()});
document.addEventListener('fullscreenchange',()=>{if(active&&!document.fullscreenElement)violation()});
['copy','cut','paste','contextmenu'].forEach(evt=>document.addEventListener(evt,e=>{if(active){e.preventDefault();violation()}}));
document.addEventListener('keydown',e=>{if(active&&((e.ctrlKey||e.metaKey)&&['c','v','x','p','u','s'].includes(e.key.toLowerCase()))){e.preventDefault();violation()}});
window.addEventListener('beforeunload',e=>{if(active){e.preventDefault();e.returnValue=''}});
