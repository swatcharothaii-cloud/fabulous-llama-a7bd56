// ============================================================
//  ตั้งค่าระบบ — REPLACE ME
//  ดูวิธีขอค่าต่างๆ ได้ใน README.md
// ============================================================

// 1) Firebase project config (Firebase Console > Project settings > Your apps > Web app)
//    ระบบนี้แนะนำให้สร้าง Firebase project แยกต่างหากจากแอปแจ้งซ่อม เพื่อไม่ให้ข้อมูลปะปนกัน
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAQ_2QKvYeq7dcp6-9o2mE2rzBB5q_-_6M",
  authDomain: "hr-attendance-app-98c25.firebaseapp.com",
  projectId: "hr-attendance-app-98c25",
  storageBucket: "hr-attendance-app-98c25.firebasestorage.app",
  messagingSenderId: "656660685054",
  appId: "1:656660685054:web:02e1b5074713b0ca6ac5af",
};

// 2) LINE LIFF ID (LINE Developers Console > สร้าง LIFF app) — ถ้าไม่ต้องการรันผ่าน LINE ให้เว้นว่างไว้เป็น ""
export const LIFF_ID = "2010761793-s9SYXSSn"; // ใช้กับหน้าพนักงาน (index.html)
export const LIFF_ID_ADMIN = "2010761793-qoipiOoE"; // ใช้กับหน้าแอดมิน (admin.html) — คนละ LIFF app กับข้างบน

// 3) ข้อมูลบริษัท (แสดงหัวหน้า) — แก้ไขได้ตามต้องการ
export const COMPANY = {
  nameTh: "Trio-C Solution Co.,LTD",
  logo: "assets/logo.svg", // โลโก้บริษัท (จำลองสไตล์ตามภาพที่ส่งมา — เปลี่ยนเป็นไฟล์จริงได้ทุกเมื่อโดยแทนที่ไฟล์นี้)
};

// ============================================================
//  รายชื่อแอดมิน — เข้าใช้งานหน้าแอดมินด้วยการ "เลือกชื่อ + กรอกรหัส PIN"
//  จำกัดสิทธิ์แอดมินไว้เฉพาะ 4 คนตามที่อนุมัติ (ตามรูป Admin ที่แนบมา)
//  ⚠️ "pin" นี้เป็นเพียงชั้นความปลอดภัยเบื้องต้น (ไม่ใช่รหัสผ่านจริงแบบเข้ารหัส) ใช้ป้องกัน
//  ไม่ให้คนอื่นที่ไม่ใช่ 4 คนนี้กดเข้าหน้าแอดมินได้ง่ายๆ แต่ยังไม่ปลอดภัยเทียบเท่า Firebase
//  Authentication ดูคำเตือนเพิ่มเติมใน README.md — แก้ไข/เพิ่ม/ลบรายชื่อ+PIN ได้ที่นี่โดยตรง
// ============================================================
export const ADMINS = [
  { id: "001", name: "K.Eddie", pin: "12011976" },
  { id: "002", name: "K.Peggy", pin: "11071976" },
  { id: "003", name: "Nok", pin: "09091994" },
  { id: "004", name: "Treeya", pin: "17082542" },
];

// ============================================================
//  แผนก — ตรงตามโครงสร้างแผนกจริงของบริษัท (จากไฟล์รายชื่อพนักงาน)
// ============================================================
export const DEPARTMENTS = [
  "ผู้บริหาร",
  "Accounting",
  "Architect",
  "Build-In",
  "Marketing",
  "Purchasing",
  "Supervisor all team",
];

// ============================================================
//  กะการทำงาน (Shifts) — ตั้งค่าไว้ 4 กะเริ่มต้น แก้ไข/เพิ่ม/ลบได้ที่นี่
//  crossesMidnight: true = กะที่เวลาสิ้นสุดข้ามเที่ยงคืนไปอีกวัน (เช่น กะดึก)
// ============================================================
export const SHIFTS = [
  { id: "morning", name: "กะเช้า", start: "08:00", end: "17:00", breakMinutes: 60, crossesMidnight: false, color: "#f59e0b" },
  { id: "afternoon", name: "กะบ่าย", start: "12:00", end: "21:00", breakMinutes: 60, crossesMidnight: false, color: "#0ea5e9" },
  { id: "night", name: "กะดึก", start: "21:00", end: "06:00", breakMinutes: 60, crossesMidnight: true, color: "#8b5cf6" },
  { id: "office", name: "กะออฟฟิศ", start: "09:00", end: "18:00", breakMinutes: 60, crossesMidnight: false, color: "#10b981" },
];

