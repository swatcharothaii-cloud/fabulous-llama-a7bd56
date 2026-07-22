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
//    สำคัญ: LIFF app ทั้ง 2 ตัวนี้ต้องอยู่ใน Provider เดียวกับ Messaging API channel ที่ใช้ส่งแจ้งเตือน LINE
//    (ตัวที่ออก LINE_CHANNEL_ACCESS_TOKEN ใน Netlify) ไม่งั้น lineUserId ที่ได้จะไม่ตรงกับที่บอทรู้จัก
//    ทำให้ส่งข้อความแจ้งเตือนไม่ได้ (ดูหัวข้อ "แจ้งเตือนเข้า LINE" ใน README.md)
export const LIFF_ID = "2010761793-s9SYXSSn"; // ใช้กับหน้าพนักงาน (index.html) — channel "HR" ใน Provider "Admin"
export const LIFF_ID_ADMIN = "2010761793-qoipiOoE"; // ใช้กับหน้าแอดมิน (admin.html) — channel "HR Admin" ใน Provider "Admin"

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
  "Management team",
  "Accounting",
  "Architect",
  "Build-In",
  "Marketing",
  "Purchasing",
];

// สีประจำแต่ละแผนก (ใช้แสดงเป็นแถบสี/ป้ายสีในหน้าแอดมิน เพื่อแยกพนักงานตามแผนกได้ง่ายด้วยตา)
// ถ้ามีแผนกเพิ่มใหม่ที่ไม่อยู่ในนี้ ระบบจะสุ่มสีให้อัตโนมัติแบบคงที่ (ดู getDepartmentColor ใน admin.js)
export const DEPARTMENT_COLORS = {
  "Management team": "#ef4444",
  "Accounting": "#3b82f6",
  "Architect": "#8b5cf6",
  "Build-In": "#f59e0b",
  "Marketing": "#ec4899",
  "Purchasing": "#10b981",
  // ค่าเก่า เก็บไว้เผื่อพนักงานเก่าที่ยังไม่ถูกซิงก์ยังอ้างอิงชื่อแผนกแบบเดิมอยู่ (จะได้ไม่ขึ้นสีสุ่ม)
  "ผู้บริหาร": "#ef4444",
  "Supervisor all team": "#0ea5e9",
};

// ============================================================
//  กะการทำงาน (Shifts) — ตั้งค่าไว้ 5 กะเริ่มต้น แก้ไข/เพิ่ม/ลบได้ที่นี่
//  crossesMidnight: true = กะที่เวลาสิ้นสุดข้ามเที่ยงคืนไปอีกวัน (เช่น กะดึก)
//  หมายเหตุ: "office_0817" คือกะออฟฟิศตามไฟล์รายชื่อพนักงานล่าสุด (บัญชี/การตลาด/จัดซื้อ/สถาปนิก/Build-In
//  ทุกแผนกใช้กะนี้ตรงกัน) ส่วน "office" (09:00-18:00) เก็บไว้เผื่อมีพนักงานเก่าอ้างอิงอยู่ ไม่ได้ใช้ต่อแล้ว
// ============================================================
export const SHIFTS = [
  { id: "morning", name: "กะเช้า", start: "08:00", end: "17:00", breakMinutes: 60, crossesMidnight: false, color: "#f59e0b" },
  { id: "afternoon", name: "กะบ่าย", start: "12:00", end: "21:00", breakMinutes: 60, crossesMidnight: false, color: "#0ea5e9" },
  { id: "night", name: "กะดึก", start: "21:00", end: "06:00", breakMinutes: 60, crossesMidnight: true, color: "#8b5cf6" },
  { id: "office", name: "กะออฟฟิศ (09:00-18:00)", start: "09:00", end: "18:00", breakMinutes: 60, crossesMidnight: false, color: "#10b981" },
  { id: "office_0817", name: "กะออฟฟิศ (08:00-17:00)", start: "08:00", end: "17:00", breakMinutes: 60, crossesMidnight: false, color: "#2563eb" },
];

// วันหยุดประจำสัปดาห์เริ่มต้น (0 = อาทิตย์, 1 = จันทร์, ... 6 = เสาร์) — ตั้งค่าเริ่มต้นให้พนักงานใหม่
// แก้ไขวันหยุดของพนักงานแต่ละคนแยกได้ที่หน้าแอดมิน (employee.weeklyDayOff)
export const DEFAULT_WEEKLY_DAYOFF = 0; // อาทิตย์

