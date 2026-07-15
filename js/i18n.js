// ============================================================
//  i18n.js — รองรับ 2 ภาษา (ไทย/อังกฤษ) ทั้งฝั่งพนักงาน (index.html) และฝั่งแอดมิน (admin.html)
//
//  หลักการ:
//   - เก็บภาษาที่เลือกไว้ใน localStorage (key "hrLang") ค่าเริ่มต้น = "th"
//   - ข้อความ "คงที่" ใน HTML ใช้ attribute data-i18n="คีย์" (+ data-i18n-placeholder สำหรับ
//     placeholder ของ input) แล้วเรียก applyI18n() ครั้งเดียวตอนโหลดหน้า
//   - ข้อความ "ไดนามิก" ที่ render จาก JS (toast, รายการ, ป้ายสถานะ ฯลฯ) ใช้ bi(th, en) แทรกตรงจุด
//     ที่สร้างข้อความนั้นๆ เลย (bi() จะอ่านภาษาปัจจุบันทุกครั้งที่ถูกเรียก)
//   - ⚠️ ค่าที่ "เก็บลง Firestore จริง" (เช่น department, status, category label) ยังคงเป็นภาษาไทย
//     เสมอ ไม่แปล — bi()/dict ใช้แปล "ข้อความที่แสดงผล" เท่านั้น ไม่แตะค่าที่ใช้จับคู่ข้อมูลเดิม
//   - สลับภาษาแล้ว "รีโหลดหน้าใหม่ทั้งหน้า" (เพื่อให้ทุกส่วนที่ render ไปแล้วอัปเดตภาษาให้ตรงกันหมด
//     ในคราวเดียว ไม่ต้องเขียนระบบ re-render แยกทุกจุด)
// ============================================================

const LANG_KEY = "hrLang";

export function getLang() {
  return localStorage.getItem(LANG_KEY) === "en" ? "en" : "th";
}

export function setLang(lang) {
  const next = lang === "en" ? "en" : "th";
  if (next === getLang()) return;
  localStorage.setItem(LANG_KEY, next);
  location.reload();
}

export function toggleLang() {
  setLang(getLang() === "th" ? "en" : "th");
}

// bi("ข้อความไทย", "English text") -> คืนข้อความตามภาษาปัจจุบัน (ใช้แทรกในโค้ด JS ตรงจุดที่ต้องการ)
export function bi(th, en) {
  return getLang() === "en" ? (en != null && en !== "" ? en : th) : th;
}

