import { auth, db, isFirebaseConfigured } from './firebase-service.js';
import { firebaseConfig, ADMIN_USERNAME, ADMIN_AUTH_EMAIL, ADMIN_UID } from './firebase-config.js';
import { SUBJECTS } from './subjects.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import { collection, getDocs, doc, deleteDoc, writeBatch, serverTimestamp, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const $=id=>document.getElementById(id);
let questionRows=[],answerMap=new Map(),editId=null,lastRegs=[],lastSubs=[],lastStudentUsers=[],liveUnsubs=[],bankEnsured=false;
const provisionApp=initializeApp(firebaseConfig,'nangrongProvisionApp');
const provisionAuth=getAuth(provisionApp);
const studentEmail=id=>`${id}@student.nangrong.invalid`;

function esc(s){const d=document.createElement('div');d.textContent=s??'';return d.innerHTML}
function norm(s){return String(s??'').trim()}
function fmtDate(x){if(!x)return '-';try{const d=x.toDate?x.toDate():new Date(x);return d.toLocaleString('th-TH')}catch{return '-'}}
function subjectById(id){return SUBJECTS.find(s=>s.id===id)}
function subjectLabel(id,code,name){const s=subjectById(id);return s?`${s.code} ${s.name}`:`${code||''} ${name||''}`.trim()}
function fillSubjectSelect(el,all=false,emptyLabel='ทุกวิชา'){
  el.innerHTML=all?`<option value="">${emptyLabel}</option>`:'';
  SUBJECTS.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=`${s.code} · ${s.name}`;el.appendChild(o)})
}
function statusLabel(s){
  if(s==='registered')return 'ลงทะเบียนแล้ว';
  if(s==='exam_started')return 'กำลังสอบ';
  if(s==='completed')return 'ส่งข้อสอบแล้ว';
  if(s==='terminated')return 'ยุติการสอบ';
  return s||'-';
}
function statusClass(s){
  if(s==='completed')return 'ok';
  if(s==='exam_started')return 'warn';
  if(s==='terminated')return 'bad';
  return 'info';
}
function uniqueClasses(source){
  return [...new Set(source.map(x=>norm(x.className||x.student?.className)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));
}
function fillClassSelect(el,source){
  const current=el.value;
  el.innerHTML='<option value="">ทุกชั้น / ห้อง</option>';
  uniqueClasses(source).forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;el.appendChild(o)});
  if([...el.options].some(o=>o.value===current))el.value=current;
}
function matchesSearch(parts,term){
  if(!term)return true;
  const t=term.toLowerCase();
  return parts.some(v=>String(v||'').toLowerCase().includes(t));
}

[$('resultSubjectFilter'),$('regSubjectFilter'),$('questionSubjectFilter')].forEach(x=>fillSubjectSelect(x,true));
fillSubjectSelect($('qSubject'));
fillSubjectSelect($('newStudentSubject'),true,'ยังไม่กำหนดวิชา');

