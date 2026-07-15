// seed.js — สร้างข้อมูลเริ่มต้น (กะ/วันหยุด/รายชื่อพนักงาน) เข้า Firestore ให้อัตโนมัติ
// ใช้ร่วมกันทั้งฝั่งพนักงาน (app.js) และฝั่งแอดมิน (admin.js) เพื่อแก้ปัญหา
// "เลือกชื่อเข้าระบบไม่ได้" ที่เกิดจากการที่ยังไม่มีใครเคยเปิดหน้าแอดมินมาก่อน (ทำให้ยังไม่มี
// รายชื่อพนักงานในฐานข้อมูลเลย) — ไม่ว่าใครจะเปิดหน้าไหนก่อน (index.html หรือ admin.html)
// ระบบจะตรวจสอบและสร้างข้อมูลเริ่มต้นให้เหมือนกัน (สร้างเฉพาะตอนที่ collection นั้นยังว่างอยู่เท่านั้น)
import { SHIFTS, HOLIDAYS_2026, EMPLOYEES_SEED } from "./config.js";
import { db, collection, addDoc, doc, getDocs, setDoc, serverTimestamp } from "./firebase-init.js";
import { SHIFTS_COLLECTION, HOLIDAYS_COLLECTION, EMPLOYEES_COLLECTION } from "./firebase-init.js";

export async function ensureDefaultShifts() {
  try {
    const snap = await getDocs(collection(db, SHIFTS_COLLECTION));
    if (!snap.empty) return;
    for (const s of SHIFTS) {
      await setDoc(doc(db, SHIFTS_COLLECTION, s.id), s);
    }
  } catch (e) {
    console.warn("ตั้งค่ากะเริ่มต้นไม่สำเร็จ (ตรวจสอบว่าตั้งค่า Firebase/Firestore rules ไว้แล้วหรือยัง)", e);
  }
}

export async function ensureDefaultHolidays() {
  try {
    const snap = await getDocs(collection(db, HOLIDAYS_COLLECTION));
    if (!snap.empty) return;
    for (const h of HOLIDAYS_2026) {
      await addDoc(collection(db, HOLIDAYS_COLLECTION), h);
    }
  } catch (e) {
    console.warn("ตั้งค่าวันหยุดเริ่มต้นไม่สำเร็จ (ตรวจสอบว่าตั้งค่า Firebase/Firestore rules ไว้แล้วหรือยัง)", e);
  }
}

export async function ensureDefaultEmployees() {
  try {
    const snap = await getDocs(collection(db, EMPLOYEES_COLLECTION));
    if (!snap.empty) return;
    for (const e of EMPLOYEES_SEED) {
      await addDoc(collection(db, EMPLOYEES_COLLECTION), { ...e, createdAt: serverTimestamp() });
    }
  } catch (err) {
    console.warn("ตั้งค่ารายชื่อพนักงานเริ่มต้นไม่สำเร็จ (ตรวจสอบว่าตั้งค่า Firebase/Firestore rules ไว้แล้วหรือยัง)", err);
  }
}

// เรียกทั้งหมดครั้งเดียว — ใช้ตอนบูตทั้งฝั่งพนักงานและฝั่งแอดมิน
export async function ensureAllDefaults() {
  await ensureDefaultShifts();
  await ensureDefaultHolidays();
  await ensureDefaultEmployees();
}