// ---------- พจนานุกรมข้อความ "คงที่" ของ UI (คู่กับ data-i18n="คีย์" ใน HTML) ----------
const DICT = {
  // ---- ทั่วไป / ใช้ร่วมกัน ----
  "common.search": ["ค้นหา", "Search"],
  "common.save": ["บันทึก", "Save"],
  "common.cancelEdit": ["ยกเลิกแก้ไข", "Cancel edit"],
  "common.add": ["เพิ่ม", "Add"],
  "common.adminEntryLink": ["สำหรับเจ้าหน้าที่: เข้าสู่ระบบแอดมิน →", "Staff: Go to admin panel →"],
  "common.switchUser": ["เปลี่ยนผู้ใช้งาน", "Switch user"],

  // ---- index.html: หน้าแรก / ลงทะเบียน ----
  "page.employeeTitle": ["ระบบลงเวลาทำงาน (Attendance)", "Attendance System"],
  "reg.fullname": ["ชื่อ-นามสกุล *", "Full name *"],
  "reg.fullnamePh": ["เช่น สมชาย ใจดี", "e.g. John Smith"],
  "reg.nickname": ["ชื่อเล่น *", "Nickname *"],
  "reg.nicknamePh": ["เช่น ชาย", "e.g. John"],
  "reg.dob": ["วันเดือนปีเกิด *", "Date of birth *"],
  "reg.submit": ["✅ ลงทะเบียน", "✅ Register"],
  "app.header": ["⏰ ระบบลงเวลาทำงาน", "⏰ Attendance System"],

  // ---- แท็บฝั่งพนักงาน ----
  "tab.home": ["🏠 หน้าหลัก", "🏠 Home"],
  "tab.history": ["📅 ประวัติ", "📅 History"],
  "tab.leave": ["🌴 การลา", "🌴 Leave"],
  "tab.team": ["👥 ทีมของฉัน", "👥 My Team"],

  // ---- หน้าหลัก (เช็คอิน/เอาท์) ----
  "home.loading": ["⏳ กำลังโหลดข้อมูล...", "⏳ Loading..."],

  // ---- ประวัติ ----
  "history.search": ["ค้นหา", "Search"],

  // ---- การลา ----
  "leave.formTitle": ["📝 ยื่นคำขอลา", "📝 Submit leave request"],
  "leave.type": ["ประเภทการลา *", "Leave type *"],
  "leave.start": ["วันที่เริ่มลา *", "Start date *"],
  "leave.end": ["วันที่สิ้นสุด *", "End date *"],
  "leave.reason": ["เหตุผล", "Reason"],
  "leave.reasonPh": ["ระบุเหตุผลการลา (ถ้ามี)", "Reason (optional)"],
  "leave.submit": ["ส่งคำขอลา", "Submit request"],
  "leave.historyTitle": ["ประวัติการลาของฉัน", "My leave history"],

  // ---- สลับวันหยุด ----
  "swap.formTitle": ["🔄 ขอสลับวันหยุด", "🔄 Request day-off swap"],
  "swap.hint": [
    "ยื่นคำขอสลับวันหยุดกับวันทำงาน แล้วรอแอดมินอนุมัติ เมื่ออนุมัติแล้วระบบจะจัดการวันทำงาน/วันหยุดให้อัตโนมัติ",
    "Submit a request to swap a day off with a working day, then wait for admin approval. Once approved, the system updates your work/off days automatically.",
  ],
  "swap.original": ["วันหยุดเดิม (จะขอมาทำงานแทน) *", "Original day off (to work instead) *"],
  "swap.new": ["วันที่จะขอหยุดแทน *", "New day off instead *"],
  "swap.reason": ["เหตุผล", "Reason"],
  "swap.reasonPh": ["ระบุเหตุผลการขอสลับ (ถ้ามี)", "Reason for the swap (optional)"],
  "swap.submit": ["ส่งคำขอสลับวันหยุด", "Submit swap request"],
  "swap.historyTitle": ["ประวัติคำขอสลับวันหยุดของฉัน", "My swap request history"],

  // ---- ทีมของฉัน ----
  "team.title": ["👥 ทีมของฉัน", "👥 My Team"],

  // ---- admin.html: เข้าสู่ระบบ ----
  "admin.pageTitle": ["ระบบแอดมิน - ระบบลงเวลาทำงาน", "Admin - Attendance System"],
  "admin.selectNameTitle": ["👋 เลือกชื่อของคุณ", "👋 Select your name"],
  "admin.selectNameHint": [
    "ระบบอนุญาตให้เฉพาะแอดมินที่ได้รับอนุมัติเท่านั้นเข้าใช้งานได้ เลือกชื่อแล้วยืนยันด้วยรหัส PIN",
    "Only approved admins may access this panel. Select your name and confirm with your PIN.",
  ],
  "admin.pinTitle": ["🔒 ยืนยันตัวตน", "🔒 Verify identity"],
  "admin.pinBack": ["← กลับ", "← Back"],
  "admin.pinConfirm": ["ยืนยันเข้าใช้งาน", "Confirm"],
  "admin.pinPlaceholder": ["รหัส PIN", "PIN code"],
  "admin.header": ["⏰ แอดมินระบบลงเวลาทำงาน", "⏰ Attendance Admin"],
  "admin.lineConnectMsg": [
    "🔔 เชื่อมต่อ LINE ของคุณ เพื่อรับการแจ้งเตือนอัตโนมัติทุกครั้งที่มีการเช็คอิน/เช็คเอาท์/ยื่นคำขอลา",
    "🔔 Connect your LINE account to get automatic notifications on every check-in/check-out/leave request",
  ],
  "admin.lineConnectBtn": ["เชื่อมต่อเลย", "Connect now"],

  // ---- แท็บฝั่งแอดมิน ----
  "atab.report": ["📊 รายงาน/OT", "📊 Report/OT"],
  "atab.employees": ["👥 พนักงาน", "👥 Employees"],
  "atab.schedule": ["🗓️ กะ/วันหยุด/สลับวันหยุด", "🗓️ Shifts/Holidays/Swaps"],
  "atab.leave": ["🌴 คำขอลา", "🌴 Leave requests"],
  "atab.leavesummary": ["📊 สรุปวันลา", "📊 Leave Summary"],

  // ---- รายงาน ----
  "rep.allDept": ["ทุกแผนก", "All departments"],
  "rep.allEmployees": ["พนักงานทั้งหมด", "All employees"],
  "rep.export": ["📊 ส่งออก Excel", "📊 Export Excel"],
  "rep.sendLine": ["📤 ส่งสรุปวันนี้เข้า LINE", "📤 Send today's summary to LINE"],
  "rep.thDate": ["วันที่", "Date"],
  "rep.thEmployee": ["พนักงาน", "Employee"],
  "rep.thShift": ["กะ", "Shift"],
  "rep.thDayType": ["ประเภทวัน", "Day type"],
  "rep.thInOut": ["เข้า-ออกครั้งแรก/สุดท้าย", "First in / Last out"],
  "rep.thWorkHours": ["ชั่วโมงทำงาน", "Hours worked"],
  "rep.thOT": ["OT", "OT"],
  "rep.thLate": ["มาสาย", "Late"],
  "rep.thPhoto": ["รูปยืนยันตัวตน", "ID photo"],
  "rep.thLocation": ["ตำแหน่ง", "Location"],
  "rep.noLocation": ["ไม่มีข้อมูลตำแหน่ง", "No location data"],

  // ---- พนักงาน ----
  "emp.addTitle": ["➕ เพิ่มพนักงานใหม่", "➕ Add new employee"],
  "emp.code": ["รหัสพนักงาน", "Employee code"],
  "emp.codePh": ["เช่น EMP001", "e.g. EMP001"],
  "emp.name": ["ชื่อ-นามสกุล *", "Full name *"],
  "emp.dept": ["แผนก", "Department"],
  "emp.shift": ["กะการทำงาน *", "Shift *"],
  "emp.dayoff": ["วันหยุดประจำสัปดาห์", "Weekly day off"],
  "emp.teamLeadLabel": [
    'แต่งตั้งเป็นหัวหน้าทีมของแผนกนี้ (จะเห็นแท็บ "ทีมของฉัน" และได้รับแจ้งเตือนเมื่อทีมเช็คอิน/เช็คเอาท์)',
    'Appoint as team lead for this department (will see the "My Team" tab and get notified when the team checks in/out)',
  ],
  "emp.searchPh": ["🔍 ค้นหาพนักงาน...", "🔍 Search employees..."],
  "emp.exportBtn": ["📊 ส่งออกรายชื่อ (Excel)", "📊 Export list (Excel)"],
  "emp.quotaTitle": ["โควต้าวันลาต่อปีของพนักงานคนนี้", "Annual leave quota for this employee"],
  "emp.quotaHint": [
    "ค่าเริ่มต้นดึงมาจากค่าเริ่มต้นบริษัท (ตั้งได้ที่แท็บ \"สรุปวันลา\") — ปรับเฉพาะคนนี้ได้ที่นี่",
    'Defaults from the company setting (see the "Leave Summary" tab) — override for this person here',
  ],
  "day.sun": ["อาทิตย์", "Sunday"],
  "day.mon": ["จันทร์", "Monday"],
  "day.tue": ["อังคาร", "Tuesday"],
  "day.wed": ["พุธ", "Wednesday"],
  "day.thu": ["พฤหัสบดี", "Thursday"],
  "day.fri": ["ศุกร์", "Friday"],
  "day.sat": ["เสาร์", "Saturday"],

  // ---- กะ/วันหยุด/สลับวันหยุด ----
  "sched.shiftTitle": ["🕒 กะการทำงาน", "🕒 Work shifts"],
  "sched.shiftName": ["ชื่อกะ *", "Shift name *"],
  "sched.shiftColor": ["สี", "Color"],
  "sched.shiftStart": ["เวลาเริ่ม *", "Start time *"],
  "sched.shiftEnd": ["เวลาสิ้นสุด *", "End time *"],
  "sched.shiftBreak": ["พักเที่ยง (นาที)", "Break (minutes)"],
  "sched.shiftCrosses": ["กะนี้ข้ามเที่ยงคืน (เช่น กะดึก)", "This shift crosses midnight (e.g. night shift)"],
  "sched.shiftSave": ["บันทึกกะ", "Save shift"],
  "sched.holidayTitle": ["🎌 วันหยุดประจำปีของบริษัท", "🎌 Company annual holidays"],
  "sched.holidayNamePh": ["ชื่อวันหยุด", "Holiday name"],
  "sched.swapTitle": ["🔄 สลับวันหยุด", "🔄 Day-off swap"],
  "sched.swapHint": [
    "เมื่อพนักงานสลับวันหยุด ระบบจะจัดการวันทำงาน/วันหยุดของวันที่เกี่ยวข้องให้อัตโนมัติในการคำนวณ OT และรายงาน",
    "When an employee swaps a day off, the system automatically updates the work/off status of the affected dates for OT calculation and reporting.",
  ],
  "sched.swapEmployee": ["พนักงาน *", "Employee *"],
  "sched.swapOriginal": ["วันหยุดเดิม (จะกลายเป็นวันทำงาน) *", "Original day off (becomes a working day) *"],
  "sched.swapNew": ["วันหยุดใหม่ที่จะใช้แทน (จะกลายเป็นวันหยุด) *", "New day off instead (becomes the day off) *"],
  "sched.swapReason": ["หมายเหตุ", "Note"],
  "sched.swapReasonPh": ["เหตุผลการสลับ (ถ้ามี)", "Reason for swap (optional)"],
  "sched.swapSave": ["บันทึกการสลับวันหยุด", "Save day-off swap"],

  // ---- คำขอลา (แอดมิน) ----
  "aleave.allStatus": ["สถานะทั้งหมด", "All statuses"],
  "aleave.pending": ["รออนุมัติ", "Pending"],
  "aleave.approved": ["อนุมัติแล้ว", "Approved"],
  "aleave.rejected": ["ไม่อนุมัติ", "Rejected"],
  "aleave.quotaWarn": ["เกินโควต้าคงเหลือ", "Exceeds remaining quota"],

  // ---- สรุปวันลา (แอดมิน) ----
  "lq.title": ["⚙️ ตั้งค่าโควต้าวันลาเริ่มต้น (ต่อปี)", "⚙️ Default annual leave quota"],
  "lq.hint": [
    'ค่านี้ใช้เป็นค่าเริ่มต้นเมื่อเพิ่มพนักงานใหม่ หรือกด "ใช้ค่านี้กับพนักงานทุกคน" ด้านล่าง — พนักงานแต่ละคนยังปรับค่าเฉพาะบุคคลแยกได้ที่ฟอร์มแก้ไขพนักงาน (แท็บ "พนักงาน")',
    'Used as the default when adding new employees, or via "Apply to all employees" below — each employee\'s quota can still be overridden individually in the employee edit form (Employees tab)',
  ],
  "lq.sick": ["ลาป่วย (วัน/ปี)", "Sick leave (days/yr)"],
  "lq.personal": ["ลากิจ (วัน/ปี)", "Personal leave (days/yr)"],
  "lq.vacation": ["ลาพักร้อน (วัน/ปี)", "Vacation (days/yr)"],
  "lq.saveDefaults": ["💾 บันทึกค่าเริ่มต้น", "💾 Save defaults"],
  "lq.applyAll": ["📋 ใช้ค่านี้กับพนักงานทุกคน", "📋 Apply to all employees"],
  "lq.tableTitle": ["สรุปการใช้วันลารายบุคคล (ปีนี้)", "Individual leave usage summary (this year)"],
  "lq.colEmployee": ["พนักงาน", "Employee"],
  "lq.colDept": ["แผนก", "Department"],
  "lq.usedOfQuota": ["ใช้ไป / โควต้า", "Used / Quota"],
  "lq.remaining": ["คงเหลือ", "Remaining"],

  // ---- สรุปวันลา (พนักงาน) ----
  "leave.balanceTitle": ["📊 สรุปวันลาปีนี้", "📊 This year's leave balance"],
};

