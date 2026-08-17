NANGRONG EXAM — DASHBOARD V2

ฟีเจอร์ใหม่
- Dashboard ใหม่พร้อมสรุปข้อสอบ ผู้ลงทะเบียน กำลังสอบ ส่งข้อสอบ และคะแนนเฉลี่ย
- สรุปผลแยกตามรายวิชา
- กรองผลสอบตามรายวิชาและชั้น/ห้อง
- ค้นหานักศึกษาด้วยชื่อ เลขนักศึกษา ชั้น หรือแผนก
- ส่งออก Excel: ผลสอบ / ผู้เข้าสอบ / ทั้งระบบ
- หน้า Admin เพิ่ม User เข้าระบบได้โดยตรง และลบรายคนได้
- รายชื่อนักศึกษาขึ้นแบบเรียลไทม์ทันทีหลังลงทะเบียน
- คะแนนแสดงใน Admin หลังส่งข้อสอบสำเร็จเท่านั้น
- หลังลงทะเบียน Student จะเห็นช่อง “รหัสล็อกอินเข้าวิชา” แยกแต่ละวิชา
- ปุ่มลบข้อมูลจำนวนมากย้ายไป Danger Zone แบบพับซ่อน
- “ลบข้อสอบทั้งหมด” ต้องพิมพ์ DELETE 550 และยืนยันซ้ำ
- ข้อสอบมาตรฐาน 550 ข้อยังฝังพร้อมใช้ และ Admin เพิ่ม/แก้ไข/ลบรายข้อได้
- มีพื้นที่ใน Dashboard ระบุแผนพัฒนา Educational Games ในอนาคต

ติดตั้ง
1. แตก ZIP และอัปโหลดไฟล์ทั้งหมดทับ root ของ GitHub Repository
2. รอ GitHub Pages deployment สำเร็จ
3. นำ firestore.rules ในชุดนี้ไป Firebase > Firestore Database > Rules > Publish
4. กด Ctrl+F5 ที่หน้า Student และ Admin

หมายเหตุ Excel
ระบบใช้ SheetJS จาก CDN เพื่อสร้างไฟล์ .xlsx หากปุ่ม Excel ไม่ทำงานให้ตรวจสอบว่าเครือข่ายอนุญาต cdn.jsdelivr.net


NAVIGATION FIX หลังส่งข้อสอบ
- หน้า "รอเฉลย / ดูเฉลย" มีปุ่มกลับหน้าหลัก
- มีปุ่มเลือกวิชาอื่น โดยยังใช้ข้อมูลนักศึกษาคนเดิมใน session ปัจจุบัน
- มีปุ่มออกจากผู้เข้าสอบ เพื่อล้างข้อมูลฟอร์มและกลับหน้าลงทะเบียน
- การออกจากหน้าเฉลยไม่ลบผลสอบ และไม่ยกเลิกเวลารอ 30 นาที
- หน้าแรกมีปุ่ม "ดูสถานะเฉลย" หากยังมีเฉลยจากการสอบก่อนหน้าที่กำลังรอ
- ยกเลิกการบังคับ Auto Resume หน้าเฉลยเมื่อเปิดเว็บใหม่ เพื่อไม่ให้ผู้ใช้ติดอยู่หน้าเดิม


USER LOGIN / LOGOUT
- หน้าแรกมี "เข้าสู่ระบบ" และ "ลงทะเบียนผู้ใช้ใหม่"
- ลงทะเบียนครั้งแรก: เลขนักศึกษา + ชื่อ + ชั้น/ห้อง + แผนก + รหัสผ่าน
- รหัสผ่านขั้นต่ำ 6 ตัวอักษร
- Login ครั้งต่อไปใช้เลขนักศึกษา + รหัสผ่าน
- มี Logout ที่หน้าเลือกวิชาและหลังสอบ
- Login Student แยก Firebase App จาก Admin ทำให้เปิด Admin และ Student พร้อมกันได้โดยไม่ชน session
- ข้อมูล Student เก็บใน studentUsers/{uid}
- รายชื่อการเข้าใช้งานยังขึ้น Admin ผ่าน studentCheckins
- Admin สามารถสร้าง User Login พร้อมรหัสผ่านเริ่มต้นได้จากหน้า "ผู้เข้าสอบ"
- ต้อง Publish firestore.rules เวอร์ชันนี้ เพราะเพิ่ม studentUsers และสิทธิ์ authenticated student


