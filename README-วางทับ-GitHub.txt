ระบบข้อสอบออนไลน์ วิทยาลัยเทคนิคนางรอง — ชุดวางทับ GitHub

วิธีใช้งาน
1) แตก ZIP นี้
2) เข้า GitHub Repository: ALL_Test_pisite2543nac.github.io
3) อัปโหลดไฟล์ทั้งหมดใน ZIP ไปที่ root ของ branch main และเลือก Replace/Commit files
4) รอ Actions > pages build and deployment ขึ้น Success
5) กด Ctrl+F5 ที่หน้าเว็บ

สำคัญ: Firestore Rules ไม่ทำงานจาก GitHub
- เปิด Firebase Console > Firestore Database > Rules
- ลบ Rules เดิมทั้งหมด
- คัดลอกเนื้อหาไฟล์ firestore.rules ชุดนี้ไปวาง
- กด Publish

ข้อสอบ
- 11 รายวิชา
- วิชาละ 50 ข้อ รวม 550 ข้อ
- คะแนนเต็ม 20
- ห้องสอบทุกวิชา: A2000
- สุ่มลำดับข้อสอบและตัวเลือก
- นักเรียนไม่เห็นคะแนน
- Admin เท่านั้นที่เห็นคะแนน

นำเข้าคลังข้อสอบ
- Login admin.html
- ไปเมนู จัดการข้อสอบ
- กด นำเข้าคลังข้อสอบ JSON
- เลือก initial-question-bank-all-subjects.json
- หลังนำเข้าสำเร็จควรแสดง 550 ข้อ และ 11 วิชาพร้อมสอบ

Admin
Username: nkseza2000
Firebase Auth Email: nkseza2000@nangrong-exam.invalid
Admin UID: otCHJNeKfgbohIs1lVn7O7RD5m73
Password: ใช้รหัสที่ตั้งไว้ใน Firebase Authentication

หมายเหตุ
- data.js เป็นไฟล์ compatibility เท่านั้น ระบบใหม่ไม่ได้ใช้
- หาก Firebase API key ใน Project ถูกเปลี่ยนภายหลัง ให้แก้เฉพาะ firebase-config.js


อัปเดตหน้ารหัสเข้าสอบ:
- หน้าแรกแสดงช่องกรอกรหัสในแต่ละการ์ดรายวิชา
- รหัสทุกวิชา: A2000
- ใส่ถูกแล้วจึงปรากฏปุ่มเข้าสู่หน้าลงทะเบียน
- การลงทะเบียนนักศึกษาและการบันทึก Firestore ยังคงเดิม


อัปเดตหน้า CODE:
- หน้าแรกเป็นหน้ากรอก Code ก่อนเห็นรายวิชา
- Code ทุกวิชา: A2000
- เมื่อ Code ถูกต้อง ระบบจะแสดงรายวิชา 11 วิชา
- เลือกวิชาแล้วจึงเข้าสู่หน้าลงทะเบียนนักศึกษา
- การลงทะเบียน/Firestore/Admin/ผลสอบยังใช้ระบบเดิมทั้งหมด
- คลังข้อสอบรวมอยู่ในไฟล์ initial-question-bank-all-subjects.json จำนวน 550 ข้อ
  วิชาละ 50 ข้อ: ง่าย 15, พื้นฐาน 10, ยาก 25