export function t(key) {
  const pair = DICT[key];
  if (!pair) return key;
  return getLang() === "en" ? pair[1] : pair[0];
}

// สแกนและแทนที่ข้อความ "คงที่" ตาม attribute data-i18n / data-i18n-placeholder ในหน้านั้น
export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  if (document.documentElement) document.documentElement.lang = getLang();
}

// ผูกปุ่มสลับภาษา TH/EN เข้ากับ element ตาม id ที่ระบุ
export function initLangToggle(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.textContent = getLang() === "th" ? "EN" : "ไทย";
  btn.title = getLang() === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย";
  btn.addEventListener("click", () => toggleLang());
}

// ---------- แปลค่าที่ "เก็บอยู่ในฐานข้อมูลเป็นภาษาไทยเสมอ" สำหรับแสดงผลเท่านั้น (ไม่แตะค่าจริง) ----------
// key = ค่าไทยที่เก็บจริงใน Firestore, value = คำแปลอังกฤษที่แสดงผล
const DEPARTMENT_EN = {
  "ผู้บริหาร": "Management",
  "Accounting": "Accounting",
  "Architect": "Architect",
  "Build-In": "Build-In",
  "Marketing": "Marketing",
  "Purchasing": "Purchasing",
  "Supervisor all team": "Supervisor all team",
};
export function deptBi(deptTh) {
  if (!deptTh) return deptTh;
  return bi(deptTh, DEPARTMENT_EN[deptTh] || deptTh);
}

