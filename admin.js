import { auth, db, isFirebaseConfigured } from './firebase-service.js';
import { ADMIN_USERNAME, ADMIN_AUTH_EMAIL, ADMIN_UID } from './firebase-config.js';
import { SUBJECTS } from './subjects.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import { collection, getDocs, doc, deleteDoc, writeBatch, serverTimestamp, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const $=id=>document.getElementById(id);
let questionRows=[],answerMap=new Map(),editId=null,lastRegs=[],lastSubs=[],liveUnsubs=[],bankEnsured=false;

function esc(s){const d=document.createElement('div');d.textContent=s??'';return d.innerHTML}
function fmtDate(x){if(!x)return '-';try{const d=x.toDate?x.toDate():new Date(x);return d.toLocaleString('th-TH')}catch{return '-'}}
function subjectById(id){return SUBJECTS.find(s=>s.id===id)}
function subjectLabel(id,code,name){const s=subjectById(id);return s?`${s.code} ${s.name}`:`${code||''} ${name||''}`.trim()}
function fillSubjectSelect(el,all=false){el.innerHTML=all?'<option value="">ทุกวิชา</option>':'';SUBJECTS.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=`${s.code} · ${s.name}`;el.appendChild(o)})}

[$('resultSubjectFilter'),$('regSubjectFilter'),$('questionSubjectFilter')].forEach(x=>fillSubjectSelect(x,true));
fillSubjectSelect($('qSubject'));

async function loadBuiltInBank(){
  const res=await fetch('./initial-question-bank-all-subjects.json',{cache:'no-store'});
  if(!res.ok)throw new Error('โหลดคลังข้อสอบสำเร็จรูปไม่สำเร็จ');
  const arr=await res.json();
  if(!Array.isArray(arr)||arr.length!==550)throw new Error('คลังข้อสอบสำเร็จรูปต้องมี 550 ข้อ');
  return arr;
}
async function writeBuiltInBank(arr,{replace=false}={}){
  if(replace){
    const [oldQ,oldA]=await Promise.all([getDocs(collection(db,'questions')),getDocs(collection(db,'answerKeys'))]);
    const all=[...oldQ.docs,...oldA.docs];
    for(let i=0;i<all.length;i+=350){
      const b=writeBatch(db);
      all.slice(i,i+350).forEach(d=>b.delete(d.ref));
      await b.commit();
    }
  }

  // เติมเฉพาะข้อที่ขาด เพื่อไม่ทับข้อที่ Admin แก้เอง
  const existing=replace?new Set() : new Set((await getDocs(collection(db,'questions'))).docs.map(d=>d.id));
  let b=writeBatch(db),ops=0;
  for(let i=0;i<arr.length;i++){
    const x=arr[i],id=x.id||`${x.subjectCode}-q-${i+1}`;
    if(existing.has(id))continue;
    b.set(doc(db,'questions',id),{
      subjectId:x.subjectId,subjectCode:x.subjectCode,subjectName:x.subjectName,
      theme:x.theme||'',q:x.q,options:x.options,active:true,order:(i%50)+1,
      level:x.level||'',builtIn:true
    });
    b.set(doc(db,'answerKeys',id),{
      correct:Number(x.correct),explain:x.explain||'',builtIn:true
    });
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
    const arr=await loadBuiltInBank();
    await writeBuiltInBank(arr,{replace:false});
  }catch(e){
    bankEnsured=false;
    console.error('Auto seed built-in bank failed',e);
    alert('ระบบข้อสอบสำเร็จรูปยังเติมลง Firebase ไม่ครบ: '+(e.message||e));
  }
}
function statusLabel(s){
  if(s==='registered')return 'ลงทะเบียนแล้ว';
  if(s==='exam_started')return 'กำลังสอบ';
  if(s==='completed')return 'ส่งข้อสอบแล้ว';
  if(s==='terminated')return 'ยุติการสอบ';
  return s||'-';
}
function stopLive(){
  liveUnsubs.forEach(fn=>{try{fn()}catch{}});
  liveUnsubs=[];
}
function startLive(){
  stopLive();
  liveUnsubs.push(onSnapshot(collection(db,'studentCheckins'),snap=>{
    lastRegs=snap.docs.map(d=>({id:d.id,...d.data()}));
    $('mRegs').textContent=lastRegs.length;
    renderRegs();
  },e=>console.warn('studentCheckins live error',e)));

  liveUnsubs.push(onSnapshot(collection(db,'submissions'),snap=>{
    lastSubs=snap.docs.map(d=>({id:d.id,...d.data()}));
    $('mSubs').textContent=lastSubs.length;
    const vals=lastSubs.map(scoreOf);
    $('mAvg').textContent=vals.length?(vals.reduce((x,y)=>x+y.score,0)/vals.length).toFixed(2):'0.00';
    renderResults();
  },e=>console.warn('submissions live error',e)));
}


