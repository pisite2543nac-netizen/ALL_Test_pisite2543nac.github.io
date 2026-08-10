NANGRONG EXAM — FULL 550 QUESTIONS + 30 MINUTE ANSWER REVIEW

ระบบ:
1) นักศึกษาลงทะเบียนก่อน
2) เลือกรายวิชา
3) กรอก Code แยกรายวิชา (ปัจจุบันทุกวิชาใช้ A2000)
4) เข้าสอบ 50 ข้อ / 75 นาที / คะแนนเต็ม 20
5) นักศึกษาเลือกได้ว่าจะรับเฉลยหรือไม่
6) ถ้าเลือกรับเฉลย: หลังส่งข้อสอบครบ 30 นาที ระบบเปิดเฉลยพร้อมเหตุผลรายข้อ
7) หน้า Student ไม่แสดงคะแนน
8) Admin ดูคะแนนและจัดการข้อสอบได้เหมือนเดิม

คลังข้อสอบ:
- 11 วิชา
- วิชาละ 50 ข้อ
- รวม 550 ข้อ
- ต่อวิชา: ง่าย 15 + พื้นฐาน 10 + ยาก 25
- ทุกข้อมี correct + explain
- ระดับความยากไม่แสดงในหน้าผู้เข้าสอบ

ไฟล์สำคัญ:
- initial-question-bank-all-subjects.json = คลังข้อสอบ 550 ข้อพร้อมเฉลยสำหรับนำเข้า Firestore
- answer-bank-30min.json = ชุดเฉลยที่หน้า Student โหลดเมื่อครบเวลารอ 30 นาที
- QUESTION_BANK_MANIFEST.json = สรุปจำนวนข้อสอบ
- firestore.rules = Rules ล่าสุด
- firebase-config.js = Firebase config ล่าสุด

วิธีติดตั้ง:
1) แตก ZIP และวางทับไฟล์ทั้งหมดใน root ของ GitHub Repository
2) รอ GitHub Pages Deploy สำเร็จ
3) นำ firestore.rules ไป Firebase > Firestore Database > Rules > Publish
4) Login Admin > จัดการข้อสอบ > นำเข้าคลังข้อสอบ JSON
5) เลือก initial-question-bank-all-subjects.json
6) เมื่อสำเร็จ Admin ควรแสดง 550 ข้อ / 11 วิชา

หมายเหตุ:
- ระบบนับ 30 นาทีจากเวลาที่ส่งข้อสอบสำเร็จ
- ถ้าปิดหน้าเว็บ สามารถกลับมาเปิดบนเบราว์เซอร์เดิมได้ ระบบเก็บเวลาปลดล็อกเฉลยไว้ใน localStorage
- รอบสอบที่ถูกยุติจากพฤติกรรมต้องสงสัยจะไม่เปิดเฉลย