ANSWER TAG — USER ONLY + 1 DAY EXPIRY
- แท็ก "มีเฉลยจากการสอบก่อนหน้า" ย้ายไปอยู่หน้า User หลัง Login เท่านั้น
- หน้า Login / ลงทะเบียน จะไม่เห็นแท็กเฉลย
- สถานะเฉลยผูกกับ UID และเลขนักศึกษาของ User เพื่อไม่ให้ User คนอื่นบนเครื่องเดียวกันเห็น
- เฉลยเปิดหลังส่งข้อสอบ 30 นาทีเหมือนเดิม
- หลังเฉลยเปิดแล้ว จะเก็บให้ดูได้อีก 24 ชั่วโมง
- เมื่อครบ 24 ชั่วโมง ระบบลบสถานะเฉลยจาก localStorage และแท็กจะหายไปอัตโนมัติ


รหัสเข้าสอบรายวิชาแบบแยกกัน
- 20001-1001 สุขภาพความปลอดภัยและสิ่งแวดล้อม: S8F2K1
- 20001-1004 กฎหมายแรงงาน: L7W4P9
- 21900-1005 เครือข่ายคอมพิวเตอร์: N5T8R2
- 21901-2008 การออกแบบส่วนติดต่อผู้ใช้: U3I7X5
- 21901-2017 เทคโนโลยีการนำเข้าข้อมูลเข้าสู่ระบบคอมพิวเตอร์: D9I4M6
- 21901-2020 ปฏิบัติงานบริการคอมพิวเตอร์และเทคโนโลยีสารสนเทศ: T6S2V8
- 21910-2010 การเขียนโปรแกรมภาษาคอมพิวเตอร์: C4D9K3
- 31901-2001 การออกแบบส่วนติดต่อผู้ใช้ขั้นสูง: A7U5Q2
- 31901-2004 การพัฒนาซอฟต์แวร์ด้วยเทคโนโลยี Front-End: F8E3R7
- 31901-2009 การพัฒนาซอฟต์แวร์สำหรับอุปกรณ์เคลื่อนที่: M2B6X9
- 31910-0004 การเขียนโปรแกรมคอมพิวเตอร์: P5G8N4


CLASS DROPDOWN
ช่องระดับชั้นในหน้าลงทะเบียนและหน้า Admin > เพิ่ม User เปลี่ยนเป็น Dropdown แล้ว
ตัวเลือก:
- ปวส.1
- ปวส.2
- ปวส.3
- ปวช.1
- ปวช.2
- ปวช.3
- ปวช.4


CLASS + ROOM DROPDOWN
ระดับชั้น:
- ปวส.1
- ปวส.2
- ปวส.3
- ปวช.1
- ปวช.2
- ปวช.3
- ปวช.4

ห้อง / กลุ่ม:
- /1
- /2
- /3
- /4
- /5
- /6

ระบบจะรวมเป็นค่าเดียว เช่น ปวช.2/3 หรือ ปวส.1/5 เพื่อใช้แสดงและกรองในหน้า Admin


ADMIN QUESTION + USER MANAGER
1) จัดการจำนวนข้อสอบแยกรายวิชา
- ตารางแสดงจำนวนข้อของทั้ง 11 วิชา
- + เพิ่มข้อ: เลือกวิชานั้นและเปิดฟอร์มเพิ่มข้อ
- ตรวจข้อสอบ/เฉลย: กรองและแสดงข้อทั้งหมดของวิชาพร้อมคำตอบที่ถูกและคำอธิบาย
- - ลด 1 ข้อ: ลบข้อสุดท้ายของวิชานั้นพร้อม answerKeys โดยต้องยืนยันก่อน
- ยังสามารถลบรายข้อและแก้ไขรายข้อได้เหมือนเดิม
- เพิ่มตัวเลือกระดับข้อสอบ ง่าย / พื้นฐาน / ยาก

