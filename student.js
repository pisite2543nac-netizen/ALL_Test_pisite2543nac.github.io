// SYSTEM VERSION: 20260817-STABLE-CATEGORIZED-V1
import { studentAuth, studentDb, isFirebaseConfigured } from './firebase-service.js';
import { ADMIN_UID } from './firebase-config.js';
import { SUBJECTS } from './subjects.js';
import { DEPARTMENTS, departmentById, majorById, normalizedStudentMeta } from './student-catalog.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import {
  collection, getDocs, getDoc, query, where, doc, setDoc, addDoc, serverTimestamp, runTransaction, onSnapshot
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const EXAM_COUNT=50, EXAM_SECONDS=75*60, MAX_VIOLATIONS=2, MAX_ATTEMPTS_PER_SUBJECT=2, REVEAL_DELAY_MS=30*60*1000, REVEAL_KEEP_MS=24*60*60*1000;
let selectedSubject=null, questions=[], answers=[], current=0, timeLeft=EXAM_SECONDS, timer=null;
let active=false, violations=0, student=null, startedAt=null, attemptToken='', registrationId='', checkinId='', startingExam=false, wantsKey=true, revealTimer=null;
let authReady=false;
let attemptStateMap=new Map(), currentAttemptNumber=0;
let myRequests=[], requestUnsub=null, lastSubmissionContext=null, lastViolationAt=0;
const $=id=>document.getElementById(id);

