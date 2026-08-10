NANGRONG EXAM — REGISTER -> SUBJECT CODE -> EXAM

ลำดับการใช้งาน
1) นักศึกษาลงทะเบียนก่อน: เลขนักศึกษา / ชื่อ-นามสกุล / ชั้น-กลุ่ม / แผนก
2) ระบบแสดง 11 รายวิชา
3) แต่ละรายวิชามีช่องกรอก Code ของตัวเอง
4) Code ปัจจุบันของทุกวิชา = A2000
5) Code ถูกต้อง -> ระบบบันทึก registration ของวิชานั้นใน Firestore -> โหลดข้อสอบ -> เริ่มสอบ
6) ส่งข้อสอบ -> บันทึก submissions -> หน้า User ไม่แสดงคะแนน
7) Admin เป็นผู้ดูคะแนนและข้อมูลทั้งหมด

ไฟล์ข้อสอบพร้อมนำเข้า:
initial-question-bank-all-subjects.json

จำนวนข้อสอบ:
11 วิชา x 50 ข้อ = 550 ข้อ
ต่อวิชา: ง่าย 15 + พื้นฐาน 10 + ยาก 25
ระดับความยากไม่แสดงในหน้าผู้เข้าสอบ

การติดตั้ง:
- แตก ZIP แล้วอัปโหลดไฟล์ทั้งหมดวางทับ root ของ GitHub Repository
- รอ GitHub Pages deploy สำเร็จ
- นำ firestore.rules ไปวางใน Firebase > Firestore Database > Rules > Publish
- Login Admin
- แท็บจัดการข้อสอบ > นำเข้าคลังข้อสอบ JSON
- เลือก initial-question-bank-all-subjects.json
- หลังนำเข้าสำเร็จหน้า Admin ควรแสดง 550 ข้อ และ 11 วิชาพร้อมสอบ

Firebase config ในชุดนี้ใช้ API key ตัวล่าสุดที่คัดลอกจาก Firebase Console:
AIzaSyDS6O53SYD8nAqYN3lu9YVT1UbKobIRx00