2) เพิ่ม / ลบ User
- Admin เพิ่ม User พร้อมสร้าง Firebase Auth + studentUsers + studentCheckins
- ปุ่มลบ User จะลบ studentUsers และ studentCheckins ของบัญชีนั้น
- ผลสอบ submissions เดิมจะไม่ถูกลบ เพื่อเก็บเป็นหลักฐาน
- Firebase Authentication credential ภายในยังคงอยู่ เพราะการลบ Auth ของผู้ใช้อื่นแบบถาวรต้องใช้ Firebase Admin SDK / Cloud Function
- หลังโปรไฟล์ studentUsers ถูกลบ User จะ Login ผ่าน Auth ได้แต่ระบบจะไม่อนุญาตให้เข้าใช้งานข้อสอบเพราะไม่มีโปรไฟล์


PRE-EXAM INSTRUCTION PAGE
หลัง Student กรอก Code รายวิชาถูกต้อง:
1. ระบบโหลดข้อสอบ
2. ยังไม่เริ่ม Timer และยังไม่เข้า Fullscreen
3. แสดงหน้าคำชี้แจงก่อนสอบ
4. แสดงชื่อผู้สอบและรายวิชา
5. อธิบาย 50 ข้อ / 75 นาที / การสุ่ม / การส่งข้อสอบ
6. อธิบาย Anti-Cheat: เปลี่ยน Tab, ออกจาก Fullscreen, Copy/Cut/Paste/คลิกขวา และเกณฑ์ 3 ครั้ง
7. อธิบายสถานะรับเฉลยของ User
8. Student ต้องติ๊กยอมรับคำชี้แจงก่อน ปุ่ม “เริ่มทำข้อสอบ” จึงกดได้
9. เมื่อกดเริ่มจริง จึงสร้าง Registration/Attempt, เข้า Fullscreen และเริ่มนับเวลา
10. Student สามารถกดกลับไปเลือกวิชาได้ก่อนเริ่มสอบ


MAXIMUM 2 EXAM ATTEMPTS PER USER PER SUBJECT
- 1 User มีสิทธิ์สอบแต่ละรายวิชาได้สูงสุด 2 ครั้ง
- นับสิทธิ์เมื่อกด "เริ่มทำข้อสอบ" จริงเท่านั้น
- กรอก Code หรือเปิดอ่านคำชี้แจงยังไม่เสียสิทธิ์
- รอบที่ส่งปกติ / หมดเวลา / ถูกยุติการสอบ ล้วนเป็นรอบที่ใช้สิทธิ์แล้ว
- หากถูกยุติการสอบ รอบนั้นนับเป็น 1 ครั้ง และไม่ได้รับเฉลย
- หากถูกยุติ 2 รอบ หรือใช้สิทธิ์รวมครบ 2 รอบ จะหมดสิทธิ์สอบวิชานั้น
- หน้าเลือกวิชาแสดง ใช้แล้ว / เหลือ และจำนวนรอบที่ถูกยุติ
- เมื่อครบ 2 ครั้ง ช่อง Code และปุ่มเข้าสอบของวิชานั้นจะถูกล็อก
- หน้าคำชี้แจงมี Warning สีแดงขนาดใหญ่
- ก่อนเริ่มจริงจะแสดงว่า รอบนี้คือครั้งที่เท่าไร และหลังเริ่มจะเหลือกี่ครั้ง
- เพิ่ม Collection examAttempts สำหรับเก็บสิทธิ์ราย User/รายวิชา
- ต้อง Publish firestore.rules เวอร์ชันนี้ก่อนใช้งานระบบจำกัดสิทธิ์