$('loginBtn').onclick=async()=>{
  $('loginMsg').classList.add('hidden');
  if(!isFirebaseConfigured()){ $('loginMsg').textContent='ยังไม่ได้ตั้งค่า Firebase ใน firebase-config.js';$('loginMsg').classList.remove('hidden');return; }
  if($('adminUser').value.trim()!==ADMIN_USERNAME){$('loginMsg').textContent='ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';$('loginMsg').classList.remove('hidden');return}
  $('loginBtn').disabled=true;
  try{await setPersistence(auth,browserSessionPersistence);await signInWithEmailAndPassword(auth,ADMIN_AUTH_EMAIL,$('adminPass').value)}
  catch(e){console.error(e);$('loginMsg').textContent=`Firebase Error: ${e.code||'unknown'} | ${e.message||''}`;$('loginMsg').classList.remove('hidden')}
  finally{$('loginBtn').disabled=false}
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
    if(user)await signOut(auth);$('loginCard').classList.remove('hidden');$('adminApp').classList.add('hidden');
  }
});

async function fetchAll(){
  const [q,a,r,s]=await Promise.all([
    getDocs(collection(db,'questions')),getDocs(collection(db,'answerKeys')),
    getDocs(collection(db,'studentCheckins')),getDocs(collection(db,'submissions'))
  ]);
  questionRows=q.docs.map(d=>({id:d.id,...d.data()}));
  answerMap=new Map(a.docs.map(d=>[d.id,d.data()]));
  lastRegs=r.docs.map(d=>({id:d.id,...d.data()}));lastSubs=s.docs.map(d=>({id:d.id,...d.data()}));
  return {questions:questionRows,registrations:lastRegs,submissions:lastSubs};
}
function scoreOf(s){
  let correct=0;(s.questionIds||[]).forEach((qid,i)=>{const key=answerMap.get(qid);if(key&&Number(s.selectedOriginal?.[i])===Number(key.correct))correct++});
  return {correct,score:+(correct*20/50).toFixed(2)};
}
async function renderAll(){
  try{
    const {questions,registrations,submissions}=await fetchAll();
    $('mQuestions').textContent=questions.length;
    $('mSubjects').textContent=SUBJECTS.filter(s=>questions.filter(q=>q.subjectId===s.id&&q.active!==false).length>=50).length;
    $('mRegs').textContent=registrations.length;
    $('mSubs').textContent=submissions.length;
    const vals=submissions.map(scoreOf);$('mAvg').textContent=vals.length?(vals.reduce((x,y)=>x+y.score,0)/vals.length).toFixed(2):'0.00';
    renderResults();renderRegs();renderQuestions();
  }catch(e){console.error(e);alert('อ่านข้อมูลจาก Firebase ไม่สำเร็จ กรุณาตรวจสอบ Firestore Rules')}
}
function renderResults(){
  const f=$('resultSubjectFilter').value,tb=$('resultRows');tb.innerHTML='';
  lastSubs.filter(s=>!f||s.subjectId===f).sort((a,b)=>(b.submittedAt?.seconds||0)-(a.submittedAt?.seconds||0)).forEach(s=>{
    const sc=scoreOf(s),tr=document.createElement('tr');
    tr.innerHTML=`<td>${fmtDate(s.submittedAt||s.submittedAtClient)}</td><td>${esc(subjectLabel(s.subjectId,s.subjectCode,s.subjectName))}</td><td>${esc(s.student?.studentId)}</td><td>${esc(s.student?.name)}</td><td>${esc(s.student?.className)}</td><td>${esc(s.student?.department)}</td><td>${esc(s.status)}</td><td>${sc.correct}/50</td><td><b>${sc.score.toFixed(2)}</b></td><td><button class="btn danger small">ลบ</button></td>`;
    tr.querySelector('button').onclick=async()=>{if(confirm('ลบผลสอบรายการนี้?')){await deleteDoc(doc(db,'submissions',s.id));await renderAll()}};
    tb.appendChild(tr);
  });
}
function renderRegs(){
  const f=$('regSubjectFilter').value,tb=$('regRows');tb.innerHTML='';
  lastRegs
    .filter(r=>!f||r.subjectId===f)
    .sort((a,b)=>(b.registeredAt?.seconds||0)-(a.registeredAt?.seconds||0))
    .forEach(r=>{
      const tr=document.createElement('tr');
      const subject=r.subjectId?subjectLabel(r.subjectId,r.subjectCode,r.subjectName):'ยังไม่เลือกวิชา';
      tr.innerHTML=`<td>${fmtDate(r.registeredAt||r.registeredAtClient)}</td><td>${esc(subject)}</td><td>${esc(r.studentId)}</td><td>${esc(r.name)}</td><td>${esc(r.className)}</td><td>${esc(r.department)}</td><td>${esc(statusLabel(r.status))}</td><td><button class="btn danger small">ลบ</button></td>`;
      tr.querySelector('button').onclick=async()=>{
        if(confirm('ลบรายชื่อลงทะเบียนรายการนี้?')){
          await deleteDoc(doc(db,'studentCheckins',r.id));
        }
      };
      tb.appendChild(tr);
    });
}
function renderQuestions(){
  const f=$('questionSubjectFilter').value,list=$('questionList');list.innerHTML='';
  questionRows.filter(q=>!f||q.subjectId===f).sort((a,b)=>(a.subjectCode||'').localeCompare(b.subjectCode||'')||(a.order||0)-(b.order||0)).forEach(q=>{
    const d=document.createElement('div');d.className='admin-question';
    d.innerHTML=`<div class="qtitle"><span class="pill">${esc(q.subjectCode||'')}</span> ${esc(q.q)}</div><ol type="A">${(q.options||[]).map(o=>`<li>${esc(o)}</li>`).join('')}</ol><div class="row"><button class="btn secondary small edit">แก้ไข</button><button class="btn danger small del">ลบ</button></div>`;
    d.querySelector('.edit').onclick=()=>editQ(q.id);
    d.querySelector('.del').onclick=async()=>{if(confirm('ลบข้อสอบข้อนี้?')){const b=writeBatch(db);b.delete(doc(db,'questions',q.id));b.delete(doc(db,'answerKeys',q.id));await b.commit();await renderAll()}};
    list.appendChild(d);
  });
}
function editQ(id){
  const q=questionRows.find(x=>x.id===id),key=answerMap.get(id)||{};editId=id;
  $('qSubject').value=q.subjectId;$('qText').value=q.q;$('qCorrect').value=String(key.correct??0);
  (q.options||[]).forEach((o,j)=>$(`o${j}`).value=o);$('qExplain').value=key.explain||'';
  $('saveQuestion').textContent='บันทึกการแก้ไข';$('cancelEdit').classList.remove('hidden');scrollTo({top:$('tab-questions').offsetTop-20,behavior:'smooth'});
}
function clearQForm(){
  editId=null;['qText','o0','o1','o2','o3','qExplain'].forEach(id=>$(id).value='');
  $('qCorrect').value='0';$('saveQuestion').textContent='เพิ่มข้อสอบ';$('cancelEdit').classList.add('hidden');$('qMsg').classList.add('hidden');
}
$('saveQuestion').onclick=async()=>{
  const subj=subjectById($('qSubject').value);
  const q={subjectId:subj.id,subjectCode:subj.code,subjectName:subj.name,theme:subj.theme,q:$('qText').value.trim(),options:[0,1,2,3].map(i=>$(`o${i}`).value.trim()),active:true,updatedAt:serverTimestamp()};
  const key={correct:Number($('qCorrect').value),explain:$('qExplain').value.trim(),updatedAt:serverTimestamp()};
  if(!q.q||q.options.some(x=>!x)){$('qMsg').textContent='กรุณากรอกคำถามและตัวเลือกทั้ง 4 ข้อให้ครบ';$('qMsg').classList.remove('hidden');return}
  const id=editId||`${subj.code}-${crypto.randomUUID()}`;const b=writeBatch(db);b.set(doc(db,'questions',id),q,{merge:true});b.set(doc(db,'answerKeys',id),key,{merge:true});
  await b.commit();clearQForm();await renderAll();
};
$('cancelEdit').onclick=clearQForm;