function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function normalize(s){return String(s||'').trim()}
function escapeHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function randomToken(){return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}
async function sha256(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function applyTheme(theme){document.body.dataset.theme=theme||''}
function studentEmail(studentId){return `${studentId}@student.nangrong.invalid`}
function validStudentId(v){return /^\d{1,15}$/.test(v)}
function showMsg(id,msg){const e=$(id);e.textContent=msg;e.classList.remove('hidden')}
function hideMsg(id){$(id)?.classList.add('hidden')}


function fillDepartmentSelect(){
  const el=$('department');
  if(!el)return;
  el.innerHTML='<option value="">-- เลือกแผนก --</option>';
  DEPARTMENTS.forEach(d=>{
    const o=document.createElement('option');
    o.value=d.id;
    o.textContent=d.name;
    el.appendChild(o);
  });
}
function fillMajorSelect(departmentId,selected=''){
  const el=$('major');
  if(!el)return;
  const d=departmentById(departmentId);
  el.innerHTML='<option value="">-- เลือกสาขาวิชา --</option>';
  if(!d){
    el.disabled=true;
    $('majorCodeText').textContent='-';
    return;
  }
  d.majors.forEach(m=>{
    const o=document.createElement('option');
    o.value=m.id;
    o.textContent=`${m.name} (${m.code})`;
    el.appendChild(o);
  });
  el.disabled=false;
  if(selected)el.value=selected;
  updateMajorCode();
}
function updateMajorCode(){
  const m=majorById($('department')?.value,$('major')?.value);
  if($('majorCodeText'))$('majorCodeText').textContent=m?.code||'-';
}

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
  ['screen-subject','screen-instructions','screen-exam','screen-done'].forEach(id=>$(id)?.classList.add('hidden'));
  $('screen-auth').classList.remove('hidden');
  $('pendingRevealShortcut')?.classList.add('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
}
async function showSubjectHome(){
  if(!student){showAuthHome();return}
  attemptStateMap=new Map();
  startMyRequestListener();
  renderMyRequests();
  $('screen-auth').classList.add('hidden');
  $('screen-done').classList.add('hidden');
  $('screen-instructions')?.classList.add('hidden');
  $('screen-exam').classList.add('hidden');
  $('screen-subject').classList.remove('hidden');
  $('studentSummary').innerHTML=`
    <b>${escapeHtml(student.name)}</b>
    <span>เลขนักศึกษา ${escapeHtml(student.studentId)}</span>
    <span>${escapeHtml(student.classLevel||'')} ${escapeHtml(student.classRoom||'')}</span>
    <span>${escapeHtml(student.department||'-')}</span>
    <span>${escapeHtml(student.major||'-')}${student.majorCode?` (${escapeHtml(student.majorCode)})`:''}</span>
    <span>${wantsKey?'รับเฉลยหลัง 30 นาที':'ไม่รับเฉลย'}</span>
  `;
  renderSubjects();
  updatePendingRevealShortcut();
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
    classLevel:student.classLevel||'',
    classRoom:student.classRoom||'',
    className:student.className,
    departmentId:student.departmentId||'',
    department:student.department,
    majorId:student.majorId||'',
    major:student.major||'',
    majorCode:student.majorCode||'',
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
  const classLevel=normalize($('classLevel').value);
  const classRoom=normalize($('classRoom').value);
  const className=classLevel && classRoom ? `${classLevel}${classRoom}` : '';
  const departmentId=normalize($('department').value);
  const departmentObj=departmentById(departmentId);
  const majorId=normalize($('major').value);
  const majorObj=majorById(departmentId,majorId);
  const department=departmentObj?.name||'';
  const major=majorObj?.name||'';
  const majorCode=majorObj?.code||'';
  const password=$('registerPassword').value;
  const password2=$('registerPassword2').value;
  wantsKey=(document.querySelector('input[name="wantKey"]:checked')?.value||'yes')==='yes';

  if(!studentId||!name||!classLevel||!classRoom||!departmentId||!majorId||!department||!major){
    showMsg('registerMsg','กรุณากรอกชื่อ เลขนักศึกษา และเลือกระดับชั้น ห้อง แผนก และสาขาวิชาให้ครบถ้วน');return
  }
  if(!validStudentId(studentId)){
    showMsg('registerMsg','เลขนักศึกษาต้องเป็นตัวเลขเท่านั้น และมีความยาวไม่เกิน 15 หลัก');return
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

    student={
      studentId,name,classLevel,classRoom,className,
      departmentId,department,majorId,major,majorCode,
      wantsKey,uid:cred.user.uid
    };
    await setDoc(doc(studentDb,'studentUsers',cred.user.uid),{
      studentId,name,classLevel,classRoom,className,
      departmentId,department,majorId,major,majorCode,wantsKey,
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
  const meta=normalizedStudentMeta(p);
  student={
    uid:user.uid,
    studentId:p.studentId||'',
    name:p.name||'',
    ...meta,
    wantsKey:p.wantsKey!==false
  };
  wantsKey=student.wantsKey;
}

async function logoutUser(){
  if(active){
    if(!confirm('กำลังทำข้อสอบอยู่ ต้องการออกจากระบบจริงหรือไม่?'))return;
  }
  clearInterval(timer);clearInterval(revealTimer);
  if(requestUnsub){try{requestUnsub()}catch{} requestUnsub=null}
  myRequests=[];lastSubmissionContext=null;
  active=false;student=null;selectedSubject=null;checkinId='';registrationId='';attemptToken='';currentAttemptNumber=0;
  try{await signOut(studentAuth)}catch{}
  $('pendingRevealShortcut')?.classList.add('hidden');
  showLogin();
  showAuthHome();
}



function requestTypeLabel(t){
  return t==='score_view'?'ขอดูคะแนนสอบ':t==='retake'?'ขอสอบแก้':t;
}
function requestStatusLabel(s){
  return s==='pending'?'รอ Admin อนุมัติ':s==='approved'?'อนุมัติแล้ว':s==='rejected'?'ไม่อนุมัติ':s||'-';
}
function fmtClientDate(x){
  if(!x)return '-';
  try{
    const d=x.toDate?x.toDate():new Date(x);
    return d.toLocaleString('th-TH');
  }catch{return '-'}
}
function startMyRequestListener(){
  if(requestUnsub){try{requestUnsub()}catch{} requestUnsub=null}
  const uid=studentAuth.currentUser?.uid;
  if(!uid)return;
  const qReq=query(collection(studentDb,'examRequests'),where('ownerUid','==',uid));
  requestUnsub=onSnapshot(qReq,snap=>{
    myRequests=snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>{
        const aa=a.createdAt?.seconds||Date.parse(a.createdAtClient||0)/1000||0;
        const bb=b.createdAt?.seconds||Date.parse(b.createdAtClient||0)/1000||0;
        return bb-aa;
      });
    renderMyRequests();
  },e=>console.warn('request listener error',e));
}
function renderMyRequests(){
  const list=$('studentRequestList');
  if(!list)return;
  if(!myRequests.length){
    list.innerHTML='<div class="muted">ยังไม่มีคำร้อง</div>';
    return;
  }
  list.innerHTML=myRequests.slice(0,12).map(r=>{
    const approvedScore=r.status==='approved' && r.requestType==='score_view' && typeof r.approvedScore==='number'
      ? `<div class="approved-score-box"><b>คะแนนที่ Admin อนุมัติให้ดู</b><strong>${Number(r.approvedScore).toFixed(2)} / 20</strong><span>ตอบถูก ${Number(r.correctCount||0)} / 50 · ${r.pass===true?'ผ่าน':'ไม่ผ่าน'}</span></div>`
      : '';
    const retake=r.status==='approved' && r.requestType==='retake'
      ? '<div class="retake-approved">✅ Admin อนุมัติสิทธิ์สอบแก้แล้ว คุณได้รับสิทธิ์สอบเพิ่ม 1 ครั้งในรายวิชานี้</div>'
      : '';
    const response=r.adminMessage?`<div class="muted">ข้อความจาก Admin: ${escapeHtml(r.adminMessage)}</div>`:'';
    return `<div class="request-item status-${escapeHtml(r.status||'pending')}">
      <div class="row space">
        <div>
          <b>${requestTypeLabel(r.requestType)}</b>
          <div>${escapeHtml(r.subjectCode||'')} ${escapeHtml(r.subjectName||'')}</div>
        </div>
        <span class="request-status">${requestStatusLabel(r.status)}</span>
      </div>
      <div class="muted">${fmtClientDate(r.createdAt||r.createdAtClient)}</div>
      ${approvedScore}${retake}${response}
    </div>`;
  }).join('');
}
async function createExamRequest(type){
  if(!studentAuth.currentUser||!student||!lastSubmissionContext){
    $('requestActionMsg').textContent='ไม่พบข้อมูลผลสอบรอบล่าสุดสำหรับส่งคำร้อง';
    return;
  }

  const duplicate=myRequests.find(r=>
    r.submissionId===lastSubmissionContext.submissionId &&
    r.requestType===type &&
    r.status==='pending'
  );
  if(duplicate){
    $('requestActionMsg').textContent='มีคำร้องประเภทนี้ที่กำลังรอ Admin อนุมัติอยู่แล้ว';
    return;
  }

  const label=type==='score_view'?'ขอดูคะแนนสอบ':'ขอสอบแก้';
  if(!confirm(`ยืนยันส่งคำร้อง “${label}” ไปยัง Admin?`))return;

  try{
    await addDoc(collection(studentDb,'examRequests'),{
      ownerUid:studentAuth.currentUser.uid,
      studentId:student.studentId,
      studentName:student.name,
      classLevel:student.classLevel||'',
      classRoom:student.classRoom||'',
      className:student.className,
      departmentId:student.departmentId||'',
      department:student.department,
      majorId:student.majorId||'',
      major:student.major||'',
      majorCode:student.majorCode||'',
      subjectId:lastSubmissionContext.subjectId,
      subjectCode:lastSubmissionContext.subjectCode,
      subjectName:lastSubmissionContext.subjectName,
      submissionId:lastSubmissionContext.submissionId,
      attemptNumber:lastSubmissionContext.attemptNumber||0,
      requestType:type,
      status:'pending',
      createdAt:serverTimestamp(),
      createdAtClient:new Date().toISOString()
    });
    $('requestActionMsg').textContent=`ส่งคำร้อง “${label}” แล้ว กรุณารอ Admin อนุมัติ`;
  }catch(e){
    console.error(e);
    $('requestActionMsg').textContent='ส่งคำร้องไม่สำเร็จ: '+(e.message||e);
  }
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

      <div class="stable-ready-note">
        <b>✅ พร้อมเข้าสอบ</b>
        <span>กรอก Code ของรายวิชา แล้วอ่านคำชี้แจงก่อนเริ่มสอบ</span>
      </div>

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
          <button class="btn small subject-start" type="button" data-subject="${s.id}">
            ล็อกอินเข้าสอบ
          </button>
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
    attemptNumber:currentAttemptNumber,
    maxAttempts:MAX_ATTEMPTS_PER_SUBJECT,
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
    $('screen-auth').classList.remove('hidden');
    return;
  }

  const input=$(`subject-code-${s.id}`);
  const value=normalize(input.value).toUpperCase();

  if(value!==String(s.accessCode||'').toUpperCase()){
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
  subjectMessage(s,'รหัสถูกต้อง กำลังเตรียมคำชี้แจงก่อนสอบ...',true);
  document.querySelectorAll('.subject-start').forEach(b=>b.disabled=true);

  try{
    // โหลดข้อสอบไว้ก่อน แต่ยังไม่เริ่มจับเวลาและยังไม่สร้าง attempt
    questions=await fetchExam();
  }catch(e){
    console.error(e);
    startingExam=false;
    document.querySelectorAll('.subject-start').forEach(b=>b.disabled=false);
    if(e?.code==='permission-denied'){
      subjectMessage(s,'ไม่สามารถโหลดข้อสอบได้: Firestore Rules หรือสิทธิ์ฐานข้อมูลไม่ตรงกับระบบ');
      return;
    }
    subjectMessage(s,e?.message||'ไม่สามารถโหลดข้อสอบได้ กรุณาลองใหม่');
    return;
  }

  startingExam=false;
  showPreExamInstructions();
}

function showPreExamInstructions(){
  if(!student||!selectedSubject)return showSubjectHome();

  $('screen-subject').classList.add('hidden');
  $('screen-exam').classList.add('hidden');
  $('screen-done').classList.add('hidden');
  $('screen-instructions').classList.remove('hidden');

  $('instructionSubjectName').textContent=`${selectedSubject.code} · ${selectedSubject.name}`;
  $('instructionStudent').innerHTML=`
    <b>${escapeHtml(student.name)}</b>
    <span>เลขนักศึกษา ${escapeHtml(student.studentId)}</span>
    <span>${escapeHtml(student.classLevel||'')} ${escapeHtml(student.classRoom||'')}</span>
    <span>${escapeHtml(student.department||'-')}</span>
    <span>${escapeHtml(student.major||'-')}${student.majorCode?` (${escapeHtml(student.majorCode)})`:''}</span>
  `;

  $('instructionRevealInfo').innerHTML=`
    <div class="critical-attempt-warning emergency-mode">
      <b>✅ ระบบสอบ Stable Core พร้อมใช้งาน</b>
      <div>เมื่อกด “เริ่มทำข้อสอบ” ระบบจะเข้าสู่ Fullscreen และเริ่มนับเวลา 75 นาทีทันที</div>
      <div><strong>การเริ่มสอบไม่พึ่ง examAttempts หรือ registrations จึงไม่ถูก Rules สองส่วนนี้ขวาง</strong></div>
      <div>เมื่อส่งข้อสอบ คำตอบจะถูกบันทึกลง <strong>submissions</strong> โดยตรง และ Admin จะเห็นคะแนนจากหน้า Dashboard</div>
    </div>
    <div class="reveal-note">
      ${wantsKey
        ? '<b>การรับเฉลย:</b> คุณเลือก “รับเฉลย” หลังส่งข้อสอบต้องรอ 30 นาทีจึงเปิดดูเฉลยได้ และเฉลยจะอยู่ให้ดูได้ 24 ชั่วโมงหลังเปิด'
        : '<b>การรับเฉลย:</b> คุณเลือก “ไม่รับเฉลย” ระบบจะไม่เปิดเฉลยหลังส่งข้อสอบ'
      }
    </div>
  `;

  $('instructionAccept').checked=false;
  $('instructionStartBtn').disabled=true;
  $('instructionMsg').classList.add('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
}

function backFromInstructions(){
  if(active)return;
  selectedSubject=null;
  questions=[];
  startingExam=false;
  $('instructionAccept').checked=false;
  document.querySelectorAll('.subject-start').forEach(b=>b.disabled=false);
  showSubjectHome();
}

async function beginExamFromInstructions(){
  if(startingExam||active)return;

  if(!$('instructionAccept').checked){
    showMsg('instructionMsg','กรุณาติ๊กยืนยันว่าได้อ่านและเข้าใจคำชี้แจงก่อนเริ่มสอบ');
    return;
  }

  hideMsg('instructionMsg');
  startingExam=true;
  $('instructionStartBtn').disabled=true;
  $('instructionBackBtn').disabled=true;

  // IMPORTANT:
  // Fullscreen must be requested immediately from the user's click.
  // No Firestore/network await is allowed before this call.
  try{
    await document.documentElement.requestFullscreen();
  }catch(e){
    console.error('fullscreen rejected',e);
    startingExam=false;
    $('instructionStartBtn').disabled=false;
    $('instructionBackBtn').disabled=false;
    showMsg(
      'instructionMsg',
      'ไม่สามารถเข้าสู่ Fullscreen ได้ กรุณาอนุญาต Fullscreen ใน Browser แล้วกด “เริ่มทำข้อสอบ” อีกครั้ง'
    );
    return;
  }

  // Stable Core: no examAttempts / registrations dependency.
  currentAttemptNumber=1;
  attemptToken=randomToken();
  registrationId=`stable_${studentAuth.currentUser?.uid||student.studentId}_${selectedSubject.id}_${Date.now()}`;

  startedAt=new Date().toISOString();
  answers=new Array(EXAM_COUNT).fill(-1);
  timeLeft=EXAM_SECONDS;
  current=0;
  violations=0;
  lastViolationAt=0;
  $('violations').textContent='0';

  $('screen-instructions').classList.add('hidden');
  $('screen-exam').classList.remove('hidden');
  $('examSubjectMini').textContent=`${selectedSubject.code} · ${selectedSubject.name}`;

  buildNav();
  buildWatermark();
  active=true;
  startingExam=false;
  $('instructionBackBtn').disabled=false;
  render();
  startTimer();

  // Best-effort tracking only. Failure here must NEVER stop the exam.
  updateStudentCheckinForSubject()
    .catch(e=>console.warn('checkin update skipped; exam continues',e));
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
    attemptNumber:currentAttemptNumber,
    maxAttempts:MAX_ATTEMPTS_PER_SUBJECT,
    examCount:EXAM_COUNT,
    maxScore:20,
    wantsKey
  };
}

function revealStorageKey(submissionId){
  return `nangrongReveal30::${submissionId}`;
}
function latestRevealPointerKey(){
  const uid=studentAuth.currentUser?.uid || student?.uid || '';
  return uid ? `nangrongLatestRevealKey::${uid}` : '';
}
function saveRevealState(submissionId,revealAt){
  const ownerUid=studentAuth.currentUser?.uid || student?.uid || '';
  const state={
    submissionId,
    revealAt,
    expiresAt: revealAt + REVEAL_KEEP_MS,
    wantsKey:true,
    ownerUid,
    studentId:student?.studentId||'',
    subjectId:selectedSubject.id,
    subjectCode:selectedSubject.code,
    subjectName:selectedSubject.name,
    questionIds:questions.map(q=>q.id),
    selectedOriginal:answers.map((a,i)=>a<0?-1:questions[i].originalIndices[a])
  };
  const storageKey=revealStorageKey(submissionId);
  localStorage.setItem(storageKey,JSON.stringify(state));
  const pointer=latestRevealPointerKey();
  if(pointer)localStorage.setItem(pointer,storageKey);
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
  const expiresAt=Number(state.expiresAt || (Number(state.revealAt)+REVEAL_KEEP_MS));
  if(Date.now()>expiresAt){
    const pointer=latestRevealPointerKey();
    const key=pointer?localStorage.getItem(pointer):null;
    if(key)localStorage.removeItem(key);
    if(pointer)localStorage.removeItem(pointer);
    updatePendingRevealShortcut();
    showSubjectHome();
    return;
  }

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
  const state=getPendingRevealState();
  if(!state)return false;
  showDoneForReveal(state);
  startRevealCountdown(state);
  return true;
}

function getPendingRevealState(){
  const user=studentAuth.currentUser;
  if(!user || !student)return null;

  const pointer=latestRevealPointerKey();
  if(!pointer)return null;

  const key=localStorage.getItem(pointer);
  if(!key)return null;

  try{
    const state=JSON.parse(localStorage.getItem(key)||'null');
    if(!state||!state.wantsKey||!state.submissionId)return null;

    // ป้องกัน User คนอื่นเห็นเฉลยของบัญชีเดิมบนเครื่องเดียวกัน
    if(state.ownerUid && state.ownerUid!==user.uid)return null;
    if(state.studentId && state.studentId!==student.studentId)return null;

    const expiresAt=Number(state.expiresAt || (Number(state.revealAt)+REVEAL_KEEP_MS));

    // เก็บเฉลยไว้ 1 วันหลังจากเวลาเปิดเฉลย
    if(Date.now()>expiresAt){
      localStorage.removeItem(key);
      localStorage.removeItem(pointer);
      return null;
    }

    state.expiresAt=expiresAt;
    return state;
  }catch{
    return null;
  }
}

function updatePendingRevealShortcut(){
  const box=$('pendingRevealShortcut');
  if(!box)return;

  // แสดงแท็กเฉลยเฉพาะเมื่อ User Login แล้วเท่านั้น
  if(!studentAuth.currentUser || !student){
    box.classList.add('hidden');
    return;
  }

  const state=getPendingRevealState();
  if(!state){
    box.classList.add('hidden');
    return;
  }

  const now=Date.now();
  const revealAt=Number(state.revealAt);
  const expiresAt=Number(state.expiresAt || (revealAt+REVEAL_KEEP_MS));
  const remain=Math.max(0,Math.ceil((revealAt-now)/1000));

  if(now<revealAt){
    $('pendingRevealShortcutText').textContent =
      `วิชา ${state.subjectCode||''} ${state.subjectName||''} · เฉลยจะเปิดในอีกประมาณ ${formatReveal(remain)}`;
  }else{
    const keepRemain=Math.max(0,Math.ceil((expiresAt-now)/1000));
    const h=Math.floor(keepRemain/3600);
    const m=Math.floor((keepRemain%3600)/60);
    $('pendingRevealShortcutText').textContent =
      `วิชา ${state.subjectCode||''} ${state.subjectName||''} · เฉลยพร้อมเปิดแล้ว และจะหายไปในประมาณ ${h} ชม. ${m} นาที`;
  }

  box.classList.remove('hidden');
}

function hideAllStudentScreens(){
  ['screen-register','screen-subject','screen-instructions','screen-exam','screen-done'].forEach(id=>$(id)?.classList.add('hidden'));
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
    alert('ไม่พบเฉลยที่กำลังรออยู่ หรือเฉลยหมดอายุแล้ว');
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
    lastSubmissionContext={
      submissionId:ref.id,
      subjectId:selectedSubject.id,
      subjectCode:selectedSubject.code,
      subjectName:selectedSubject.name,
      attemptNumber:currentAttemptNumber,
      status
    };

    // Emergency mode: ไม่เขียน examAttempts

    if(checkinId){
      try{
        await setDoc(doc(studentDb,'studentCheckins',checkinId),{
          status: status==='terminated' ? 'terminated' : status==='forfeited' ? 'forfeited' : 'completed',
          submissionId:ref.id,
          completedAt:serverTimestamp(),
          completedAtClient:new Date().toISOString()
        },{merge:true});
      }catch(e){console.warn('update checkin status failed',e)}
    }

    if(wantsKey && status!=='terminated' && status!=='forfeited'){
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

  if(!wantsKey || status==='terminated' || status==='forfeited'){
    $('revealWaiting').classList.add('hidden');
    $('reviewSection').classList.add('hidden');
    if(status==='terminated'){
      $('doneKeyText').innerHTML='<strong class="danger-text">🚨 การสอบรอบนี้ถูกยุติจากพฤติกรรมต้องสงสัย</strong><br>รอบที่ถูกยุติจะไม่ได้รับเฉลย กรุณาติดต่อ Admin หากต้องการสอบใหม่';
    }else if(status==='forfeited'){
      $('doneKeyText').innerHTML='<strong class="danger-text">คุณยืนยันสละสิทธิ์สอบกลางคันแล้ว</strong><br>การสอบรอบนี้สิ้นสุดและไม่มีเฉลย กรุณาติดต่อ Admin หากต้องการสอบใหม่';
    }else{
      $('doneKeyText').textContent='คุณเลือกไม่รับเฉลย ระบบจะไม่แสดงคะแนนหรือเฉลยในหน้าผู้เข้าสอบ';
    }
  }

  const validForRequests=status==='submitted';
  $('postExamRequests')?.classList.toggle('hidden',!validForRequests);
  $('requestScoreBtn').disabled=!validForRequests;
  $('requestRetakeBtn').disabled=!validForRequests;
  $('requestActionMsg').textContent=validForRequests
    ? 'คุณสามารถส่งคำร้องได้ โดย Admin จะเป็นผู้ตรวจสอบและอนุมัติเป็นรายบุคคล'
    : 'รอบที่ถูกยุติหรือสละสิทธิ์ไม่สามารถส่งคำร้องดูคะแนน/สอบแก้จากรอบนี้ได้';

  try{document.exitFullscreen?.()}catch{}
}
function violation(reason='พฤติกรรมต้องสงสัย'){
  if(!active)return;
  const now=Date.now();
  if(now-lastViolationAt<900)return; // prevent one action firing multiple browser events
  lastViolationAt=now;
  violations++;
  $('violations').textContent=violations;
  if(violations>MAX_VIOLATIONS){
    $('fullscreenGuardOverlay')?.classList.add('hidden');
    finish('terminated').then(()=>$('lockOverlay').classList.remove('hidden'));
    return;
  }
  if(active && !document.fullscreenElement){
    $('fullscreenGuardOverlay')?.classList.remove('hidden');
  }
}

// ไม่บังคับพาผู้ใช้กลับไปหน้าเฉลยอัตโนมัติ เพื่อไม่ให้ติดอยู่หน้าเดิม
// หากมีเฉลยที่กำลังรอ จะมีปุ่ม "ดูสถานะเฉลย" ที่หน้าหลักแทน
updatePendingRevealShortcut();


// ---------- UI bindings ----------
$('showLoginBtn').onclick=showLogin;
$('showRegisterBtn').onclick=showRegister;
fillDepartmentSelect();
$('department').addEventListener('change',()=>{
  fillMajorSelect($('department').value);
});
$('major').addEventListener('change',updateMajorCode);
$('registerContinueBtn').onclick=registerUser;
$('studentLoginBtn').onclick=loginUser;
$('studentLogoutTopBtn').onclick=logoutUser;
$('studentHomeBtn').onclick=showAuthHome;
$('backHomeBtn').onclick=showAuthHome;
$('anotherSubjectBtn').onclick=showSubjectHome;
$('logoutStudentBtn').onclick=logoutUser;
$('openPendingRevealBtn').onclick=openPendingReveal;
$('instructionAccept').addEventListener('change',()=>{
  $('instructionStartBtn').disabled=!$('instructionAccept').checked;
  if($('instructionAccept').checked)hideMsg('instructionMsg');
});
$('instructionStartBtn').onclick=beginExamFromInstructions;
$('instructionBackBtn').onclick=backFromInstructions;
$('refreshRequestsBtn').onclick=()=>{startMyRequestListener();renderMyRequests()};
$('requestScoreBtn').onclick=()=>createExamRequest('score_view');
$('requestRetakeBtn').onclick=()=>createExamRequest('retake');
$('forfeitBtn').onclick=()=>{
  if(!active)return;
  const ok=confirm(
    'ยืนยันสละสิทธิ์สอบกลางคัน?\\n\\n'+
    '• การสอบจะสิ้นสุดทันที\\n'+
    '• รอบนี้นับเป็นสิทธิ์สอบ 1 ครั้ง\\n'+
    '• ไม่สามารถกลับมาแก้คำตอบในรอบนี้\\n'+
    '• รอบที่สละสิทธิ์จะไม่ได้รับเฉลย'
  );
  if(ok)finish('forfeited');
};
$('returnFullscreenBtn').onclick=async()=>{
  if(!active){
    $('fullscreenGuardOverlay').classList.add('hidden');
    return;
  }
  try{
    await document.documentElement.requestFullscreen();
    $('fullscreenGuardOverlay').classList.add('hidden');
  }catch{
    alert('กรุณาอนุญาต Fullscreen เพื่อทำข้อสอบต่อ');
  }
};



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

document.addEventListener('visibilitychange',()=>{
  if(active && document.hidden)violation('ออกจากหน้าสอบ/พับหน้าต่าง');
  if(active && !document.hidden && !document.fullscreenElement){
    $('fullscreenGuardOverlay')?.classList.remove('hidden');
  }
});
window.addEventListener('blur',()=>{
  if(active)violation('หน้าต่างสอบไม่ได้อยู่ด้านหน้า');
});
document.addEventListener('fullscreenchange',()=>{
  if(active&&!document.fullscreenElement){
    violation('ออกจาก Fullscreen');
    $('fullscreenGuardOverlay')?.classList.remove('hidden');
  }else if(document.fullscreenElement){
    $('fullscreenGuardOverlay')?.classList.add('hidden');
  }
});
['copy','cut','paste','contextmenu'].forEach(evt=>document.addEventListener(evt,e=>{
  if(active){e.preventDefault();violation(evt)}
}));
document.addEventListener('keydown',e=>{
  if(!active)return;
  const k=e.key.toLowerCase();
  const devtools =
    e.key==='F12' ||
    ((e.ctrlKey||e.metaKey)&&e.shiftKey&&['i','j','c'].includes(k)) ||
    ((e.ctrlKey||e.metaKey)&&['u','s','p','c','v','x'].includes(k));
  if(devtools){
    e.preventDefault();
    e.stopPropagation();
    violation('คีย์ลัดต้องห้าม / View Source / Developer Tools');
  }
},true);
window.addEventListener('beforeunload',e=>{
  if(active){e.preventDefault();e.returnValue=''}
});

// ไม่บังคับ Auto Resume หน้าเฉลย และไม่แสดงแท็กจนกว่า User จะ Login

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
