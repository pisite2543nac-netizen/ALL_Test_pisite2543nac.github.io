import { studentAuth, studentDb, isFirebaseConfigured } from './firebase-service.js';
import { ADMIN_UID } from './firebase-config.js';
import { SUBJECTS, EXAM_ROOM_CODE } from './subjects.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import {
  collection, getDocs, getDoc, query, where, doc, setDoc, addDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const EXAM_COUNT=50, EXAM_SECONDS=75*60, MAX_VIOLATIONS=3, REVEAL_DELAY_MS=30*60*1000;
let selectedSubject=null, questions=[], answers=[], current=0, timeLeft=EXAM_SECONDS, timer=null;
let active=false, violations=0, student=null, startedAt=null, attemptToken='', registrationId='', checkinId='', startingExam=false, wantsKey=true, revealTimer=null;
let authReady=false;
const $=id=>document.getElementById(id);

function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function normalize(s){return String(s||'').trim()}
function escapeHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function randomToken(){return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}
async function sha256(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function applyTheme(theme){document.body.dataset.theme=theme||''}
function studentEmail(studentId){return `${studentId}@student.nangrong.invalid`}
function validStudentId(v){return /^\d+$/.test(v)}
function showMsg(id,msg){const e=$(id);e.textContent=msg;e.classList.remove('hidden')}
function hideMsg(id){$(id)?.classList.add('hidden')}

function showLogin(){
  $('loginPanel').classList.remove('hidden');
  $('registerPanel').classList.add('hidden');
  $('showLoginBtn').classList.add('active');
  $('showRegisterBtn').classList.remove('active');
}
function showRegister(){
  $('loginPanel').classList.add('hidden');
  $('registerPanel').classList.remove('hidden');
  $('showLoginBtn').classList.remove('active');
  $('showRegisterBtn').classList.add('active');
}
function showAuthHome(){
  ['screen-subject','screen-exam','screen-done'].forEach(id=>$(id)?.classList.add('hidden'));
  $('screen-auth').classList.remove('hidden');
  updatePendingRevealShortcut();
  window.scrollTo({top:0,behavior:'smooth'});
}
function showSubjectHome(){
  if(!student){showAuthHome();return}
  $('screen-auth').classList.add('hidden');
  $('screen-done').classList.add('hidden');
  $('screen-exam').classList.add('hidden');
  $('screen-subject').classList.remove('hidden');
  $('studentSummary').innerHTML=`
    <b>${escapeHtml(student.name)}</b>
    <span>เลขนักศึกษา ${escapeHtml(student.studentId)}</span>
    <span>${escapeHtml(student.className)}</span>
    <span>${escapeHtml(student.department)}</span>
    <span>${wantsKey?'รับเฉลยหลัง 30 นาที':'ไม่รับเฉลย'}</span>
  `;
  renderSubjects();
  window.scrollTo({top:0,behavior:'smooth'});
}

async function loadBuiltInQuestionBank(){
  const res=await fetch('./initial-question-bank-all-subjects.json',{cache:'no-store'});
  if(!res.ok) throw new Error('ไม่สามารถโหลดคลังข้อสอบสำเร็จรูปได้');
  const arr=await res.json();
  if(!Array.isArray(arr)) throw new Error('คลังข้อสอบสำเร็จรูปไม่ถูกต้อง');
  return arr;
}

async function createStudentCheckin(uid, createdBy='student'){
  checkinId=randomToken();
  await setDoc(doc(studentDb,'studentCheckins',checkinId),{
    ownerUid:uid,
    studentId:student.studentId,
    name:student.name,
    className:student.className,
    department:student.department,
    wantsKey,
    status:'registered',
    subjectId:'',
    subjectCode:'',
    subjectName:'',
    createdBy,
    registeredAt:serverTimestamp(),
    registeredAtClient:new Date().toISOString()
  });
}

async function updateStudentCheckinForSubject(){
  if(!checkinId)return;
  await setDoc(doc(studentDb,'studentCheckins',checkinId),{
    ownerUid:studentAuth.currentUser?.uid||'',
    subjectId:selectedSubject.id,
    subjectCode:selectedSubject.code,
    subjectName:selectedSubject.name,
    status:'exam_started',
    examStartedAt:serverTimestamp(),
    examStartedAtClient:new Date().toISOString()
  },{merge:true});
}

async function registerUser(){
  hideMsg('registerMsg');
  if(!isFirebaseConfigured()){showMsg('registerMsg','เว็บไซต์ยังไม่ได้เชื่อม Firebase');return}

  const studentId=normalize($('studentId').value);
  const name=normalize($('name').value);
  const className=normalize($('className').value);
  const department=normalize($('department').value);
  const password=$('registerPassword').value;
  const password2=$('registerPassword2').value;
  wantsKey=(document.querySelector('input[name="wantKey"]:checked')?.value||'yes')==='yes';

  if(!studentId||!name||!className||!department){
    showMsg('registerMsg','กรุณากรอกข้อมูลผู้เข้าสอบให้ครบถ้วน');return
  }
  if(!validStudentId(studentId)){
    showMsg('registerMsg','เลขนักศึกษาต้องเป็นตัวเลขเท่านั้น');return
  }
  if(password.length<6){
    showMsg('registerMsg','รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');return
  }
  if(password!==password2){
    showMsg('registerMsg','รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน');return
  }
  if(!$('accept').checked){
    showMsg('registerMsg','กรุณายืนยันข้อมูลและยอมรับคำชี้แจงการสอบ');return
  }

  const btn=$('registerContinueBtn');btn.disabled=true;btn.textContent='กำลังสร้างบัญชี...';
  try{
    await setPersistence(studentAuth,browserLocalPersistence);
    const cred=await createUserWithEmailAndPassword(studentAuth,studentEmail(studentId),password);

    student={studentId,name,className,department,wantsKey,uid:cred.user.uid};
    await setDoc(doc(studentDb,'studentUsers',cred.user.uid),{
      studentId,name,className,department,wantsKey,
      email:studentEmail(studentId),
      active:true,
      createdAt:serverTimestamp(),
      createdAtClient:new Date().toISOString()
    });
    await createStudentCheckin(cred.user.uid,'self_register');
    showSubjectHome();
  }catch(e){
    console.error(e);
    let msg='ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่';
    if(e?.code==='auth/email-already-in-use')msg='เลขนักศึกษานี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ';
    else if(e?.code==='auth/weak-password')msg='รหัสผ่านสั้นเกินไป กรุณาใช้อย่างน้อย 6 ตัวอักษร';
    else if(e?.code==='permission-denied')msg='สร้างบัญชีแล้วแต่บันทึกข้อมูลไม่ได้ กรุณาตรวจสอบ Firestore Rules';
    showMsg('registerMsg',msg);
  }finally{btn.disabled=false;btn.textContent='ลงทะเบียนและสร้างบัญชี'}
}

async function loginUser(){
  hideMsg('loginUserMsg');
  const studentId=normalize($('loginStudentId').value);
  const password=$('loginPassword').value;
  if(!studentId||!password){showMsg('loginUserMsg','กรุณากรอกเลขนักศึกษาและรหัสผ่าน');return}
  if(!validStudentId(studentId)){showMsg('loginUserMsg','เลขนักศึกษาต้องเป็นตัวเลขเท่านั้น');return}

  const btn=$('studentLoginBtn');btn.disabled=true;btn.textContent='กำลังเข้าสู่ระบบ...';
  try{
    await setPersistence(studentAuth,browserLocalPersistence);
    const cred=await signInWithEmailAndPassword(studentAuth,studentEmail(studentId),password);
    if(cred.user.uid===ADMIN_UID){
      await signOut(studentAuth);
      throw new Error('บัญชีนี้ไม่ใช่บัญชีนักศึกษา');
    }
    await loadLoggedInStudent(cred.user);
    // บันทึกการ Login ครั้งนี้ให้ Admin เห็น
    await createStudentCheckin(cred.user.uid,'login');
    showSubjectHome();
  }catch(e){
    console.error(e);
    let msg='เลขนักศึกษาหรือรหัสผ่านไม่ถูกต้อง';
    if(e?.code==='permission-denied')msg='เข้าสู่ระบบสำเร็จ แต่ไม่สามารถอ่านข้อมูลนักศึกษาได้ กรุณาตรวจสอบ Firestore Rules';
    showMsg('loginUserMsg',msg);
  }finally{btn.disabled=false;btn.textContent='เข้าสู่ระบบ'}
}

async function loadLoggedInStudent(user){
  const snap=await getDoc(doc(studentDb,'studentUsers',user.uid));
  if(!snap.exists())throw new Error('ไม่พบข้อมูลผู้เข้าสอบ');
  const p=snap.data();
  if(p.active===false)throw new Error('บัญชีถูกระงับ');
  student={
    uid:user.uid,
    studentId:p.studentId||'',
    name:p.name||'',
    className:p.className||'',
    department:p.department||'',
    wantsKey:p.wantsKey!==false
  };
  wantsKey=student.wantsKey;
}

async function logoutUser(){
  if(active){
    if(!confirm('กำลังทำข้อสอบอยู่ ต้องการออกจากระบบจริงหรือไม่?'))return;
  }
  clearInterval(timer);clearInterval(revealTimer);
  active=false;student=null;selectedSubject=null;checkinId='';registrationId='';attemptToken='';
  try{await signOut(studentAuth)}catch{}
  showLogin();
  showAuthHome();
}

function renderSubjects(){
  const g=$('subjectGrid');
  g.innerHTML='';
  SUBJECTS.forEach(s=>{
    const card=document.createElement('div');
    card.className=`subject-card theme-${s.theme}`;
    card.innerHTML=`
      <div class="subject-head">
        <span class="subject-icon">${s.icon}</span>
        <span class="subject-code">${escapeHtml(s.code)}</span>
      </div>
      <strong>${escapeHtml(s.name)}</strong>
      <span class="subject-meta">ข้อสอบ 50 ข้อ · คะแนนเต็ม 20 · เวลา 75 นาที</span>

      <div class="subject-code-gate">
        <label for="subject-code-${s.id}">รหัสล็อกอินเข้าวิชานี้</label>
        <div class="subject-code-row">
          <input
            id="subject-code-${s.id}"
            type="text"
            autocomplete="off"
            spellcheck="false"
            autocapitalize="characters"
            maxlength="20"
            placeholder="กรอกรหัสล็อกอิน"
          >
          <button class="btn small subject-start" type="button" data-subject="${s.id}">ล็อกอินเข้าสอบ</button>
        </div>
        <div id="subject-msg-${s.id}" class="subject-code-msg hidden"></div>
      </div>
    `;
    g.appendChild(card);

    const input=card.querySelector(`#subject-code-${CSS.escape(s.id)}`);
    const btn=card.querySelector('.subject-start');
    btn.addEventListener('click',()=>unlockAndStart(s));
    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        unlockAndStart(s);
      }
    });
  });
}