async function loadBuiltInBank(){
  const res=await fetch('./initial-question-bank-all-subjects.json',{cache:'no-store'});
  if(!res.ok)throw new Error('โหลดคลังข้อสอบสำเร็จรูปไม่สำเร็จ');
  const arr=await res.json();
  if(!Array.isArray(arr)||arr.length!==550)throw new Error('คลังข้อสอบสำเร็จรูปต้องมี 550 ข้อ');
  return arr;
}
async function deleteDocs(docs){
  for(let i=0;i<docs.length;i+=350){
    const b=writeBatch(db);
    docs.slice(i,i+350).forEach(d=>b.delete(d.ref));
    await b.commit();
  }
}
async function writeBuiltInBank(arr,{replace=false}={}){
  if(replace){
    const [oldQ,oldA]=await Promise.all([getDocs(collection(db,'questions')),getDocs(collection(db,'answerKeys'))]);
    await deleteDocs([...oldQ.docs,...oldA.docs]);
  }
  const existing=replace?new Set():new Set((await getDocs(collection(db,'questions'))).docs.map(d=>d.id));
  let b=writeBatch(db),ops=0;
  for(let i=0;i<arr.length;i++){
    const x=arr[i],id=x.id||`${x.subjectCode}-q-${i+1}`;
    if(existing.has(id))continue;
    b.set(doc(db,'questions',id),{
      subjectId:x.subjectId,subjectCode:x.subjectCode,subjectName:x.subjectName,
      theme:x.theme||'',q:x.q,options:x.options,active:true,order:(i%50)+1,
      level:x.level||'',builtIn:true
    });
    b.set(doc(db,'answerKeys',id),{correct:Number(x.correct),explain:x.explain||'',builtIn:true});
    ops+=2;
    if(ops>=350){await b.commit();b=writeBatch(db);ops=0}
  }
  if(ops)await b.commit();
}
async function ensureBuiltInQuestionBank(){
  if(bankEnsured)return;
  bankEnsured=true;
  try{
    const q=await getDocs(collection(db,'questions'));
    if(q.size>=550)return;
    await writeBuiltInBank(await loadBuiltInBank(),{replace:false});
  }catch(e){
    bankEnsured=false;
    console.error(e);
    alert('ระบบเติมข้อสอบสำเร็จรูปลง Firebase ไม่สำเร็จ: '+(e.message||e));
  }
}

function stopLive(){liveUnsubs.forEach(fn=>{try{fn()}catch{}});liveUnsubs=[]}
function startLive(){
  stopLive();
  liveUnsubs.push(onSnapshot(collection(db,'studentCheckins'),snap=>{
    lastRegs=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderRealtimeAreas();
  },e=>console.warn('studentCheckins live error',e)));
  liveUnsubs.push(onSnapshot(collection(db,'studentUsers'),snap=>{
    lastStudentUsers=snap.docs.map(d=>({uid:d.id,...d.data()}));
    renderRealtimeAreas();
  },e=>console.warn('studentUsers live error',e)));
  liveUnsubs.push(onSnapshot(collection(db,'submissions'),snap=>{
    lastSubs=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderRealtimeAreas();
  },e=>console.warn('submissions live error',e)));
}
function renderRealtimeAreas(){
  fillClassSelect($('regClassFilter'),lastRegs);
  fillClassSelect($('resultClassFilter'),lastSubs);
  updateMetrics();
  renderDashboard();
  renderRegs();
  renderResults();
  renderQuestionSubjectManager();
}

$('loginBtn').onclick=async()=>{
  $('loginMsg').classList.add('hidden');
  if(!isFirebaseConfigured()){ $('loginMsg').textContent='ยังไม่ได้ตั้งค่า Firebase';$('loginMsg').classList.remove('hidden');return }
  if(norm($('adminUser').value)!==ADMIN_USERNAME){$('loginMsg').textContent='ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';$('loginMsg').classList.remove('hidden');return}
  $('loginBtn').disabled=true;
  try{
    await setPersistence(auth,browserSessionPersistence);
    await signInWithEmailAndPassword(auth,ADMIN_AUTH_EMAIL,$('adminPass').value);
  }catch(e){
    console.error(e);$('loginMsg').textContent=`Firebase Error: ${e.code||'unknown'} | ${e.message||''}`;$('loginMsg').classList.remove('hidden');
  }finally{$('loginBtn').disabled=false}
};
$('logoutBtn').onclick=()=>signOut(auth);

onAuthStateChanged(auth,async user=>{
  if(user&&ADMIN_UID&&!ADMIN_UID.startsWith('PASTE_')&&user.uid===ADMIN_UID){
    $('loginCard').classList.add('hidden');$('adminApp').classList.remove('hidden');
    await ensureBuiltInQuestionBank();
    await renderAll();
    startLive();
  }else{
    stopLive();
    if(user)await signOut(auth);
    $('loginCard').classList.remove('hidden');$('adminApp').classList.add('hidden');
  }
});