const LEAVE_STATUS_EN = {
  "รออนุมัติ": "Pending",
  "อนุมัติแล้ว": "Approved",
  "ไม่อนุมัติ": "Rejected",
};
export function statusBi(statusTh) {
  if (!statusTh) return statusTh;
  return bi(statusTh, LEAVE_STATUS_EN[statusTh] || statusTh);
}

const LEAVE_TYPE_EN = {
  "ลาป่วย": "Sick leave",
  "ลากิจ": "Personal leave",
  "ลาพักร้อน": "Vacation",
  "ลาคลอด": "Maternity leave",
  "ลาไม่รับค่าจ้าง": "Unpaid leave",
  "อื่นๆ": "Other",
};
export function leaveTypeBi(labelTh) {
  if (!labelTh) return labelTh;
  return bi(labelTh, LEAVE_TYPE_EN[labelTh] || labelTh);
}

const SHIFT_NAME_EN = {
  "กะเช้า": "Morning shift",
  "กะบ่าย": "Afternoon shift",
  "กะดึก": "Night shift",
  "กะออฟฟิศ": "Office shift",
};
export function shiftNameBi(nameTh) {
  if (!nameTh) return nameTh;
  return bi(nameTh, SHIFT_NAME_EN[nameTh] || nameTh);
}

const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function weekdayBi(index) {
  return bi(["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"][index] || "", WEEKDAY_EN[index] || "");
}
