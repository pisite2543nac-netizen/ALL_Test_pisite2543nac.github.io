import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export function isFirebaseConfigured(){
  return firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE_') &&
         firebaseConfig.projectId && !firebaseConfig.projectId.startsWith('PASTE_');
}

if(!isFirebaseConfigured()) console.warn('Firebase ยังไม่ได้ตั้งค่าใน firebase-config.js');

// Default app = Admin
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Secondary app = Student
// แยก Auth persistence ออกจาก Admin เพื่อให้เปิดหน้า Admin และ Student พร้อมกันได้
export const studentApp = initializeApp(firebaseConfig, "nangrongStudentApp");
export const studentAuth = getAuth(studentApp);
export const studentDb = getFirestore(studentApp);