$('resetQuestions').onclick=async()=>{
  if(!confirm('คืนค่าคลังข้อสอบสำเร็จรูป 550 ข้อทั้งหมด? การทำรายการนี้จะแทนที่ข้อสอบและเฉลยปัจจุบันทั้งหมด'))return;
  $('resetQuestions').disabled=true;
  $('resetQuestions').textContent='กำลังคืนค่า...';
  try{
    const arr=await loadBuiltInBank();
    await writeBuiltInBank(arr,{replace:true});
    alert('คืนค่าข้อสอบสำเร็จรูป 550 ข้อ / 11 วิชาสำเร็จ');
    await renderAll();
  }catch(e){
    console.error(e);
    alert('คืนค่าไม่สำเร็จ: '+(e.message||e));
  }finally{
    $('resetQuestions').disabled=false;
    $('resetQuestions').textContent='คืนค่าข้อสอบสำเร็จรูป 550 ข้อ';
  }
};

async function deleteDocs(docs){for(let i=0;i<docs.length;i+=400){const b=writeBatch(db);docs.slice(i,i+400).forEach(d=>b.delete(d.ref));await b.commit()}}
$('clearResults').onclick=async()=>{if(!confirm('ลบผลสอบทั้งหมดทุกวิชา?'))return;const s=await getDocs(collection(db,'submissions'));await deleteDocs(s.docs);await renderAll()};
$('clearRegs').onclick=async()=>{if(!confirm('ลบข้อมูลลงทะเบียนทั้งหมดทุกวิชา?'))return;const s=await getDocs(collection(db,'studentCheckins'));await deleteDocs(s.docs);await renderAll()};
$('resultSubjectFilter').onchange=renderResults;$('regSubjectFilter').onchange=renderRegs;$('questionSubjectFilter').onchange=renderQuestions;

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  ['results','registrations','questions','backup'].forEach(t=>$(`tab-${t}`).classList.toggle('hidden',t!==b.dataset.tab));
});
$('exportBtn').onclick=async()=>{
  const {questions,registrations,submissions}=await fetchAll();const keys=[...answerMap.entries()].map(([id,v])=>({id,...v}));
  const attemptRegs=(await getDocs(collection(db,'registrations'))).docs.map(d=>({id:d.id,...d.data()}));
  const data={exportedAt:new Date().toISOString(),subjects:SUBJECTS,questions,answerKeys:keys,studentCheckins:registrations,registrations:attemptRegs,submissions};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`nangrong-exam-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
$('importFile').onchange=async()=>alert('ข้อสอบมาตรฐานฝังมากับเว็บแล้ว ใช้ปุ่ม “คืนค่าข้อสอบสำเร็จรูป 550 ข้อ” หากต้องการรีเซ็ตคลังข้อสอบ');
