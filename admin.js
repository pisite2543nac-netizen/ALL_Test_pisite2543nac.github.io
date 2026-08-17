import { auth, db, isFirebaseConfigured } from './firebase-service.js';
import { firebaseConfig, ADMIN_USERNAME, ADMIN_AUTH_EMAIL, ADMIN_UID } from './firebase-config.js';
import { SUBJECTS } from './subjects.js';
import { CLASS_LEVELS, CLASS_ROOMS, DEPARTMENTS, departmentById, majorById, normalizedStudentMeta } from './student-catalog.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import { collection, getDocs, doc, deleteDoc, writeBatch, serverTimestamp, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const $=id=>document.getElementById(id);
let questionRows=[],answerMap=new Map(),editId=null,lastRegs=[],lastSubs=[],lastStudentUsers=[],lastExamAttempts=[],lastExamRequests=[],liveUnsubs=[],bankEnsured=false;
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
  if(s==='forfeited')return 'สละสิทธิ์สอบ';
  return s||'-';
}
function statusClass(s){
  if(s==='completed')return 'ok';
  if(s==='exam_started')return 'warn';
  if(s==='terminated')return 'bad';
  return 'info';
}
function fillSimpleSelect(el, values, label){
  if(!el)return;
  const current=el.value;
  el.innerHTML=`<option value="">${label}</option>`;
  values.forEach(v=>{
    const o=document.createElement('option');
    o.value=v;
    o.textContent=v;
    el.appendChild(o);
  });
  if([...el.options].some(o=>o.value===current))el.value=current;
}
function fillDepartmentFilter(el,label='ทุกแผนก'){
  if(!el)return;
  const current=el.value;
  el.innerHTML=`<option value="">${label}</option>`;
  DEPARTMENTS.forEach(d=>{
    const o=document.createElement('option');
    o.value=d.name;
    o.textContent=d.name;
    el.appendChild(o);
  });
  if([...el.options].some(o=>o.value===current))el.value=current;
}
function allMajors(){
  return DEPARTMENTS.flatMap(d=>d.majors.map(m=>m.name));
}
function fillMajorFilter(el,label='ทุกสาขา'){
  fillSimpleSelect(el,allMajors(),label);
}
function fillAdminDepartmentSelect(){
  const el=$('newStudentDept');
  if(!el)return;
  el.innerHTML='<option value="">-- เลือกแผนก --</option>';
  DEPARTMENTS.forEach(d=>{
    const o=document.createElement('option');
    o.value=d.id;
    o.textContent=d.name;
    el.appendChild(o);
  });
}
function fillAdminMajorSelect(departmentId, selected=''){
  const el=$('newStudentMajor');
  if(!el)return;
  const d=departmentById(departmentId);
  el.innerHTML='<option value="">-- เลือกสาขาวิชา --</option>';
  if(!d){
    el.disabled=true;
    $('newStudentMajorCode').textContent='-';
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
  updateAdminMajorCode();
}
function updateAdminMajorCode(){
  const m=majorById($('newStudentDept')?.value,$('newStudentMajor')?.value);
  if($('newStudentMajorCode'))$('newStudentMajorCode').textContent=m?.code||'-';
}
function userMeta(x={}){
  return normalizedStudentMeta(x.student||x);
}
function matchesSearch(parts,term){
  if(!term)return true;
  const t=term.toLowerCase();
  return parts.some(v=>String(v||'').toLowerCase().includes(t));
}

[$('resultSubjectFilter'),$('regSubjectFilter'),$('questionSubjectFilter')].forEach(x=>fillSubjectSelect(x,true));
fillSubjectSelect($('qSubject'));
fillSubjectSelect($('newStudentSubject'),true,'ยังไม่กำหนดวิชา');
fillSimpleSelect($('resultLevelFilter'),CLASS_LEVELS,'ทุกระดับชั้น');
fillSimpleSelect($('resultRoomFilter'),CLASS_ROOMS,'ทุกห้อง');
fillDepartmentFilter($('resultDeptFilter'));
fillMajorFilter($('resultMajorFilter'));
fillSimpleSelect($('regLevelFilter'),CLASS_LEVELS,'ทุกระดับชั้น');
fillSimpleSelect($('regRoomFilter'),CLASS_ROOMS,'ทุกห้อง');
fillDepartmentFilter($('regDeptFilter'));
fillMajorFilter($('regMajorFilter'));
fillAdminDepartmentSelect();
fillAdminMajorSelect('');


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
  liveUnsubs.push(onSnapshot(collection(db,'examAttempts'),snap=>{
    lastExamAttempts=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderRealtimeAreas();
  },e=>console.warn('examAttempts live error',e)));
  liveUnsubs.push(onSnapshot(collection(db,'examRequests'),snap=>{
    lastExamRequests=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderRequests();
    updateRequestBadge();
  },e=>console.warn('examRequests live error',e)));
  liveUnsubs.push(onSnapshot(collection(db,'submissions'),snap=>{
    lastSubs=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderRealtimeAreas();
  },e=>console.warn('submissions live error',e)));
}
function renderRealtimeAreas(){
  updateMetrics();
  renderDashboard();
  renderRegs();
  renderResults();
  renderRequests();
  updateRequestBadge();
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
  const [q,a,r,s,u,ea,er]=await Promise.all([
    getDocs(collection(db,'questions')),getDocs(collection(db,'answerKeys')),
    getDocs(collection(db,'studentCheckins')),getDocs(collection(db,'submissions')),
    getDocs(collection(db,'studentUsers')),getDocs(collection(db,'examAttempts')),
    getDocs(collection(db,'examRequests'))
  ]);
  questionRows=q.docs.map(d=>({id:d.id,...d.data()}));
  answerMap=new Map(a.docs.map(d=>[d.id,d.data()]));
  lastRegs=r.docs.map(d=>({id:d.id,...d.data()}));
  lastSubs=s.docs.map(d=>({id:d.id,...d.data()}));
  lastStudentUsers=u.docs.map(d=>({uid:d.id,...d.data()}));
  lastExamAttempts=ea.docs.map(d=>({id:d.id,...d.data()}));
  lastExamRequests=er.docs.map(d=>({id:d.id,...d.data()}));
  return {questions:questionRows,registrations:lastRegs,submissions:lastSubs,studentUsers:lastStudentUsers,examAttempts:lastExamAttempts,examRequests:lastExamRequests};
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
    updateMetrics();renderDashboard();renderResults();renderRegs();renderRequests();updateRequestBadge();renderQuestionSubjectManager();renderQuestions();
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
  const level=$('resultLevelFilter').value;
  const room=$('resultRoomFilter').value;
  const dept=$('resultDeptFilter').value;
  const major=$('resultMajorFilter').value;
  const term=norm($('resultSearch').value);

  return lastSubs.filter(s=>{
    const meta=userMeta(s);
    return (!subject||s.subjectId===subject)
      && (!level||meta.classLevel===level)
      && (!room||meta.classRoom===room)
      && (!dept||meta.department===dept)
      && (!major||meta.major===major)
      && matchesSearch([
        s.student?.studentId,s.student?.name,
        meta.classLevel,meta.classRoom,meta.className,
        meta.department,meta.major,meta.majorCode,
        s.subjectCode,s.subjectName
      ],term);
  }).sort((a,b)=>(b.submittedAt?.seconds||0)-(a.submittedAt?.seconds||0));
}
function renderResults(){
  const tb=$('resultRows');tb.innerHTML='';
  filteredResults().forEach(s=>{
    const sc=scoreOf(s),tr=document.createElement('tr'),meta=userMeta(s);
    tr.innerHTML=`
      <td>${fmtDate(s.submittedAt||s.submittedAtClient)}</td>
      <td>${esc(subjectLabel(s.subjectId,s.subjectCode,s.subjectName))}</td>
      <td>${esc(s.student?.studentId)}</td>
      <td>${esc(s.student?.name)}</td>
      <td>${esc(meta.classLevel||'-')}</td>
      <td>${esc(meta.classRoom||'-')}</td>
      <td>${esc(meta.department||'-')}</td>
      <td>${esc(meta.major||'-')}</td>
      <td><span class="status-chip ${statusClass(s.status)}">${esc(s.status||'submitted')}</span></td>
      <td>${sc.correct}/50</td>
      <td><b>${sc.score.toFixed(2)}</b></td>
      <td><button class="btn danger small">ลบ</button></td>`;
    tr.querySelector('button').onclick=async()=>{
      if(confirm('ลบผลสอบรายการนี้?'))await deleteDoc(doc(db,'submissions',s.id))
    };
    tb.appendChild(tr);
  });
}