function subjectMessage(s,msg,ok=false){
  const el=$(`subject-msg-${s.id}`);
  el.textContent=msg;
  el.classList.remove('hidden','ok','bad');
  el.classList.add(ok?'ok':'bad');
}

async function fetchExam(){
  let bank=[];
  try{
    const qref=query(collection(studentDb,'questions'),where('subjectId','==',selectedSubject.id));
    const snap=await getDocs(qref);
    bank=snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(q=>q.active!==false && Array.isArray(q.options) && q.options.length===4);
  }catch(e){
    console.warn('Firestore question read failed; using built-in bank',e);
  }

  // เว็บสำเร็จรูป: ถ้า Firestore ยังไม่มีคลังครบ ใช้ข้อสอบที่มากับเว็บได้ทันที
  if(bank.length<EXAM_COUNT){
    const builtIn=await loadBuiltInQuestionBank();
    bank=builtIn
      .filter(q=>q.subjectId===selectedSubject.id)
      .map(q=>({
        id:q.id,
        subjectId:q.subjectId,
        subjectCode:q.subjectCode,
        subjectName:q.subjectName,
        theme:q.theme||'',
        q:q.q,
        options:q.options,
        active:true
      }));
  }

  if(bank.length<EXAM_COUNT){
    throw new Error(`วิชา ${selectedSubject.name} มีข้อสอบพร้อมใช้งาน ${bank.length} ข้อ ต้องมีอย่างน้อย ${EXAM_COUNT} ข้อ`);
  }

  return shuffle(bank).slice(0,EXAM_COUNT).map(q=>{
    const mixed=shuffle(q.options.map((text,original)=>({text,original})));
    return {id:q.id,q:q.q,options:mixed.map(x=>x.text),originalIndices:mixed.map(x=>x.original)};
  });
}

