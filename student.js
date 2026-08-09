const STORAGE={questions:'nrtc_questions_v1',submissions:'nrtc_submissions_v1',registrations:'nrtc_registrations_v1',attempts:'nrtc_attempts_v1'};
const EXAM_COUNT=50, EXAM_SECONDS=75*60, MAX_VIOLATIONS=3;
let questions=[],answers=[],current=0,timeLeft=EXAM_SECONDS,timer=null,active=false,violations=0,student=null,startedAt=null;
const $=id=>document.getElementById(id);
const load=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
function ensureBank(){if(!localStorage.getItem(STORAGE.questions)) save(STORAGE.questions,window.DEFAULT_QUESTIONS);}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a}
function buildExam(){const bank=load(STORAGE.questions,window.DEFAULT_QUESTIONS); if(bank.length<EXAM_COUNT) throw new Error(`คลังข้อสอบมีเพียง ${bank.length} ข้อ ต้องมีอย่างน้อย ${EXAM_COUNT} ข้อ`);return shuffle(bank).slice(0,EXAM_COUNT).map((q,idx)=>{const opts=q.options.map((text,i)=>({text,original:i}));const mixed=shuffle(opts);return {id:q.id||`q-${idx}-${Date.now()}`,level:q.level||'general',q:q.q,options:mixed.map(x=>x.text),correct:mixed.findIndex(x=>x.original===Number(q.correct))};});}
function normalize(s){return String(s||'').trim()}
function showRegError(msg){$('registerMsg').textContent=msg;$('registerMsg').classList.remove('hidden')}
async function start(){
  $('registerMsg').classList.add('hidden');
  const name=normalize($('name').value),studentId=normalize($('studentId').value),className=normalize($('className').value),department=normalize($('department').value);
  if(!name||!studentId||!className||!department) return showRegError('กรุณากรอกชื่อ ชั้น/กลุ่มเรียน แผนกวิชา และเลขนักศึกษาให้ครบถ้วน');
  if(!$('accept').checked) return showRegError('กรุณายืนยันว่าได้อ่านคำชี้แจงก่อนเข้าสอบ');
  const attempts=load(STORAGE.attempts,{}); if(attempts[studentId]) return showRegError('เลขนักศึกษานี้มีประวัติเริ่มสอบแล้วในเบราว์เซอร์นี้ หากต้องการสอบใหม่ให้ผู้ดูแลระบบรีเซ็ตข้อมูล');
  try{questions=buildExam()}catch(e){return showRegError(e.message)}
  student={name,studentId,className,department}; startedAt=new Date().toISOString(); attempts[studentId]={startedAt,status:'started'};save(STORAGE.attempts,attempts);
  const regs=load(STORAGE.registrations,[]); regs.push({...student,registeredAt:startedAt});save(STORAGE.registrations,regs);
  answers=new Array(EXAM_COUNT).fill(-1); $('screen-register').classList.add('hidden');$('screen-exam').classList.remove('hidden'); buildNav();buildWatermark();active=true;
  try{await document.documentElement.requestFullscreen?.()}catch{}
  render(); startTimer();
}
function buildWatermark(){const w=$('watermark');w.innerHTML='';for(let i=0;i<30;i++){const s=document.createElement('span');s.textContent=`${student.name} · ${student.studentId}`;w.appendChild(s)}w.classList.remove('hidden')}
function buildNav(){const nav=$('nav');nav.innerHTML='';questions.forEach((_,i)=>{const b=document.createElement('button');b.textContent=i+1;b.onclick=()=>{current=i;render()};nav.appendChild(b)})}
function render(){const q=questions[current];$('qLabel').textContent=`ข้อที่ ${current+1} จาก ${EXAM_COUNT}`;$('qText').textContent=q.q;$('progress').style.width=`${(current+1)/EXAM_COUNT*100}%`;const wrap=$('options');wrap.innerHTML='';['ก','ข','ค','ง'].forEach((letter,i)=>{const lab=document.createElement('label');lab.className='option'+(answers[current]===i?' selected':'');lab.innerHTML=`<input type="radio" name="ans" ${answers[current]===i?'checked':''}><span class="letter">${letter}.</span><span>${escapeHtml(q.options[i])}</span>`;lab.onclick=()=>{answers[current]=i;render()};wrap.appendChild(lab)});requestAnimationFrame(()=>{const items=[...wrap.querySelectorAll('.option')];items.forEach(x=>x.style.minHeight='0px');const h=Math.max(...items.map(x=>x.scrollHeight));items.forEach(x=>x.style.minHeight=h+'px')});$('prevBtn').disabled=current===0;$('nextBtn').disabled=current===EXAM_COUNT-1;updateNav()}
function updateNav(){[...$('nav').children].forEach((b,i)=>{b.classList.toggle('answered',answers[i]!==-1);b.classList.toggle('current',i===current)});const n=answers.filter(x=>x!==-1).length;$('answered').textContent=`ตอบแล้ว ${n}/${EXAM_COUNT}`;$('submitBtn').disabled=n!==EXAM_COUNT}
function escapeHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function fmt(sec){const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':')}
function startTimer(){clearInterval(timer);$('timer').textContent=fmt(timeLeft);timer=setInterval(()=>{if(!active)return;timeLeft--; $('timer').textContent=fmt(Math.max(0,timeLeft));if(timeLeft<=300)$('timer').style.color='var(--danger)';if(timeLeft<=0){clearInterval(timer);finish('timeup')}},1000)}
function submissionPayload(status){return {id:`NRTC-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`,student,startedAt,submittedAt:new Date().toISOString(),status,violations,questionSnapshot:questions.map(q=>({q:q.q,options:q.options,correct:q.correct})),answers:[...answers]};}
function finish(status='submitted'){if(!active)return;active=false;clearInterval(timer);const payload=submissionPayload(status);const subs=load(STORAGE.submissions,[]);subs.push(payload);save(STORAGE.submissions,subs);const attempts=load(STORAGE.attempts,{});attempts[student.studentId]={startedAt,submittedAt:payload.submittedAt,status};save(STORAGE.attempts,attempts);$('watermark').classList.add('hidden');$('screen-exam').classList.add('hidden');$('screen-done').classList.remove('hidden');$('doneRef').textContent=`เลขอ้างอิงการส่ง: ${payload.id}`;try{document.exitFullscreen?.()}catch{}}
function violation(kind){if(!active)return;violations++;$('violations').textContent=violations;if(violations>MAX_VIOLATIONS){finish('terminated');$('screen-done').classList.add('hidden');$('lockOverlay').classList.remove('hidden')}}
$('startBtn').onclick=start;$('prevBtn').onclick=()=>{current=Math.max(0,current-1);render()};$('nextBtn').onclick=()=>{current=Math.min(EXAM_COUNT-1,current+1);render()};$('submitBtn').onclick=()=>{if(answers.some(x=>x===-1))return; if(confirm('ยืนยันส่งข้อสอบ? หลังส่งแล้วจะไม่สามารถแก้ไขคำตอบได้'))finish('submitted')};
document.addEventListener('visibilitychange',()=>{if(document.hidden)violation('tab')});document.addEventListener('fullscreenchange',()=>{if(active&&!document.fullscreenElement)violation('fullscreen')});['copy','cut','paste','contextmenu'].forEach(evt=>document.addEventListener(evt,e=>{if(active){e.preventDefault();violation(evt)}}));document.addEventListener('keydown',e=>{if(active&&((e.ctrlKey||e.metaKey)&&['c','v','x','p','u','s'].includes(e.key.toLowerCase()))){e.preventDefault();violation('shortcut')}});window.addEventListener('beforeunload',e=>{if(active){e.preventDefault();e.returnValue=''}});
ensureBank();