// ============================================================
//  รายชื่อพนักงานเริ่มต้น (หว่านเมล็ดเข้า Firestore ครั้งแรกที่เปิดหน้าแอดมิน ถ้ายังไม่มีข้อมูล
//  พนักงานเลยในระบบ) — ตรงตามไฟล์รายชื่อพนักงานล่าสุด (รวม 32 คน แยกตามแผนก, อัปเดตล่าสุด 2026-07-20)
//  หลังจากหว่านเมล็ดครั้งแรกแล้ว ให้ไปแก้ไข/เพิ่ม/ลบพนักงานที่หน้าแอดมินแทนการแก้ไฟล์นี้
//  teamLeadOf = หัวหน้าทีมของแผนกนั้น (แสดงป้าย "⭐ หัวหน้าทีม"), companyWideSupervisor = หัวหน้าทีมทุกแผนก
//  ระดับ Admin (แสดงป้าย "🛡️ Supervisor ทุกทีม") — ทั้งสองแบบเป็นแค่ "สัญลักษณ์" บนรายชื่อเดิม ไม่ใช่แผนกแยก
//  extraBiweeklySaturdayOff = กลุ่ม "BKK Office" หยุดวันอาทิตย์ปกติ + เสาร์ที่ 2 และ 4 ของเดือนเพิ่มอีกวัน
//  (ยกเว้น Bass ในแผนก Marketing ที่หยุดแค่วันอาทิตย์อย่างเดียวตามที่ระบุไว้)
// ============================================================
export const EMPLOYEES_SEED = [
  // ผู้บริหาร (2 คน)
  { employeeCode: "MD001", name: "K.Eddie", department: "Management team", shiftId: null, weeklyDayOff: null },
  { employeeCode: "MD002", name: "K.Peggy", department: "Management team", shiftId: null, weeklyDayOff: null },
  // Accounting (2 คน)
  { employeeCode: "EMP001", name: "Prem", department: "Accounting", extraBiweeklySaturdayOff: true },
  { employeeCode: "EMP002", name: "TC Accounting", department: "Accounting" },
  // Marketing (3 คน + 1 ปิดใช้งาน)
  { employeeCode: "EMP003", name: "Nokk", department: "Marketing", companyWideSupervisor: true, extraBiweeklySaturdayOff: true },
  { employeeCode: "EMP004", name: "Treeya", department: "Marketing", companyWideSupervisor: true, active: false },
  { employeeCode: "EMP005", name: "Bass", department: "Marketing" }, // ยกเว้น: หยุดแค่วันอาทิตย์อย่างเดียว
  { employeeCode: "EMP006", name: "PP (Pupae)", department: "Marketing", extraBiweeklySaturdayOff: true },
  // Purchasing (3 คน)
  { employeeCode: "EMP007", name: "Mui", department: "Purchasing", teamLeadOf: "Purchasing" },
  { employeeCode: "EMP008", name: "Ja (จา)", department: "Purchasing" },
  { employeeCode: "EMP009", name: "Tua", department: "Purchasing" },
  // Architect (3 คน)
  { employeeCode: "EMP010", name: "กรีน", department: "Architect", teamLeadOf: "Architect", extraBiweeklySaturdayOff: true },
  { employeeCode: "EMP011", name: "Nay", department: "Architect", extraBiweeklySaturdayOff: true },
  { employeeCode: "EMP012", name: "Off", department: "Architect", extraBiweeklySaturdayOff: true },
  // Build-In (20 คน)
  { employeeCode: "EMP013", name: "Art", department: "Build-In", teamLeadOf: "Build-In" },
  { employeeCode: "EMP014", name: "ขวัญ", department: "Build-In" },
  { employeeCode: "EMP015", name: "Au", department: "Build-In" },
  { employeeCode: "EMP016", name: "Gee (กี่)", department: "Build-In" },
  { employeeCode: "EMP017", name: "Ice", department: "Build-In" },
  { employeeCode: "EMP018", name: "Ing", department: "Build-In" },
  { employeeCode: "EMP019", name: "Jor Air (จอแอ)", department: "Build-In" },
  { employeeCode: "EMP020", name: "Ju", department: "Build-In" },
  { employeeCode: "EMP021", name: "K", department: "Build-In" },
  { employeeCode: "EMP022", name: "Kung", department: "Build-In" },
  { employeeCode: "EMP023", name: "Mon", department: "Build-In" },
  { employeeCode: "EMP024", name: "Ni (หนี่)", department: "Build-In" },
  { employeeCode: "EMP025", name: "Nong", department: "Build-In" },
  { employeeCode: "EMP026", name: "Num (หนุ่ม)", department: "Build-In" },
  { employeeCode: "EMP027", name: "Nurian (หนูเรียน)", department: "Build-In" },
  { employeeCode: "EMP028", name: "Nut", department: "Build-In" },
  { employeeCode: "EMP029", name: "Pao", department: "Build-In" },
  { employeeCode: "EMP030", name: "Prayong", department: "Build-In" },
  { employeeCode: "EMP031", name: "Qi", department: "Build-In" },
  { employeeCode: "EMP032", name: "Yhong (โหย่ง)", department: "Build-In" },
].map((e) => ({
  shiftId: "office_0817",
  weeklyDayOff: DEFAULT_WEEKLY_DAYOFF, // อาทิตย์ (วันหยุดประจำสัปดาห์ปกติของทุกคน)
  teamLeadOf: null,
  companyWideSupervisor: false,
  extraBiweeklySaturdayOff: false, // ค่าเริ่มต้น: ไม่มีวันหยุดเพิ่มพิเศษ — เปิดเฉพาะกลุ่ม "BKK Office" ด้านบน
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