async function registerAttempt(){
  // 1 student + 1 subject = deterministic registration record
  const regId=await sha256(`${selectedSubject.id}::${student.studentId}`);
  attemptToken=randomToken();
  await setDoc(doc(studentDb,'registrations',regId),{
    ...student,
    ownerUid:studentAuth.currentUser?.uid||'',
    subjectId:selectedSubject.id,
    subjectCode:selectedSubject.code,
    subjectName:selectedSubject.name,
    attemptToken,
    registeredAt:serverTimestamp(),
    registeredAtClient:new Date().toISOString(),
    status:'started',
    wantsKey
  });
  return regId;
}

async function unlockAndStart(s){
  if(startingExam) return;
  if(!student){
    $('screen-subject').classList.add('hidden');
    $('screen-register').classList.remove('hidden');
    return;
  }

  const input=$(`subject-code-${s.id}`);
  const value=normalize(input.value).toUpperCase();

  if(value!==EXAM_ROOM_CODE.toUpperCase()){
    subjectMessage(s,'รหัสล็อกอินไม่ถูกต้อง กรุณาตรวจสอบรหัสกับครูผู้สอน');
    input.focus();
    input.select();
    return;
  }

  if(!isFirebaseConfigured()){
    subjectMessage(s,'เว็บไซต์ยังไม่ได้เชื่อม Firebase กรุณาแจ้งผู้ดูแลระบบ');
    return;
  }

  startingExam=true;
  selectedSubject=s;
  applyTheme(s.theme);
  subjectMessage(s,'รหัสถูกต้อง กำลังเข้าสู่ข้อสอบ...',true);

  document.querySelectorAll('.subject-start').forEach(b=>b.disabled=true);

  try{
    questions=await fetchExam();
    registrationId=await registerAttempt();
    await updateStudentCheckinForSubject();
  }catch(e){
    console.error(e);
    startingExam=false;
    document.querySelectorAll('.subject-start').forEach(b=>b.disabled=false);
    if(e?.code==='permission-denied'){
      subjectMessage(s,'ลงทะเบียนรายวิชาไม่สำเร็จ: Firestore Rules หรือสิทธิ์ฐานข้อมูลไม่ตรงกับระบบ');
      return;
    }
    subjectMessage(s,e?.message||'ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่');
    return;
  }

  startedAt=new Date().toISOString();
  answers=new Array(EXAM_COUNT).fill(-1);
  timeLeft=EXAM_SECONDS;
  current=0;
  violations=0;
  $('violations').textContent='0';

  $('screen-subject').classList.add('hidden');
  $('screen-exam').classList.remove('hidden');
  $('examSubjectMini').textContent=`${selectedSubject.code} · ${selectedSubject.name}`;

  buildNav();
  buildWatermark();
  active=true;
  startingExam=false;

  try{await document.documentElement.requestFullscreen?.()}catch{}
  render();
  startTimer();
}