async function fetchAll(){
  const [q,a,r,s,u]=await Promise.all([
    getDocs(collection(db,'questions')),getDocs(collection(db,'answerKeys')),
    getDocs(collection(db,'studentCheckins')),getDocs(collection(db,'submissions')),
    getDocs(collection(db,'studentUsers'))
  ]);
  questionRows=q.docs.map(d=>({id:d.id,...d.data()}));
  answerMap=new Map(a.docs.map(d=>[d.id,d.data()]));
  lastRegs=r.docs.map(d=>({id:d.id,...d.data()}));
  lastSubs=s.docs.map(d=>({id:d.id,...d.data()}));
  lastStudentUsers=u.docs.map(d=>({uid:d.id,...d.data()}));
  return {questions:questionRows,registrations:lastRegs,submissions:lastSubs,studentUsers:lastStudentUsers};
}
function scoreOf(s){
  let correct=0;
  (s.questionIds||[]).forEach((qid,i)=>{
    const key=answerMap.get(qid);
    if(key&&Number(s.selectedOriginal?.[i])===Number(key.correct))correct++;
  });
  return {correct,score:+(correct*20/50).toFixed(2)};
}
function updateMetrics(){
  $('mQuestions').textContent=questionRows.length;
  $('mSubjects').textContent=SUBJECTS.filter(s=>questionRows.filter(q=>q.subjectId===s.id&&q.active!==false).length>=50).length;
  $('mRegs').textContent=lastRegs.length;
  $('mActive').textContent=lastRegs.filter(r=>r.status==='exam_started').length;
  $('mSubs').textContent=lastSubs.length;
  const vals=lastSubs.map(scoreOf);
  $('mAvg').textContent=vals.length?(vals.reduce((a,b)=>a+b.score,0)/vals.length).toFixed(2):'0.00';
}
async function renderAll(){
  try{
    await fetchAll();
    fillClassSelect($('regClassFilter'),lastRegs);
    fillClassSelect($('resultClassFilter'),lastSubs);
    updateMetrics();renderDashboard();renderResults();renderRegs();renderQuestionSubjectManager();renderQuestions();
  }catch(e){
    console.error(e);
    alert('อ่านข้อมูลจาก Firebase ไม่สำเร็จ กรุณาตรวจสอบ Firestore Rules');
  }
}