function requestTypeLabel(t){
  return t==='score_view'?'ขอดูคะแนน':t==='retake'?'ขอสอบแก้':t||'-';
}
function requestStatusLabel(s){
  return s==='pending'?'รออนุมัติ':s==='approved'?'อนุมัติแล้ว':s==='rejected'?'ไม่อนุมัติ':s||'-';
}
function updateRequestBadge(){
  const n=lastExamRequests.filter(r=>r.status==='pending').length;
  if($('requestBadge'))$('requestBadge').textContent=n;
}
function submissionForRequest(r){
  return lastSubs.find(s=>s.id===r.submissionId)||null;
}
function filteredRequests(){
  const term=norm($('requestSearch')?.value);
  const type=$('requestTypeFilter')?.value||'';
  const status=$('requestStatusFilter')?.value||'';
  return lastExamRequests.filter(r=>
    (!type||r.requestType===type) &&
    (!status||r.status===status) &&
    matchesSearch([r.studentId,r.studentName,r.classLevel,r.classRoom,r.className,r.department,r.major,r.majorCode,r.subjectCode,r.subjectName],term)
  ).sort((a,b)=>{
    if(a.status==='pending'&&b.status!=='pending')return -1;
    if(b.status==='pending'&&a.status!=='pending')return 1;
    return (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0);
  });
}
function renderRequests(){
  const tb=$('requestRows');
  if(!tb)return;
  tb.innerHTML='';
  filteredRequests().forEach(r=>{
    const sub=submissionForRequest(r);
    const sc=sub?scoreOf(sub):null;
    const validScore=sub && sub.status==='submitted';
    const pass=validScore && sc.score>=10;
    const scoreText=validScore
      ? `${sc.score.toFixed(2)}/20 · ${sc.correct}/50 · ${pass?'ผ่าน':'ไม่ผ่าน'}`
      : (sub?`สถานะ ${sub.status}`:'ไม่พบ Submission');
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${fmtDate(r.createdAt||r.createdAtClient)}</td>
      <td><b>${esc(requestTypeLabel(r.requestType))}</b></td>
      <td>${esc(r.studentId)}</td>
      <td>${esc(r.studentName)}</td>
      <td>${esc(subjectLabel(r.subjectId,r.subjectCode,r.subjectName))}</td>
      <td><span class="${validScore?(pass?'score-pass':'score-fail'):'muted'}">${esc(scoreText)}</span></td>
      <td><span class="request-admin-status status-${esc(r.status||'pending')}">${esc(requestStatusLabel(r.status))}</span></td>
      <td><div class="row request-admin-actions"></div></td>`;
    const actions=tr.querySelector('.request-admin-actions');

    if(r.status==='pending'){
      const approve=document.createElement('button');
      approve.className='btn ok small';
      approve.textContent='อนุมัติ';
      approve.onclick=()=>approveExamRequest(r,sub,sc);
      actions.appendChild(approve);

      const reject=document.createElement('button');
      reject.className='btn danger small';
      reject.textContent='ไม่อนุมัติ';
      reject.onclick=()=>rejectExamRequest(r);
      actions.appendChild(reject);
    }else{
      const reopen=document.createElement('button');
      reopen.className='btn secondary small';
      reopen.textContent='คืนเป็นรออนุมัติ';
      reopen.onclick=async()=>{
        await setDoc(doc(db,'examRequests',r.id),{
          status:'pending',
          adminMessage:'',
          reviewedAt:serverTimestamp()
        },{merge:true});
      };
      actions.appendChild(reopen);
    }
    tb.appendChild(tr);
  });
}
async function approveExamRequest(r,sub,sc){
  if(!sub||!sc){
    alert('ไม่พบผลสอบที่เชื่อมกับคำร้องนี้');
    return;
  }
  if(sub.status!=='submitted'){
    alert('คำร้องนี้ไม่ได้มาจากการส่งข้อสอบปกติ จึงไม่สามารถอนุมัติได้');
    return;
  }

  if(r.requestType==='score_view'){
    if(!confirm(`อนุมัติให้ ${r.studentName||r.studentId} ดูคะแนนรายบุคคล ${sc.score.toFixed(2)}/20 ?`))return;
    await setDoc(doc(db,'examRequests',r.id),{
      status:'approved',
      approvedScore:sc.score,
      correctCount:sc.correct,
      pass:sc.score>=10,
      adminMessage:'Admin อนุมัติให้ดูคะแนนผลสอบรายบุคคลแล้ว',
      reviewedAt:serverTimestamp()
    },{merge:true});
    return;
  }

  if(r.requestType==='retake'){
    if(sc.score>=10){
      alert(`ไม่สามารถอนุมัติคำร้องสอบแก้ได้ เพราะผลสอบ ${sc.score.toFixed(2)}/20 ผ่านเกณฑ์ 10/20 แล้ว`);
      return;
    }
    if(!confirm(
      `อนุมัติสอบแก้ให้ ${r.studentName||r.studentId}?\\n\\n`+
      `คะแนนเดิม: ${sc.score.toFixed(2)}/20 (ไม่ผ่าน)\\n`+
      `ระบบจะให้สิทธิ์สอบเพิ่ม 1 ครั้งสำหรับวิชา ${r.subjectCode}`
    ))return;

    // Stable Core: ไม่ใช้ examAttempts เป็นเงื่อนไขเข้าสอบ
    // Admin อนุมัติคำร้องสอบแก้โดยบันทึกสถานะคำร้องเท่านั้น
    await setDoc(doc(db,'examRequests',r.id),{
      status:'approved',
      approvedScore:sc.score,
      correctCount:sc.correct,
      pass:false,
      adminMessage:'Admin อนุมัติสอบแก้แล้ว สามารถเข้าสอบรายวิชานี้ใหม่ได้',
      reviewedAt:serverTimestamp()
    },{merge:true});
  }
}
async function rejectExamRequest(r){
  const reason=prompt('ระบุเหตุผลที่ไม่อนุมัติ (เว้นว่างได้):','');
  if(reason===null)return;
  await setDoc(doc(db,'examRequests',r.id),{
    status:'rejected',
    adminMessage:reason||'Admin ไม่อนุมัติคำร้องนี้',
    reviewedAt:serverTimestamp()
  },{merge:true});
}

function latestCheckinForUser(u){
  const rows=lastRegs.filter(r=>
    (u.uid && r.ownerUid===u.uid) ||
    (!r.ownerUid && r.studentId===u.studentId)
  );
  return rows.sort((a,b)=>{
    const aa=a.examStartedAt?.seconds||a.registeredAt?.seconds||Date.parse(a.examStartedAtClient||a.registeredAtClient||0)/1000||0;
    const bb=b.examStartedAt?.seconds||b.registeredAt?.seconds||Date.parse(b.examStartedAtClient||b.registeredAtClient||0)/1000||0;
    return bb-aa;
  })[0]||{};
}
function uniqueUserRows(){
  return lastStudentUsers.map(u=>{
    const latest=latestCheckinForUser(u);
    const meta=normalizedStudentMeta(u);
    return {
      ...latest,
      ...u,
      uid:u.uid,
      ownerUid:u.uid,
      studentId:u.studentId||latest.studentId||'',
      name:u.name||latest.name||'',
      ...meta,
      status:latest.status||'registered',
      subjectId:latest.subjectId||'',
      subjectCode:latest.subjectCode||'',
      subjectName:latest.subjectName||'',
      latestAt:latest.examStartedAt||latest.registeredAt||latest.examStartedAtClient||latest.registeredAtClient||u.createdAt||u.createdAtClient
    };
  });
}
function filteredRegs(){
  const subject=$('regSubjectFilter').value;
  const level=$('regLevelFilter').value;
  const room=$('regRoomFilter').value;
  const dept=$('regDeptFilter').value;
  const major=$('regMajorFilter').value;
  const status=$('regStatusFilter').value;
  const term=norm($('regSearch').value);

  return uniqueUserRows().filter(r=>
    (!subject||r.subjectId===subject) &&
    (!level||r.classLevel===level) &&
    (!room||r.classRoom===room) &&
    (!dept||r.department===dept) &&
    (!major||r.major===major) &&
    (!status||r.status===status) &&
    matchesSearch([
      r.studentId,r.name,r.classLevel,r.classRoom,r.className,
      r.department,r.major,r.majorCode,r.subjectCode,r.subjectName
    ],term)
  ).sort((a,b)=>{
    const aa=a.latestAt?.seconds||Date.parse(a.latestAt||0)/1000||0;
    const bb=b.latestAt?.seconds||Date.parse(b.latestAt||0)/1000||0;
    return bb-aa;
  });
}
function renderRegs(){
  const rows=filteredRegs(),tb=$('regRows');tb.innerHTML='';
  $('visibleUserCount').textContent=rows.length;

  rows.forEach(r=>{
    const subject=r.subjectId?subjectLabel(r.subjectId,r.subjectCode,r.subjectName):'ยังไม่เลือกวิชา';
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${fmtDate(r.latestAt)}</td>
      <td>${esc(subject)}</td>
      <td><b>${esc(r.studentId)}</b></td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.classLevel||'-')}</td>
      <td>${esc(r.classRoom||'-')}</td>
      <td>${esc(r.department||'-')}</td>
      <td>${esc(r.major||'-')}</td>
      <td>${esc(r.majorCode||'-')}</td>
      <td><span class="status-chip ${statusClass(r.status)}">${esc(statusLabel(r.status))}</span></td>
      <td>
        <div class="row user-manage-actions">
          <button class="btn danger small delete-user">ลบ User</button>
        </div>
      </td>`;
    tr.querySelector('.delete-user').onclick=()=>deleteUserFromSystem(r);
    tb.appendChild(tr);
  });
}