function buildWatermark(){
  const w=$('watermark');w.innerHTML='';
  for(let i=0;i<30;i++){
    const s=document.createElement('span');
    s.textContent=`${student.name} · ${student.studentId} · ${selectedSubject.code}`;
    w.appendChild(s);
  }
  w.classList.remove('hidden');
}
function buildNav(){
  const nav=$('nav');nav.innerHTML='';
  questions.forEach((_,i)=>{
    const b=document.createElement('button');
    b.textContent=i+1;
    b.onclick=()=>{current=i;render()};
    nav.appendChild(b);
  });
}
function render(){
  const q=questions[current];
  $('qLabel').textContent=`${selectedSubject.code} · ข้อที่ ${current+1} จาก ${EXAM_COUNT}`;
  $('qText').textContent=q.q;
  $('progress').style.width=`${(current+1)/EXAM_COUNT*100}%`;

  const wrap=$('options');wrap.innerHTML='';
  ['ก','ข','ค','ง'].forEach((letter,i)=>{
    const lab=document.createElement('label');
    lab.className='option'+(answers[current]===i?' selected':'');
    lab.innerHTML=`<input type="radio" name="ans" ${answers[current]===i?'checked':''}><span class="letter">${letter}.</span><span>${escapeHtml(q.options[i])}</span>`;
    lab.onclick=()=>{answers[current]=i;render()};
    wrap.appendChild(lab);
  });

  requestAnimationFrame(()=>{
    const items=[...wrap.querySelectorAll('.option')];
    items.forEach(x=>x.style.minHeight='0px');
    const h=Math.max(...items.map(x=>x.scrollHeight));
    items.forEach(x=>x.style.minHeight=h+'px');
  });

  $('prevBtn').disabled=current===0;
  $('nextBtn').disabled=current===EXAM_COUNT-1;
  updateNav();
}
function updateNav(){
  [...$('nav').children].forEach((b,i)=>{
    b.classList.toggle('answered',answers[i]!==-1);
    b.classList.toggle('current',i===current);
  });
  const n=answers.filter(x=>x!==-1).length;
  $('answered').textContent=`ตอบแล้ว ${n}/${EXAM_COUNT}`;
  $('submitBtn').disabled=n!==EXAM_COUNT;
}
function fmt(sec){
  const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;
  return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':');
}
function startTimer(){
  clearInterval(timer);
  $('timer').style.color='';
  $('timer').textContent=fmt(timeLeft);
  timer=setInterval(()=>{
    if(!active)return;
    timeLeft--;
    $('timer').textContent=fmt(Math.max(0,timeLeft));
    if(timeLeft<=300)$('timer').style.color='var(--danger)';
    if(timeLeft<=0){clearInterval(timer);finish('timeup')}
  },1000);
}
function payload(status){
  const questionIds=questions.map(q=>q.id);
  const selectedOriginal=answers.map((a,i)=>a<0?-1:questions[i].originalIndices[a]);
  return {
    ownerUid:studentAuth.currentUser?.uid||'',
    student,
    subjectId:selectedSubject.id,
    subjectCode:selectedSubject.code,
    subjectName:selectedSubject.name,
    startedAt,
    submittedAtClient:new Date().toISOString(),
    status,
    violations,
    questionIds,
    selectedOriginal,
    attemptToken,
    registrationId,
    examCount:EXAM_COUNT,
    maxScore:20,
    wantsKey
  };
}

