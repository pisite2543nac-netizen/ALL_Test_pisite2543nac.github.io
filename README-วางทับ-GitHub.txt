NANGRONG EXAM SYSTEM — STABLE CATEGORIZED V1
Version: 20260817-STABLE-CATEGORIZED-V1

จุดเด่น:
- ใช้ Stable Core: การเริ่มสอบไม่พึ่ง examAttempts/registrations
- Fullscreen เรียกทันทีจากการคลิกก่อน Network/Firestore
- ข้อสอบมาตรฐาน 11 วิชา รวม 550 ข้ออยู่ครบ
- Submission ส่งตรงเข้า Firestore แล้ว Admin คำนวณคะแนนจาก answerKeys
- หน้าลงทะเบียนแยกข้อมูล:
  เลขนักศึกษา / ชื่อ / ระดับชั้น / ห้อง / แผนก / สาขา / รหัสสาขา
- หน้า Admin แสดง User 1 บัญชีต่อ 1 แถว ไม่ซ้ำตามจำนวน Login
- Admin กรองได้:
  ระดับชั้น / ห้อง / แผนก / สาขา / รายวิชา / สถานะ
- Result กรองได้:
  ระดับชั้น / ห้อง / แผนก / สาขา / รายวิชา
- Export Excel แยกคอลัมน์ระดับชั้น ห้อง แผนก สาขา รหัสสาขา
- User เก่าที่ยังมีแค่ className/department ยัง Login ได้

แผนก/สาขาที่ตั้งต้น:
1) คอมพิวเตอร์
   - เทคโนโลยีสารสนเทศ (ทส.)
   - เทคโนโลยีธุรกิจดิจิทัล (ทด.)
   - คอมพิวเตอร์ธุรกิจ (คธ.)
2) อิเล็กทรอนิกส์
   - อิเล็กทรอนิกส์ (อิ.)

แก้ตัวเลือกทั้งหมดได้จากไฟล์ student-catalog.js

ขั้นตอนติดตั้ง:
1. แตก ZIP
2. อัปโหลดทุกไฟล์ไป ROOT ของ GitHub Repository และวางทับของเดิม
3. Firebase > Firestore Database > Rules
4. ลบ Rules เดิมทั้งหมด
5. วาง firestore.rules จาก ZIP
6. Publish
7. รอ 30-60 วินาที
8. Ctrl+F5
9. ตรวจมุมขวาล่าง: System 20260817-STABLE-CATEGORIZED-V1
10. ทดสอบ Login > Code > คำชี้แจง > Fullscreen > ทำข้อสอบ > ส่ง > ตรวจ Admin


MAJOR DROPDOWN FIX V2
Version: 20260817-STABLE-CATEGORIZED-V2
- ช่องสาขาวิชาไม่ disabled อีกต่อไป
- เปิดหน้า Register แล้วเลือกสาขาได้ทันที
- หากเลือกแผนก ระบบจะกรองสาขาให้ตรงกับแผนก
- หาก JavaScript การกรองมีปัญหา สาขายังเลือกได้จาก Static HTML fallback
- หน้า Admin > เพิ่ม User ใช้หลักเดียวกัน


USER DATASET SPLIT V3
Version: 20260817-STABLE-CATEGORIZED-V3-SPLIT

หลักการ:
- ไม่ Migration / ไม่แก้ไขข้อมูล studentUsers ชุดเก่าอัตโนมัติ
- User ชุดเก่า = ไม่มี marker categorized และไม่มีชุด field สาขาครบ
- User ชุดใหม่ = profileFormat='categorized' / profileSchemaVersion=2
- User ที่เคยสร้างใน Categorized V1/V2 และมี classLevel,classRoom,departmentId,majorId,major,majorCode ครบ
  จะถูกแสดงในชุดใหม่โดยการ "ตรวจรูปแบบ" เท่านั้น ไม่มีการเขียนข้อมูลกลับฐานข้อมูล
- User สมัครใหม่ทุกคนจะถูกติด marker ชุดใหม่
- User ที่ Admin สร้างใหม่ทุกคนจะถูกติด marker ชุดใหม่

หน้า Admin:
- ตาราง User ชุดใหม่ แยกต่างหาก
- ตาราง User ชุดเก่า แยกต่างหาก
- ชุดใหม่กรอง Level / Room / Department / Major / Subject / Status
- ชุดเก่าค้นหาข้อมูลเดิม + Subject / Status
- ข้อมูลชุดเก่าแสดง className และ department เดิมตรง ๆ
