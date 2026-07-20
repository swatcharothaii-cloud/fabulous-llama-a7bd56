// ใช้ Firebase Modular SDK ผ่าน CDN (ไม่ต้องมี build step)
// หมายเหตุ: ไม่ใช้ Firebase Storage / Firebase Auth เพื่อไม่ต้องผูกบัตรเครดิต (แผน Spark ฟรีเพียงพอ)
// ระบุตัวตนพนักงาน/แอดมินด้วยวิธี "เลือกชื่อจากรายการ" (ดูรายละเอียดใน README.md)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { FIREBASE_CONFIG } from "./config.js";

// หมายเหตุ: แอปนี้ไม่ใช้ Firebase Cloud Functions (ซึ่งต้องอัปเกรดเป็นแผน Blaze/ผูกบัตรเครดิต) — การส่ง
// แจ้งเตือนเข้า LINE ทำผ่าน Netlify Function แทน (ดู netlify/functions/line-push.js และ js/notify.js)
// ซึ่งเป็นฟีเจอร์ฟรีของ Netlify ไม่ต้องผูกบัตร/ไม่มีค่าใช้จ่ายเพิ่มจากส่วนนี้
const app = initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(app);

export {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
};

// ---------- ชื่อ collection ใน Firestore ----------
export const EMPLOYEES_COLLECTION = "employees";
export const ATTENDANCE_COLLECTION = "attendanceRecords";
export const LEAVE_COLLECTION = "leaveRequests";
export const SWAPS_COLLECTION = "dayOffSwaps";
export const HOLIDAYS_COLLECTION = "holidays";
export const SHIFTS_COLLECTION = "shiftDefs";
// เก็บการ "ผูกบัญชี LINE" ของแอดมินแต่ละคน (id เอกสาร = admin.id ใน ADMINS ของ config.js)
// ใช้เพื่อให้ระบบแจ้งเตือนส่งอัตโนมัติเข้า LINE ของแอดมินได้ (ดู "เชื่อมต่อ LINE" ในแดชบอร์ด)
export const ADMIN_LINKS_COLLECTION = "adminLineLinks";
// เก็บค่าตั้งค่าระบบส่วนกลางที่แอดมินปรับได้โดยไม่ต้องแก้โค้ด — ตอนนี้มีเอกสารเดียวคือ
// "leaveQuotaDefaults" (โควต้าวันลาเริ่มต้นต่อปี ใช้ตอนเพิ่มพนักงานใหม่ หรือกด "ใช้ค่านี้กับทุกคน")
export const SETTINGS_COLLECTION = "appSettings";