function revealStorageKey(submissionId){
  return `nangrongReveal30::${submissionId}`;
}
function saveRevealState(submissionId,revealAt){
  const state={
    submissionId,
    revealAt,
    wantsKey:true,
    subjectId:selectedSubject.id,
    subjectCode:selectedSubject.code,
    subjectName:selectedSubject.name,
    questionIds:questions.map(q=>q.id),
    selectedOriginal:answers.map((a,i)=>a<0?-1:questions[i].originalIndices[a])
  };
  localStorage.setItem(revealStorageKey(submissionId),JSON.stringify(state));
  localStorage.setItem('nangrongLatestRevealKey',revealStorageKey(submissionId));
}
function formatReveal(sec){
  sec=Math.max(0,Math.ceil(sec));
  const m=Math.floor(sec/60),s=sec%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function showDoneForReveal(state){
  $('screen-register')?.classList.add('hidden');
  $('screen-subject')?.classList.add('hidden');
  $('screen-exam')?.classList.add('hidden');
  $('screen-done')?.classList.remove('hidden');
  $('doneSubject').textContent=`${state.subjectCode||''} ${state.subjectName||''}`.trim();
  $('doneRef').textContent=`เลขอ้างอิงการส่ง: ${state.submissionId}`;
  $('doneKeyText').textContent='คุณเลือกขอรับเฉลย ระบบจะเปิดเฉลยหลังส่งข้อสอบครบ 30 นาที โดยไม่แสดงคะแนน';
}
async function loadAnswerBank(){
  const res=await fetch('./answer-bank-30min.json',{cache:'no-store'});
  if(!res.ok) throw new Error('ไม่สามารถโหลดชุดเฉลยได้');
  return await res.json();
}
async function revealAnswers(state){
  clearInterval(revealTimer);
  $('revealWaiting').classList.add('hidden');
  const list=$('reviewList');
  list.innerHTML='<div class="muted">กำลังโหลดเฉลย...</div>';

  try{
    const bank=await loadAnswerBank();
    const letters=['ก','ข','ค','ง'];
    list.innerHTML='';

    state.questionIds.forEach((qid,i)=>{
      const item=bank[qid];
      if(!item)return;
      const chosen=Number(state.selectedOriginal?.[i] ?? -1);
      const correct=Number(item.correct);
      const ok=chosen===correct;

      const card=document.createElement('article');
      card.className='review-card '+(ok?'review-correct':'review-wrong');
      card.innerHTML=`
        <div class="review-qno">ข้อที่ ${i+1}</div>
        <div class="review-question">${escapeHtml(item.q)}</div>
        <div class="review-answer ${ok?'ok':'bad'}">
          คำตอบของคุณ: ${chosen>=0 ? `${letters[chosen]}. ${escapeHtml(item.options[chosen])}` : 'ไม่ได้ตอบ'}
        </div>
        <div class="review-answer correct">
          คำตอบที่ถูก: ${letters[correct]}. ${escapeHtml(item.options[correct])}
        </div>
        <div class="review-explain"><b>เหตุผล:</b> ${escapeHtml(item.explain||'ไม่มีคำอธิบายเพิ่มเติม')}</div>
      `;
      list.appendChild(card);
    });

    $('reviewSection').classList.remove('hidden');
  }catch(e){
    console.error(e);
    list.innerHTML='<div class="error">ไม่สามารถโหลดเฉลยได้ กรุณารีเฟรชหน้านี้อีกครั้ง</div>';
    $('reviewSection').classList.remove('hidden');
  }
}
function startRevealCountdown(state){
  showDoneForReveal(state);
  const wait=$('revealWaiting');
  wait.classList.remove('hidden');

  const tick=()=>{
    const remain=(Number(state.revealAt)-Date.now())/1000;
    if(remain<=0){
      $('revealCountdown').textContent='00:00';
      revealAnswers(state);
      updatePendingRevealShortcut();
      return;
    }
    $('revealCountdown').textContent=formatReveal(remain);
  };
  tick();
  clearInterval(revealTimer);
  revealTimer=setInterval(tick,1000);
}
function resumePendingReveal(){
  const key=localStorage.getItem('nangrongLatestRevealKey');
  if(!key)return false;
  try{
    const state=JSON.parse(localStorage.getItem(key)||'null');
    if(!state||!state.wantsKey||!state.submissionId)return false;
    showDoneForReveal(state);
    startRevealCountdown(state);
    return true;
  }catch{
    return false;
  }
}

function getPendingRevealState(){
  const key=localStorage.getItem('nangrongLatestRevealKey');
  if(!key)return null;
  try{
    const state=JSON.parse(localStorage.getItem(key)||'null');
    if(!state||!state.wantsKey||!state.submissionId)return null;
    return state;
  }catch{
    return null;
  }
}

function updatePendingRevealShortcut(){
  const box=$('pendingRevealShortcut');
  if(!box)return;
  const state=getPendingRevealState();
  if(!state){
    box.classList.add('hidden');
    return;
  }
  const remain=Math.max(0,Math.ceil((Number(state.revealAt)-Date.now())/1000));
  $('pendingRevealShortcutText').textContent = remain>0
    ? `วิชา ${state.subjectCode||''} ${state.subjectName||''} · เหลือประมาณ ${formatReveal(remain)}`
    : `วิชา ${state.subjectCode||''} ${state.subjectName||''} · เฉลยพร้อมเปิดแล้ว`;
  box.classList.remove('hidden');
}

function hideAllStudentScreens(){
  ['screen-register','screen-subject','screen-exam','screen-done'].forEach(id=>$(id)?.classList.add('hidden'));
}

function goStudentHome(){
  clearInterval(revealTimer);
  active=false;
  hideAllStudentScreens();
  $('screen-register').classList.remove('hidden');
  $('watermark')?.classList.add('hidden');
  $('reviewSection')?.classList.add('hidden');
  $('revealWaiting')?.classList.add('hidden');
  updatePendingRevealShortcut();
  window.scrollTo({top:0,behavior:'smooth'});
}

function chooseAnotherSubject(){
  clearInterval(revealTimer);
  active=false;
  if(!student){
    goStudentHome();
    return;
  }
  hideAllStudentScreens();
  $('screen-subject').classList.remove('hidden');
  $('watermark')?.classList.add('hidden');
  renderSubjects();
  updatePendingRevealShortcut();
  window.scrollTo({top:0,behavior:'smooth'});
}

function legacyLogoutStudent(){ logoutUser(); }

function openPendingReveal(){
  const state=getPendingRevealState();
  if(!state){
    updatePendingRevealShortcut();
    alert('ไม่พบเฉลยที่กำลังรออยู่');
    return;
  }
  hideAllStudentScreens();
  startRevealCountdown(state);
  window.scrollTo({top:0,behavior:'smooth'});
}

async function finish(status='submitted'){
  if(!active)return;
  active=false;
  clearInterval(timer);
  $('submitBtn').disabled=true;

  try{
    const ref=await addDoc(collection(studentDb,'submissions'),{
      ...payload(status),
      submittedAt:serverTimestamp()
    });
    $('doneRef').textContent=`เลขอ้างอิงการส่ง: ${ref.id}`;

    if(checkinId){
      try{
        await setDoc(doc(studentDb,'studentCheckins',checkinId),{
          status: status==='terminated' ? 'terminated' : 'completed',
          submissionId:ref.id,
          completedAt:serverTimestamp(),
          completedAtClient:new Date().toISOString()
        },{merge:true});
      }catch(e){console.warn('update checkin status failed',e)}
    }

    if(wantsKey && status!=='terminated'){
      const revealAt=Date.now()+REVEAL_DELAY_MS;
      saveRevealState(ref.id,revealAt);
      startRevealCountdown({
        submissionId:ref.id,
        revealAt,
        wantsKey:true,
        subjectId:selectedSubject.id,
        subjectCode:selectedSubject.code,
        subjectName:selectedSubject.name,
        questionIds:questions.map(q=>q.id),
        selectedOriginal:answers.map((a,i)=>a<0?-1:questions[i].originalIndices[a])
      });
    }
  }catch(e){
    console.error(e);
    active=true;
    startTimer();
    alert('ยังส่งคำตอบเข้าฐานข้อมูลไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วกดส่งอีกครั้ง');
    return;
  }

  $('doneSubject').textContent=`${selectedSubject.code} ${selectedSubject.name}`;
  $('watermark').classList.add('hidden');
  $('screen-exam').classList.add('hidden');
  $('screen-done').classList.remove('hidden');

  if(!wantsKey || status==='terminated'){
    $('revealWaiting').classList.add('hidden');
    $('reviewSection').classList.add('hidden');
    $('doneKeyText').textContent = status==='terminated'
      ? 'การสอบรอบนี้ถูกยุติ ระบบไม่เปิดเฉลยสำหรับรอบที่ถูกยุติ'
      : 'คุณเลือกไม่รับเฉลย ระบบจะไม่แสดงคะแนนหรือเฉลยในหน้าผู้เข้าสอบ';
  }

  try{document.exitFullscreen?.()}catch{}
}
function violation(){
  if(!active)return;
  violations++;
  $('violations').textContent=violations;
  if(violations>MAX_VIOLATIONS){
    finish('terminated').then(()=>$('lockOverlay').classList.remove('hidden'));
  }
}

// ไม่บังคับพาผู้ใช้กลับไปหน้าเฉลยอัตโนมัติ เพื่อไม่ให้ติดอยู่หน้าเดิม
// หากมีเฉลยที่กำลังรอ จะมีปุ่ม "ดูสถานะเฉลย" ที่หน้าหลักแทน
updatePendingRevealShortcut();


// ---------- UI bindings ----------
$('showLoginBtn').onclick=showLogin;
$('showRegisterBtn').onclick=showRegister;
$('registerContinueBtn').onclick=registerUser;
$('studentLoginBtn').onclick=loginUser;
$('studentLogoutTopBtn').onclick=logoutUser;
$('studentHomeBtn').onclick=showAuthHome;
$('backHomeBtn').onclick=showAuthHome;
$('anotherSubjectBtn').onclick=showSubjectHome;
$('logoutStudentBtn').onclick=logoutUser;
$('openPendingRevealBtn').onclick=openPendingReveal;

document.querySelectorAll('.password-toggle').forEach(btn=>{
  btn.onclick=()=>{
    const input=$(btn.dataset.target);
    const show=input.type==='password';
    input.type=show?'text':'password';
    btn.textContent=show?'ซ่อน':'แสดง';
  };
});
$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')loginUser()});
$('loginStudentId').addEventListener('keydown',e=>{if(e.key==='Enter')loginUser()});

$('prevBtn').onclick=()=>{current=Math.max(0,current-1);render()};
$('nextBtn').onclick=()=>{current=Math.min(EXAM_COUNT-1,current+1);render()};
$('submitBtn').onclick=()=>{
  if(answers.some(x=>x===-1))return;
  if(confirm('ยืนยันส่งข้อสอบ? หลังส่งแล้วจะไม่สามารถแก้ไขคำตอบได้'))finish('submitted');
};

document.addEventListener('visibilitychange',()=>{if(document.hidden)violation()});
document.addEventListener('fullscreenchange',()=>{if(active&&!document.fullscreenElement)violation()});
['copy','cut','paste','contextmenu'].forEach(evt=>document.addEventListener(evt,e=>{
  if(active){e.preventDefault();violation()}
}));
document.addEventListener('keydown',e=>{
  if(active&&((e.ctrlKey||e.metaKey)&&['c','v','x','p','u','s'].includes(e.key.toLowerCase()))){
    e.preventDefault();violation();
  }
});
window.addEventListener('beforeunload',e=>{
  if(active){e.preventDefault();e.returnValue=''}
});

// ไม่บังคับ Auto Resume หน้าเฉลย
updatePendingRevealShortcut();

// Auto-login Student จาก session ที่จำไว้
setPersistence(studentAuth,browserLocalPersistence).catch(()=>{});
onAuthStateChanged(studentAuth,async user=>{
  if(!authReady)authReady=true;
  if(!user){
    student=null;
    showLogin();
    showAuthHome();
    return;
  }
  try{
    if(user.uid===ADMIN_UID){await signOut(studentAuth);return}
    await loadLoggedInStudent(user);
    showSubjectHome();
  }catch(e){
    console.error(e);
    await signOut(studentAuth);
    showLogin();
    showAuthHome();
  }
});