// วันหยุดประจำสัปดาห์เริ่มต้น (0 = อาทิตย์, 1 = จันทร์, ... 6 = เสาร์) — ตั้งค่าเริ่มต้นให้พนักงานใหม่
// แก้ไขวันหยุดของพนักงานแต่ละคนแยกได้ที่หน้าแอดมิน (employee.weeklyDayOff)
export const DEFAULT_WEEKLY_DAYOFF = 0; // อาทิตย์

// ============================================================
//  รายชื่อพนักงานเริ่มต้น (หว่านเมล็ดเข้า Firestore ครั้งแรกที่เปิดหน้าแอดมิน ถ้ายังไม่มีข้อมูล
//  พนักงานเลยในระบบ) — คัดลอกมาจากไฟล์รายชื่อพนักงานที่แนบมา (รวม 36 คน แยกตามแผนก)
//  หลังจากหว่านเมล็ดครั้งแรกแล้ว ให้ไปแก้ไข/เพิ่ม/ลบพนักงานที่หน้าแอดมินแทนการแก้ไฟล์นี้
//  (กะการทำงานเริ่มต้นตั้งเป็น "กะออฟฟิศ" ให้ทุกคนไว้ก่อน แอดมินไปปรับกะจริงของแต่ละคนทีหลังได้)
// ============================================================
export const EMPLOYEES_SEED = [
  // ผู้บริหาร
  { name: "K.Eddie", department: "ผู้บริหาร" },
  { name: "K.Peggy", department: "ผู้บริหาร" },
  // Accounting
  { name: "Prem", department: "Accounting" },
  { name: "TC Accounting", department: "Accounting" },
  // Architect
  { name: "Nay", department: "Architect" },
  { name: "Off", department: "Architect" },
  // Build-In
  { name: "Au", department: "Build-In" },
  { name: "Gee (กี่)", department: "Build-In" },
  { name: "Ice", department: "Build-In" },
  { name: "Ing", department: "Build-In" },
  { name: "Jor Air (จอแอ)", department: "Build-In" },
  { name: "Ju", department: "Build-In" },
  { name: "K", department: "Build-In" },
  { name: "Kung", department: "Build-In" },
  { name: "Mon", department: "Build-In" },
  { name: "Ni (หนี่)", department: "Build-In" },
  { name: "Nong", department: "Build-In" },
  { name: "Num (หนุ่ม)", department: "Build-In" },
  { name: "Nurian (หนูเรียน)", department: "Build-In" },
  { name: "Nut", department: "Build-In" },
  { name: "Pao", department: "Build-In" },
  { name: "Prayong", department: "Build-In" },
  { name: "Qi", department: "Build-In" },
  { name: "Yhong (โหย่ง)", department: "Build-In" },
  { name: "ขวัญ", department: "Build-In" },
  // Marketing
  { name: "NNOKNK", department: "Marketing" },
  { name: "Bass", department: "Marketing" },
  { name: "PP (Pupae)", department: "Marketing" },
  // Purchasing
  { name: "Ja (จา)", department: "Purchasing" },
  { name: "Tua", department: "Purchasing" },
  // Supervisor all team
  { name: "Ya", department: "Supervisor all team" },
  { name: "Art", department: "Supervisor all team" },
  { name: "Green", department: "Supervisor all team" },
  { name: "Mui", department: "Supervisor all team" },
  { name: "Neng", department: "Supervisor all team" },
  { name: "Orr", department: "Supervisor all team" },
].map((e, i) => ({
  employeeCode: `EMP${String(i + 1).padStart(3, "0")}`,
  shiftId: "office",
  weeklyDayOff: DEFAULT_WEEKLY_DAYOFF,
  active: true,
  ...e,
}));

// ============================================================
//  ประเภทการลา
// ============================================================
export const LEAVE_TYPES = [
  { id: "sick", label: "ลาป่วย", color: "#ef4444" },
  { id: "personal", label: "ลากิจ", color: "#f59e0b" },
  { id: "vacation", label: "ลาพักร้อน", color: "#10b981" },
  { id: "maternity", label: "ลาคลอด", color: "#ec4899" },
  { id: "unpaid", label: "ลาไม่รับค่าจ้าง", color: "#6b7280" },
  { id: "other", label: "อื่นๆ", color: "#64748b" },
];

export const LEAVE_STATUS = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
};