ADMIN UNLOCK EXAM RIGHTS
- หน้า Admin > ผู้เข้าสอบ แสดงสิทธิ์สอบราย User/รายวิชา เช่น ใช้ 1/2 เหลือ 1
- เมื่อใช้ครบ 2/2 จะแสดงสถานะ "หมดสิทธิ์"
- จะปรากฏปุ่ม "ปลดล็อกให้สอบใหม่"
- Admin กดปลดล็อกแล้ว examAttempts ของ User + วิชานั้นจะรีเซ็ต:
  attemptsUsed = 0
  terminatedCount = 0
  maxAttempts = 2
- คะแนนและ submissions/ประวัติสอบเดิมไม่ถูกลบ
- นักศึกษาจะกลับมามีสิทธิ์สอบวิชานั้นอีก 2 ครั้ง
- หากนักศึกษาหมดสิทธิ์ หน้า Student จะแสดงข้อความ:
  "ยุติสิทธิ์การสอบทันที กรุณาติดต่อ Admin เพื่อขอสิทธิ์สอบใหม่"
- การปลดล็อกเป็นรายวิชา จึงไม่กระทบสิทธิ์ของวิชาอื่น
- Firestore Rules ชุด MAX_2_ATTEMPTS รองรับ Admin update examAttempts อยู่แล้ว


REQUEST SCORE / RETAKE / FULLSCREEN GUARD
1) คำร้องขอดูคะแนน
- หลังส่งข้อสอบปกติ Student กด "ขออนุมัติดูคะแนนสอบ"
- สร้าง examRequests status=pending
- Admin เห็นคำร้องแบบ realtime
- Admin เห็นคะแนนจริง แต่ Student ยังไม่เห็น
- เมื่อ Admin อนุมัติ ระบบเขียน approvedScore/correctCount/pass ลงในคำร้อง
- Student เจ้าของคำร้องเห็นคะแนนเฉพาะของตัวเองใน Request Center
- User คนอื่นอ่านคำร้อง/คะแนนของคนอื่นไม่ได้ตาม Firestore Rules

2) คำร้องขอสอบแก้
- Student ส่งคำร้องจากผลสอบรอบล่าสุด
- Admin คำนวณคะแนนจริงจาก answerKeys
- เกณฑ์สอบไม่ผ่านสำหรับการอนุมัติสอบแก้ = ต่ำกว่า 10/20
- หากคะแนน >=10 Admin จะไม่สามารถอนุมัติคำร้องสอบแก้
- หากคะแนน <10 Admin อนุมัติได้
- เมื่ออนุมัติ examAttempts ถูกตั้ง attemptsUsed=1 ทำให้มีสิทธิ์สอบเพิ่มอีก 1 ครั้ง
- คะแนน/Submission เดิมไม่ถูกลบ

3) Fullscreen / Anti-Cheat
- ต้องอยู่ Fullscreen ตลอดเวลาสอบ
- ตรวจ visibilitychange, window blur, fullscreenchange
- บล็อก F12, Ctrl/Cmd+Shift+I/J/C, Ctrl/Cmd+U/S/P/C/V/X
- บล็อก copy/cut/paste/contextmenu
- ออกจาก Fullscreen จะขึ้น Blocking Overlay และต้องกลับ Fullscreen ก่อนทำต่อ
- พฤติกรรมต้องสงสัยเกิน 2 ครั้ง (ครั้งที่ 3) = ยุติการสอบ
- หมายเหตุ: Web Browser ไม่สามารถรับประกันตรวจจับ Developer Tools ได้ 100% ทุกวิธี/ทุก Browser

4) สละสิทธิ์สอบกลางคัน
- มีปุ่ม "สละสิทธิ์สอบกลางคัน" ในหน้าสอบ
- ต้อง Confirm ก่อน
- status=forfeited
- นับเป็นการใช้สิทธิ์สอบ 1 ครั้ง
- ไม่มีเฉลยสำหรับรอบที่สละสิทธิ์