function renderDashboard(){
  const counts={registered:0,exam_started:0,completed:0,terminated:0};
  lastRegs.forEach(r=>{if(counts[r.status]!==undefined)counts[r.status]++});
  $('dRegistered').textContent=counts.registered;
  $('dStarted').textContent=counts.exam_started;
  $('dCompleted').textContent=counts.completed;
  $('dTerminated').textContent=counts.terminated;

  const tb=$('subjectSummaryRows');tb.innerHTML='';
  SUBJECTS.forEach(s=>{
    const qs=questionRows.filter(q=>q.subjectId===s.id&&q.active!==false).length;
    const regs=lastRegs.filter(r=>r.subjectId===s.id).length;
    const subs=lastSubs.filter(r=>r.subjectId===s.id);
    const scores=subs.map(scoreOf);
    const avg=scores.length?(scores.reduce((a,b)=>a+b.score,0)/scores.length).toFixed(2):'-';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><b>${esc(s.code)}</b></td><td>${esc(s.name)}</td><td>${qs}</td><td>${regs}</td><td>${subs.length}</td><td>${avg}</td>`;
    tb.appendChild(tr);
  });
}
$('refreshDashboard').onclick=renderAll;

function filteredResults(){
  const subject=$('resultSubjectFilter').value;
  const room=$('resultClassFilter').value;
  const term=norm($('resultSearch').value);
  return lastSubs.filter(s=>
    (!subject||s.subjectId===subject) &&
    (!room||norm(s.student?.className)===room) &&
    matchesSearch([s.student?.studentId,s.student?.name,s.student?.className,s.student?.department,s.subjectCode,s.subjectName],term)
  ).sort((a,b)=>(b.submittedAt?.seconds||0)-(a.submittedAt?.seconds||0));
}
function renderResults(){
  const tb=$('resultRows');tb.innerHTML='';
  filteredResults().forEach(s=>{
    const sc=scoreOf(s),tr=document.createElement('tr');
    tr.innerHTML=`<td>${fmtDate(s.submittedAt||s.submittedAtClient)}</td><td>${esc(subjectLabel(s.subjectId,s.subjectCode,s.subjectName))}</td><td>${esc(s.student?.studentId)}</td><td>${esc(s.student?.name)}</td><td>${esc(s.student?.className)}</td><td>${esc(s.student?.department)}</td><td><span class="status-chip ${statusClass(s.status)}">${esc(s.status||'submitted')}</span></td><td>${sc.correct}/50</td><td><b>${sc.score.toFixed(2)}</b></td><td><button class="btn danger small">ลบ</button></td>`;
    tr.querySelector('button').onclick=async()=>{if(confirm('ลบผลสอบรายการนี้?'))await deleteDoc(doc(db,'submissions',s.id))};
    tb.appendChild(tr);
  });
}

function filteredRegs(){
  const subject=$('regSubjectFilter').value;
  const room=$('regClassFilter').value;
  const status=$('regStatusFilter').value;
  const term=norm($('regSearch').value);
  return lastRegs.filter(r=>
    (!subject||r.subjectId===subject) &&
    (!room||norm(r.className)===room) &&
    (!status||r.status===status) &&
    matchesSearch([r.studentId,r.name,r.className,r.department,r.subjectCode,r.subjectName],term)
  ).sort((a,b)=>(b.registeredAt?.seconds||0)-(a.registeredAt?.seconds||0));
}
function renderRegs(){
  const rows=filteredRegs(),tb=$('regRows');tb.innerHTML='';
  $('visibleUserCount').textContent=rows.length;
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    const subject=r.subjectId?subjectLabel(r.subjectId,r.subjectCode,r.subjectName):'ยังไม่เลือกวิชา';
    tr.innerHTML=`<td>${fmtDate(r.registeredAt||r.registeredAtClient)}</td><td>${esc(subject)}</td><td>${esc(r.studentId)}</td><td>${esc(r.name)}</td><td>${esc(r.className)}</td><td>${esc(r.department)}</td><td><span class="status-chip ${statusClass(r.status)}">${esc(statusLabel(r.status))}</span></td><td><button class="btn danger small">ลบ User</button></td>`;
    tr.querySelector('button').onclick=async()=>deleteUserFromSystem(r);
    tb.appendChild(tr);
  });
}

async function deleteUserFromSystem(r){
  const ownerUid=r.ownerUid || lastStudentUsers.find(u=>u.studentId===r.studentId)?.uid || '';
  const label=r.name||r.studentId;
  if(!confirm(`ลบ User ${label} ออกจากระบบ?\\n\\nUser นี้จะเข้าใช้งานระบบสอบไม่ได้อีก แต่ผลสอบเดิมจะยังถูกเก็บไว้`))return;

  try{
    const checkins=lastRegs.filter(x=>
      (ownerUid && x.ownerUid===ownerUid) ||
      (!ownerUid && x.studentId===r.studentId)
    );

    for(let i=0;i<checkins.length;i+=300){
      const b=writeBatch(db);
      checkins.slice(i,i+300).forEach(x=>b.delete(doc(db,'studentCheckins',x.id)));
      await b.commit();
    }

    if(ownerUid){
      await deleteDoc(doc(db,'studentUsers',ownerUid));
    }else{
      const profile=lastStudentUsers.find(u=>u.studentId===r.studentId);
      if(profile)await deleteDoc(doc(db,'studentUsers',profile.uid));
    }

    alert(`ลบ User ${label} ออกจากระบบแล้ว\\nผลสอบเดิมยังคงอยู่`);
    await renderAll();
  }catch(e){
    console.error(e);
    alert('ลบ User ไม่สำเร็จ: '+(e.message||e));
  }
}

$('toggleAddUser').onclick=()=>$('addUserPanel').classList.toggle('hidden');
$('cancelAddUser').onclick=()=>$('addUserPanel').classList.add('hidden');
$('saveNewUser').onclick=async()=>{
  $('addUserMsg').classList.add('hidden');
  const studentId=norm($('newStudentId').value),name=norm($('newStudentName').value);
  const classLevel=norm($('newStudentClassLevel').value),classRoom=norm($('newStudentClassRoom').value);
  const className=classLevel && classRoom ? `${classLevel}${classRoom}` : '';
  const department=norm($('newStudentDept').value);
  const password=$('newStudentPassword').value;
  const subjectId=$('newStudentSubject').value,status=$('newStudentStatus').value;
  if(!studentId||!name||!className||!department){
    $('addUserMsg').textContent='กรุณากรอกเลขนักศึกษา ชื่อ เลือกระดับชั้น และแผนกให้ครบ';$('addUserMsg').classList.remove('hidden');return;
  }
  if(!/^\d+$/.test(studentId)){
    $('addUserMsg').textContent='เลขนักศึกษาต้องเป็นตัวเลขเท่านั้น';$('addUserMsg').classList.remove('hidden');return;
  }
  if(password.length<6){
    $('addUserMsg').textContent='รหัสผ่านเริ่มต้นต้องมีอย่างน้อย 6 ตัวอักษร';$('addUserMsg').classList.remove('hidden');return;
  }
  const s=subjectId?subjectById(subjectId):null;
  $('saveNewUser').disabled=true;
  try{
    const cred=await createUserWithEmailAndPassword(provisionAuth,studentEmail(studentId),password);
    await setDoc(doc(db,'studentUsers',cred.user.uid),{
      studentId,name,className,department,wantsKey:true,email:studentEmail(studentId),
      active:true,createdByAdmin:true,createdAt:serverTimestamp(),createdAtClient:new Date().toISOString()
    });
    await setDoc(doc(db,'studentCheckins',`admin-${Date.now()}-${crypto.randomUUID()}`),{
      ownerUid:cred.user.uid,studentId,name,className,department,status,
      subjectId:s?.id||'',subjectCode:s?.code||'',subjectName:s?.name||'',
      wantsKey:true,createdByAdmin:true,registeredAt:serverTimestamp(),registeredAtClient:new Date().toISOString()
    });
    await signOut(provisionAuth);
    ['newStudentId','newStudentName','newStudentClassLevel','newStudentClassRoom','newStudentDept','newStudentPassword'].forEach(id=>$(id).value='');
    $('newStudentSubject').value='';$('newStudentStatus').value='registered';$('addUserPanel').classList.add('hidden');
    alert(`สร้าง User ${studentId} สำเร็จ`);
  }catch(e){
    console.error(e);
    let msg='เพิ่ม User ไม่สำเร็จ: '+(e.message||e);
    if(e?.code==='auth/email-already-in-use')msg='เลขนักศึกษานี้มีบัญชี Login อยู่แล้ว';
    $('addUserMsg').textContent=msg;$('addUserMsg').classList.remove('hidden');
    try{await signOut(provisionAuth)}catch{}
  }finally{$('saveNewUser').disabled=false}
};

function renderQuestionSubjectManager(){
  const tb=$('questionSubjectRows');
  if(!tb)return;
  tb.innerHTML='';
  SUBJECTS.forEach(s=>{
    const qs=questionRows.filter(q=>q.subjectId===s.id&&q.active!==false)
      .sort((a,b)=>(a.order||0)-(b.order||0));
    const tr=document.createElement('tr');
    const status=qs.length===50?'ครบ 50 ข้อ':(qs.length<50?`ขาด ${50-qs.length} ข้อ`:`เกิน ${qs.length-50} ข้อ`);
    tr.innerHTML=`
      <td><b>${esc(s.code)}</b></td>
      <td>${esc(s.name)}</td>
      <td><b>${qs.length}</b> <span class="muted">(${status})</span></td>
      <td>
        <div class="row">
          <button class="btn small add-one">+ เพิ่มข้อ</button>
          <button class="btn secondary small inspect">ตรวจข้อสอบ/เฉลย</button>
          <button class="btn danger small remove-one" ${qs.length===0?'disabled':''}>− ลด 1 ข้อ</button>
        </div>
      </td>`;
    tr.querySelector('.add-one').onclick=()=>{
      $('qSubject').value=s.id;
      clearQForm();
      $('qSubject').value=s.id;
      $('qText').focus();
      scrollTo({top:$('tab-questions').offsetTop+220,behavior:'smooth'});
    };
    tr.querySelector('.inspect').onclick=()=>{
      $('questionSubjectFilter').value=s.id;
      renderQuestions();
      scrollTo({top:$('questionList').offsetTop-80,behavior:'smooth'});
    };
    tr.querySelector('.remove-one').onclick=async()=>{
      if(!qs.length)return;
      const q=qs[qs.length-1];
      if(!confirm(`ลดข้อสอบวิชา ${s.code} ลง 1 ข้อ?\\n\\nจะลบข้อสุดท้าย:\\n${q.q}`))return;
      const b=writeBatch(db);
      b.delete(doc(db,'questions',q.id));
      b.delete(doc(db,'answerKeys',q.id));
      await b.commit();
      await renderAll();
    };
    tb.appendChild(tr);
  });
}

function renderQuestions(){
  const f=$('questionSubjectFilter').value,list=$('questionList');list.innerHTML='';
  const rows=questionRows.filter(q=>!f||q.subjectId===f)
    .sort((a,b)=>(a.subjectCode||'').localeCompare(b.subjectCode||'')||(a.order||0)-(b.order||0));

  if($('questionVisibleCount'))$('questionVisibleCount').textContent=`${rows.length} ข้อ`;

  if(!rows.length){
    list.innerHTML='<div class="notice">ยังไม่มีข้อสอบในรายวิชานี้</div>';
    return;
  }

  rows.forEach((q,idx)=>{
      const key=answerMap.get(q.id)||{};
      const correct=Number(key.correct);
      const answerText=(q.options||[])[correct]??'-';
      const thaiChoice=['ก','ข','ค','ง'][correct]||'-';
      const d=document.createElement('div');d.className='admin-question';
      d.innerHTML=`
        <div class="qtitle">
          <span class="pill">${esc(q.subjectCode||'')}</span>
          <span class="pill">${idx+1}</span>
          ${esc(q.q)}
        </div>
        <ol type="A">${(q.options||[]).map((o,i)=>`<li class="${i===correct?'correct-choice':''}">${esc(o)}${i===correct?' <b>✓ คำตอบที่ถูก</b>':''}</li>`).join('')}</ol>
        <div class="answer-review">
          <div><b>เฉลย:</b> ${thaiChoice}. ${esc(answerText)}</div>
          <div><b>คำอธิบาย:</b> ${esc(key.explain||'ยังไม่มีคำอธิบาย')}</div>
          <div class="muted"><b>ระดับ:</b> ${esc(q.level||'-')} · ID: ${esc(q.id)}</div>
        </div>
        <div class="row topgap">
          <button class="btn secondary small edit">แก้ไข</button>
          <button class="btn danger small del">ลบข้อนี้</button>
        </div>`;
      d.querySelector('.edit').onclick=()=>editQ(q.id);
      d.querySelector('.del').onclick=async()=>{
        if(confirm('ลบข้อสอบข้อนี้พร้อมเฉลย?')){
          const b=writeBatch(db);b.delete(doc(db,'questions',q.id));b.delete(doc(db,'answerKeys',q.id));await b.commit();await renderAll();
        }
      };
      list.appendChild(d);
    });
}
function editQ(id){
  const q=questionRows.find(x=>x.id===id),key=answerMap.get(id)||{};editId=id;
  $('qSubject').value=q.subjectId;$('qText').value=q.q;$('qCorrect').value=String(key.correct??0);$('qLevel').value=q.level||'easy';
  (q.options||[]).forEach((o,j)=>$(`o${j}`).value=o);$('qExplain').value=key.explain||'';
  $('saveQuestion').textContent='บันทึกการแก้ไข';$('cancelEdit').classList.remove('hidden');
  scrollTo({top:$('tab-questions').offsetTop-20,behavior:'smooth'});
}
function clearQForm(){
  editId=null;['qText','o0','o1','o2','o3','qExplain'].forEach(id=>$(id).value='');
  $('qCorrect').value='0';$('qLevel').value='easy';$('saveQuestion').textContent='เพิ่มข้อสอบ';$('cancelEdit').classList.add('hidden');$('qMsg').classList.add('hidden');
}
$('saveQuestion').onclick=async()=>{
  const subj=subjectById($('qSubject').value);
  const nextOrder=editId?(questionRows.find(x=>x.id===editId)?.order||0):(questionRows.filter(x=>x.subjectId===subj.id).length+1);
  const q={subjectId:subj.id,subjectCode:subj.code,subjectName:subj.name,theme:subj.theme,q:norm($('qText').value),options:[0,1,2,3].map(i=>norm($(`o${i}`).value)),level:$('qLevel').value,order:nextOrder,active:true,updatedAt:serverTimestamp()};
  const key={correct:Number($('qCorrect').value),explain:norm($('qExplain').value),updatedAt:serverTimestamp()};
  if(!q.q||q.options.some(x=>!x)){$('qMsg').textContent='กรุณากรอกคำถามและตัวเลือกทั้ง 4 ข้อให้ครบ';$('qMsg').classList.remove('hidden');return}
  const id=editId||`${subj.code}-${crypto.randomUUID()}`;
  const b=writeBatch(db);b.set(doc(db,'questions',id),q,{merge:true});b.set(doc(db,'answerKeys',id),key,{merge:true});await b.commit();
  clearQForm();await renderAll();
};
$('cancelEdit').onclick=clearQForm;
$('resetQuestions').onclick=async()=>{
  if(!confirm('คืนค่าข้อสอบมาตรฐาน 550 ข้อ? การทำรายการนี้จะแทนที่คลังข้อสอบและเฉลยปัจจุบัน'))return;
  $('resetQuestions').disabled=true;
  try{await writeBuiltInBank(await loadBuiltInBank(),{replace:true});alert('คืนค่าข้อสอบมาตรฐาน 550 ข้อสำเร็จ');await renderAll()}
  catch(e){alert('คืนค่าไม่สำเร็จ: '+(e.message||e))}
  finally{$('resetQuestions').disabled=false}
};

function excelAvailable(){return typeof window.XLSX!=='undefined'}
function saveWorkbook(sheets,filename){
  if(!excelAvailable()){alert('โมดูล Excel ยังโหลดไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');return}
  const wb=XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name,rows])=>{
    const ws=XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));
  });
  XLSX.writeFile(wb,filename);
}
function resultExportRows(){
  return filteredResults().map(s=>{const sc=scoreOf(s);return {
    'วันเวลา':fmtDate(s.submittedAt||s.submittedAtClient),'รหัสวิชา':s.subjectCode||'','รายวิชา':s.subjectName||'',
    'เลขนักศึกษา':s.student?.studentId||'','ชื่อ-นามสกุล':s.student?.name||'','ชั้น/ห้อง':s.student?.className||'','แผนก':s.student?.department||'',
    'สถานะ':s.status||'submitted','ถูก/50':sc.correct,'คะแนน/20':sc.score
  }});
}
function userExportRows(){
  return filteredRegs().map(r=>({
    'วันเวลา':fmtDate(r.registeredAt||r.registeredAtClient),'รหัสวิชา':r.subjectCode||'','รายวิชา':r.subjectName||'',
    'เลขนักศึกษา':r.studentId||'','ชื่อ-นามสกุล':r.name||'','ชั้น/ห้อง':r.className||'','แผนก':r.department||'','สถานะ':statusLabel(r.status)
  }));
}
$('exportResultsExcel').onclick=()=>saveWorkbook({'ผลสอบ':resultExportRows()},`ผลสอบ-${new Date().toISOString().slice(0,10)}.xlsx`);
$('exportUsersExcel').onclick=()=>saveWorkbook({'ผู้เข้าสอบ':userExportRows()},`ผู้เข้าสอบ-${new Date().toISOString().slice(0,10)}.xlsx`);
$('exportAllExcel').onclick=()=>{
  const summary=SUBJECTS.map(s=>{
    const subs=lastSubs.filter(x=>x.subjectId===s.id),scores=subs.map(scoreOf);
    return {'รหัสวิชา':s.code,'รายวิชา':s.name,'ข้อสอบ':questionRows.filter(q=>q.subjectId===s.id).length,'ลงทะเบียน':lastRegs.filter(r=>r.subjectId===s.id).length,'ส่งข้อสอบ':subs.length,'คะแนนเฉลี่ย':scores.length?+(scores.reduce((a,b)=>a+b.score,0)/scores.length).toFixed(2):''}
  });
  saveWorkbook({'ภาพรวม':summary,'ผู้เข้าสอบ':userExportRows(),'ผลสอบ':resultExportRows()},`Nangrong-Exam-${new Date().toISOString().slice(0,10)}.xlsx`);
};

$('exportBtn').onclick=async()=>{
  const {questions,registrations,submissions}=await fetchAll();
  const keys=[...answerMap.entries()].map(([id,v])=>({id,...v}));
  const attemptRegs=(await getDocs(collection(db,'registrations'))).docs.map(d=>({id:d.id,...d.data()}));
  const data={exportedAt:new Date().toISOString(),subjects:SUBJECTS,questions,answerKeys:keys,studentCheckins:registrations,registrations:attemptRegs,submissions};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`nangrong-exam-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};

$('clearResults').onclick=async()=>{
  if(!confirm('ยืนยันลบผลสอบทั้งหมดทุกวิชา?'))return;
  const s=await getDocs(collection(db,'submissions'));await deleteDocs(s.docs);
};
$('clearRegs').onclick=async()=>{
  if(!confirm('ยืนยันลบรายชื่อผู้ลงทะเบียนทั้งหมด?'))return;
  const s=await getDocs(collection(db,'studentCheckins'));await deleteDocs(s.docs);
};
$('deleteAllQuestions').onclick=async()=>{
  const typed=prompt('คำสั่งนี้จะลบข้อสอบและเฉลยทั้งหมด กรุณาพิมพ์ DELETE 550 เพื่อยืนยัน');
  if(typed!=='DELETE 550'){alert('ยกเลิกการลบข้อสอบ');return}
  if(!confirm('ยืนยันครั้งสุดท้าย: ลบข้อสอบและเฉลยทั้งหมด?'))return;
  const [q,a]=await Promise.all([getDocs(collection(db,'questions')),getDocs(collection(db,'answerKeys'))]);
  await deleteDocs([...q.docs,...a.docs]);bankEnsured=false;await renderAll();
};

['resultSubjectFilter','resultClassFilter'].forEach(id=>$(id).onchange=renderResults);
$('resultSearch').oninput=renderResults;
['regSubjectFilter','regClassFilter','regStatusFilter'].forEach(id=>$(id).onchange=renderRegs);
$('regSearch').oninput=renderRegs;
$('questionSubjectFilter').onchange=renderQuestions;

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  ['dashboard','results','users','questions','backup'].forEach(t=>$(`tab-${t}`).classList.toggle('hidden',t!==b.dataset.tab));
});