// ============================================================
//  โควต้าวันลาต่อปี (Leave Quota) — เฉพาะ 3 ประเภทนี้เท่านั้นที่มีการนับโควต้า/หักวันลาจริง
//  (ลาคลอด/ลาไม่รับค่าจ้าง/อื่นๆ ไม่จำกัดโควต้า เพราะมีเงื่อนไขพิเศษ/ไม่ได้กำหนดวันตายตัว)
//  ตัวเลขนี้เป็นแค่ "ค่าเริ่มต้นตอนหว่านเมล็ดครั้งแรก" เท่านั้น หลังจากนั้นแอดมินปรับค่าจริงได้ที่
//  หน้าแอดมิน → แท็บ "สรุปวันลา" → "ตั้งค่าโควต้าเริ่มต้น" (บันทึกลง Firestore ปรับได้โดยไม่ต้องแก้โค้ด)
//  รอบปีของโควต้านับแบบ "ปีปฏิทิน" (รีเซ็ตอัตโนมัติทุกวันที่ 1 มกราคม โดยอิงจากวันที่เริ่มลาของคำขอ)
// ============================================================
export const QUOTA_LEAVE_TYPE_IDS = ["sick", "personal", "vacation"];
export const DEFAULT_LEAVE_QUOTA = {
  sick: 30, // ลาป่วย (วัน/ปี)
  personal: 3, // ลากิจ (วัน/ปี)
  vacation: 6, // ลาพักร้อน (วัน/ปี)
};

// ============================================================
//  สถานะคำขอสลับวันหยุด (พนักงานยื่นขอเอง แอดมินอนุมัติ)
// ============================================================
export const SWAP_STATUS = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
};

// ============================================================
//  วันหยุดประจำปีของบริษัท ปี 2026 (ดึงมาจากปฏิทินที่แนบมา)
//  แก้ไข/เพิ่ม/ลบได้ที่หน้าแอดมิน หรือแก้ตรงนี้โดยตรงก็ได้
// ============================================================
export const HOLIDAYS_2026 = [
  { date: "2026-01-01", name: "วันขึ้นปีใหม่" },
  { date: "2026-01-02", name: "วันขึ้นปีใหม่" },
  { date: "2026-01-03", name: "วันขึ้นปีใหม่" },
  { date: "2026-02-17", name: "วันตรุษจีน" },
  { date: "2026-04-13", name: "วันสงกรานต์" },
  { date: "2026-04-14", name: "วันสงกรานต์" },
  { date: "2026-04-15", name: "วันสงกรานต์" },
  { date: "2026-05-01", name: "วันแรงงาน" },
  { date: "2026-07-28", name: "วันพ่อรัชกาลที่ 10" },
  { date: "2026-08-12", name: "วันแม่แห่งชาติ" },
  { date: "2026-10-26", name: "วันออกพรรษา" },
  { date: "2026-12-30", name: "วันหยุดสิ้นปี" },
  { date: "2026-12-31", name: "วันหยุดสิ้นปี" },
];

// ============================================================
//  กฎการคำนวณ OT (ล่วงเวลา)
//  ⚠️ ค่าเริ่มต้นนี้อ้างอิงหลักการทั่วไปตาม พ.ร.บ.คุ้มครองแรงงาน สำหรับ "ลูกจ้างรายเดือน"
//  เท่านั้น ไม่ใช่คำแนะนำทางกฎหมายหรือบัญชีเงินเดือน กรุณาตรวจสอบกับฝ่ายบุคคล/นักบัญชี/
//  ที่ปรึกษากฎหมายแรงงานของบริษัทก่อนนำไปใช้จ่ายค่าจ้างจริง และปรับตัวเลขด้านล่างให้ตรงกับ
//  นโยบายบริษัทหรือสัญญาจ้างจริง (เช่น ลูกจ้างรายวันจะมีอัตราวันหยุดต่างจากนี้)
// ============================================================
export const OT_RULES = {
  normalWorkMinutesPerDay: 8 * 60, // ชั่วโมงทำงานปกติต่อวัน (นาที) เกินจากนี้ในวันทำงานปกติ = OT
  otRateWeekday: 1.5, // อัตรา OT ในวันทำงานปกติ (นอกเวลาทำงานปกติ)
  holidayBaseRate: 1, // อัตราค่าทำงานในวันหยุด/วันหยุดนักขัตฤกษ์ ภายในชั่วโมงทำงานปกติ
  holidayOtRate: 3, // อัตรา OT ในวันหยุด/วันหยุดนักขัตฤกษ์ (เกินชั่วโมงทำงานปกติ)
  lateThresholdMinutes: 5, // มาสายเกินกี่นาทีถึงจะนับว่า "สาย"
};

// ขนาดรูปภาพ (ใช้กรณีอนาคตอยากแนบรูปหลักฐานการลา ฯลฯ — ยังไม่ได้ใช้งานในเวอร์ชันนี้)
export const IMAGE_MAX_DIMENSION = 1000;
export const IMAGE_TARGET_BASE64_BYTES = 140 * 1024;