EXAM START FIX
- แก้ปัญหากด "เริ่มทำข้อสอบ" แล้วขึ้น permission-denied
- รองรับ registrations เก่าที่ถูกสร้างก่อนระบบ User Auth และยังไม่มี ownerUid
- นับ examAttempts + สร้าง registrations ใน Firestore Transaction เดียว
- หาก Firestore ปฏิเสธ Registration จะไม่เสียสิทธิ์สอบ
- ต้อง Publish firestore_rules_EXAM_START_FIX.rules
- หลัง Publish รอประมาณ 1 นาที และกด Ctrl+F5 ที่หน้าเว็บ


EXAM START FIX V2 / CACHE BUST
Version: 20260817-EXAMFIX-V2
- index.html บังคับโหลด student.js?v=20260817-EXAMFIX-V2
- admin.html บังคับโหลด admin.js?v=20260817-EXAMFIX-V2
- มุมขวาล่างจะแสดง System 20260817-EXAMFIX-V2 เพื่อยืนยันว่าเว็บโหลดชุดใหม่จริง
- Rules รองรับ legacy examAttempts ที่ไม่มี ownerUid
- Rules รองรับ legacy registrations
- Attempt + Registration สร้างแบบ Transaction เดียว: ไม่สำเร็จ = ไม่หักสิทธิ์
- หลัง Upload GitHub และ Publish Rules ให้ตรวจว่ามุมขวาล่างขึ้น 20260817-EXAMFIX-V2


EXAM START FIX V3
Version: 20260817-EXAMFIX-V3
สาเหตุที่แก้:
- Registration เดิมใช้ ID ซ้ำต่อ User/วิชา ทำให้รอบใหม่กลายเป็น update document เก่า
- V3 เปลี่ยนเป็น Registration ID ใหม่ทุกครั้งที่เริ่มสอบ
- นักศึกษาจึงใช้ Firestore create เท่านั้น ไม่แก้ Registration เก่า
- examAttempts + registration ใหม่ ยังถูกสร้างใน Transaction เดียว
- ถ้า Rules ปฏิเสธ จะไม่หักสิทธิ์สอบ
- Firestore Rules ของ registrations ง่ายและชัดขึ้น
- ต้อง Publish firestore_rules_EXAM_START_FIX_V3.rules


EXAM START FIX V4 LEGACY
Version: 20260817-EXAMFIX-V4
- รองรับ examAttempts เก่าที่ไม่มี ownerUid
- รองรับ examAttempts เก่าที่ไม่มี terminatedCount
- รองรับ examAttempts เก่าที่ไม่มี maxAttempts
- รองรับ document เก่าที่ field ยังไม่ครบ โดยใช้ค่าเริ่มต้น attemptsUsed=0, terminatedCount=0 ใน Rules
- Registration ยังคงสร้างใหม่ทุกครั้งเหมือน V3
- Attempt + Registration ยังคงเป็น Transaction เดียว
- หากเริ่มสอบไม่สำเร็จจะไม่หักสิทธิ์
- ต้อง Publish firestore_rules_EXAM_START_FIX_V4_LEGACY.rules


EXAM START FIX V5 DOCID
Version: 20260817-EXAMFIX-V5

แนวทางแก้หลัก:
- examAttempts ใช้ Document ID = UID__subjectId เป็นเจ้าของสิทธิ์โดยตรง
- ไม่อ้าง ownerUid เก่าใน resource สำหรับการอนุญาต migration
- รองรับ document เก่าที่ ownerUid ผิด/ไม่มี
- รองรับ document เก่าที่ attemptsUsed/terminatedCount ยังไม่ครบ
- User อ่าน/เขียนได้เฉพาะ document ที่ขึ้นต้นด้วย UID ของตัวเอง
- Registration ยังสร้างใหม่ทุกครั้ง
- Attempt + Registration ยังเป็น Transaction เดียว
- เริ่มไม่สำเร็จ = ไม่หักสิทธิ์สอบ

ต้อง Publish firestore_rules_EXAM_START_FIX_V5_DOCID.rules