async function unlockExamAttemptsForUser(r,ownerUid){
  if(!ownerUid||!r.subjectId){
    alert('ไม่พบ UID หรือรายวิชาของ User นี้');
    return;
  }

  const s=subjectById(r.subjectId);
  const subjectName=s?`${s.code} ${s.name}`:(r.subjectCode||r.subjectName||r.subjectId);

  if(!confirm(
    `ปลดล็อกสิทธิ์สอบใหม่ให้ ${r.name||r.studentId}?\\n\\n`+
    `รายวิชา: ${subjectName}\\n`+
    `สิทธิ์จะถูกรีเซ็ตกลับเป็น 0/2 ครั้ง\\n`+
    `คะแนนและประวัติสอบเดิมจะไม่ถูกลบ`
  ))return;

  try{
    const ref=doc(db,'examAttempts',`${ownerUid}__${r.subjectId}`);
    await setDoc(ref,{
      ownerUid,
      studentId:r.studentId,
      subjectId:r.subjectId,
      subjectCode:s?.code||r.subjectCode||'',
      subjectName:s?.name||r.subjectName||'',
      attemptsUsed:0,
      terminatedCount:0,
      maxAttempts:2,
      unlockedByAdmin:true,
      unlockedAt:serverTimestamp(),
      unlockedAtClient:new Date().toISOString(),
      updatedAt:serverTimestamp(),
      updatedAtClient:new Date().toISOString()
    },{merge:true});

    alert(
      `ปลดล็อกสำเร็จ\\n\\n${r.name||r.studentId}\\n${subjectName}\\n`+
      `สิทธิ์ใหม่: 0/2 ครั้ง`
    );
    await renderAll();
  }catch(e){
    console.error(e);
    alert('ปลดล็อกสิทธิ์ไม่สำเร็จ: '+(e.message||e));
  }
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

$('newStudentDept').addEventListener('change',()=>{
  fillAdminMajorSelect($('newStudentDept').value);
});
$('newStudentMajor').addEventListener('change',updateAdminMajorCode);
$('toggleAddUser').onclick=()=>$('addUserPanel').classList.toggle('hidden');
$('cancelAddUser').onclick=()=>$('addUserPanel').classList.add('hidden');
$('saveNewUser').onclick=async()=>{
  $('addUserMsg').classList.add('hidden');
  const studentId=norm($('newStudentId').value),name=norm($('newStudentName').value);
  const classLevel=norm($('newStudentClassLevel').value),classRoom=norm($('newStudentClassRoom').value);
  const className=classLevel && classRoom ? `${classLevel}${classRoom}` : '';
  const departmentId=norm($('newStudentDept').value);
  const departmentObj=departmentById(departmentId);
  const majorId=norm($('newStudentMajor').value);
  const majorObj=majorById(departmentId,majorId);
  const department=departmentObj?.name||'';
  const major=majorObj?.name||'';
  const majorCode=majorObj?.code||'';
  const password=$('newStudentPassword').value;
  const subjectId=$('newStudentSubject').value,status=$('newStudentStatus').value;
  if(!studentId||!name||!classLevel||!classRoom||!departmentId||!majorId||!department||!major){
    $('addUserMsg').textContent='กรุณากรอกเลขนักศึกษา ชื่อ และเลือกระดับชั้น ห้อง แผนก และสาขาให้ครบ';$('addUserMsg').classList.remove('hidden');return;
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
      studentId,name,classLevel,classRoom,className,
      departmentId,department,majorId,major,majorCode,
      wantsKey:true,email:studentEmail(studentId),
      active:true,createdByAdmin:true,createdAt:serverTimestamp(),createdAtClient:new Date().toISOString()
    });
    await setDoc(doc(db,'studentCheckins',`admin-${Date.now()}-${crypto.randomUUID()}`),{
      ownerUid:cred.user.uid,studentId,name,classLevel,classRoom,className,
      departmentId,department,majorId,major,majorCode,status,
      subjectId:s?.id||'',subjectCode:s?.code||'',subjectName:s?.name||'',
      wantsKey:true,createdByAdmin:true,registeredAt:serverTimestamp(),registeredAtClient:new Date().toISOString()
    });
    await signOut(provisionAuth);
    ['newStudentId','newStudentName','newStudentClassLevel','newStudentClassRoom','newStudentDept','newStudentMajor','newStudentPassword'].forEach(id=>$(id).value='');
    fillAdminMajorSelect('');
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
    'เลขนักศึกษา':s.student?.studentId||'','ชื่อ-นามสกุล':s.student?.name||'','ระดับชั้น':userMeta(s).classLevel||'','ห้อง':userMeta(s).classRoom||'','แผนก':userMeta(s).department||'','สาขา':userMeta(s).major||'','รหัสสาขา':userMeta(s).majorCode||'',
    'สถานะ':s.status||'submitted','ถูก/50':sc.correct,'คะแนน/20':sc.score
  }});
}
function userExportRows(){
  return filteredRegs().map(r=>({
    'วันเวลา':fmtDate(r.registeredAt||r.registeredAtClient),'รหัสวิชา':r.subjectCode||'','รายวิชา':r.subjectName||'',
    'เลขนักศึกษา':r.studentId||'','ชื่อ-นามสกุล':r.name||'','ระดับชั้น':r.classLevel||'','ห้อง':r.classRoom||'','แผนก':r.department||'','สาขา':r.major||'','รหัสสาขา':r.majorCode||'','สถานะ':statusLabel(r.status)
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

['resultSubjectFilter','resultLevelFilter','resultRoomFilter','resultDeptFilter','resultMajorFilter'].forEach(id=>$(id).onchange=renderResults);
$('resultSearch').oninput=renderResults;
$('requestSearch').oninput=renderRequests;
['requestTypeFilter','requestStatusFilter'].forEach(id=>$(id).onchange=renderRequests);
$('refreshRequestsAdmin').onclick=renderAll;
['regSubjectFilter','regLevelFilter','regRoomFilter','regDeptFilter','regMajorFilter','regStatusFilter'].forEach(id=>$(id).onchange=renderRegs);
$('regSearch').oninput=renderRegs;
$('questionSubjectFilter').onchange=renderQuestions;

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  ['dashboard','results','requests','users','questions','backup'].forEach(t=>$(`tab-${t}`).classList.toggle('hidden',t!==b.dataset.tab));
});
