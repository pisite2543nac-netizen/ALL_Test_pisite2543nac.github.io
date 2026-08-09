วิทยาลัยเทคนิคนางรอง - ชุดเว็บข้อสอบ Firebase (พร้อมใช้งาน)

ไฟล์ที่แนะนำให้อัปโหลดทับ GitHub ทั้งหมด:
1. index.html
2. admin.html
3. student.js
4. admin.js
5. firebase-config.js
6. firebase-service.js
7. styles.css

ไฟล์ firestore.rules:
- ไม่ใช่ไฟล์ที่อัปโหลด GitHub แล้วจะทำงานเอง
- ให้เปิด Firebase Console > Firestore Database > Rules
- ลบ Rules เดิม วางเนื้อหาจาก firestore.rules แล้วกด Publish

ไฟล์ initial-question-bank.json:
- เก็บไว้ที่เครื่องผู้ดูแล
- เข้าหน้า admin.html > จัดการข้อสอบ > นำเข้าชุดข้อสอบ JSON
- เลือกไฟล์นี้เพื่อนำเข้าข้อสอบเริ่มต้น 50 ข้อ

Admin:
Username: nkseza2000
Firebase Auth Email: nkseza2000@nangrong-exam.invalid
Admin UID: NOy0qe3lgLbgvoVhuxHBeq7ZVYs2

หมายเหตุ:
- รหัสผ่านตรวจสอบโดย Firebase Authentication ไม่ได้ฝังไว้ใน JavaScript
- หากเปลี่ยนรหัสผ่านใน Firebase หน้าเว็บจะใช้รหัสผ่านใหม่ทันที
