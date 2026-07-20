// admin.js — แดชบอร์ดแอดมิน: รายงาน/OT, จัดการพนักงาน, กะ/วันหยุด/สลับวันหยุด, อนุมัติการลา, โควต้าวันลา
import {
  ADMINS,
  COMPANY,
  DEPARTMENTS,
  DEPARTMENT_COLORS,
  SHIFTS,
  OT_RULES,
  LEAVE_STATUS,
  SWAP_STATUS,
  LIFF_ID_ADMIN,
  QUOTA_LEAVE_TYPE_IDS,
  DEFAULT_LEAVE_QUOTA,
} from "./config.js";
import { ensureAllDefaults } from "./seed.js";
import {
  db,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "./firebase-init.js";
import {
  EMPLOYEES_COLLECTION,
  ATTENDANCE_COLLECTION,
  LEAVE_COLLECTION,
  SWAPS_COLLECTION,
  HOLIDAYS_COLLECTION,
  SHIFTS_COLLECTION,
  ADMIN_LINKS_COLLECTION,
  SETTINGS_COLLECTION,
} from "./firebase-init.js";
import {
  showToast,
  formatDateThai,
  formatTimeShort,
  minutesToHM,
  getShiftById,
  renderCompanyBrandBar,
  saveMyAdmin,
  getMyAdmin,
  clearMyAdmin,
  showPhotoLightbox,
  ensureLiffLoaded,
} from "./utils.js";
import { summarizeDay } from "./ot-calc.js";
import { getDayFlags, getDayLabel, classifyDay } from "./schedule.js";
import { bi, applyI18n, initLangToggle, deptBi, statusBi, shiftNameBi, weekdayBi, leaveTypeBi } from "./i18n.js";
import { notifyLeaveReviewed, sendAdminOwnLinePush } from "./notify.js";
import { resolveEmployeeQuota, computeBalance, checkQuotaImpact, currentYear } from "./leave-balance.js";

renderCompanyBrandBar("brand-bar", COMPANY);
applyI18n();
initLangToggle("lang-toggle-btn");

let admin = null;
let employees = [];
let shifts = [];
let holidays = [];
let swaps = [];
let leaves = [];
let lastReportRows = [];
let leaveQuotaDefaults = DEFAULT_LEAVE_QUOTA; // ค่าเริ่มต้นโควต้าวันลาของบริษัท (โหลดจาก appSettings/leaveQuotaDefaults)

// ============================================================
//  IDENTITY — จำกัดสิทธิ์เฉพาะแอดมินที่อนุมัติ (ตามรายชื่อ+PIN ใน ADMINS) ดูคำเตือน
//  ความปลอดภัยใน README.md (PIN เป็นเพียงชั้นป้องกันเบื้องต้น ไม่ใช่ระบบล็อกอินที่ปลอดภัยเต็มรูปแบบ)
// ============================================================
let pendingAdmin = null; // ผู้ที่เลือกชื่อไว้ รอกรอก PIN ยืนยัน

function renderAdminGrid() {
  showIdentityStep("select");
  const grid = document.getElementById("admin-id-grid");
  grid.innerHTML = ADMINS.map(
    (a) => `<div class="admin-chip" data-id="${a.id}">${escapeHtml(a.name)}</div>`
  ).join("");
  grid.querySelectorAll(".admin-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const a = ADMINS.find((x) => x.id === chip.dataset.id);
      if (!a) return;
      pendingAdmin = a;
      document.getElementById("admin-pin-name").textContent = a.name;
      document.getElementById("admin-pin-input").value = "";
      showIdentityStep("pin");
      document.getElementById("admin-pin-input").focus();
    });
  });
}

function showIdentityStep(step) {
  document.getElementById("admin-step-select").style.display = step === "select" ? "block" : "none";
  document.getElementById("admin-step-pin").style.display = step === "pin" ? "block" : "none";
}

function confirmPin() {
  if (!pendingAdmin) return;
  const enteredPin = document.getElementById("admin-pin-input").value.trim();
  if (!enteredPin || enteredPin !== pendingAdmin.pin) {
    showToast(bi("❌ รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่", "❌ Incorrect PIN, please try again"));
    document.getElementById("admin-pin-input").value = "";
    document.getElementById("admin-pin-input").focus();
    return;
  }
  saveMyAdmin(pendingAdmin);
  enterDashboard(pendingAdmin);
}

document.getElementById("admin-pin-confirm-btn").addEventListener("click", confirmPin);
document.getElementById("admin-pin-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmPin();
});
document.getElementById("admin-pin-back-btn").addEventListener("click", () => {
  pendingAdmin = null;
  showIdentityStep("select");
});

function enterDashboard(a) {
  admin = a;
  document.getElementById("identity-screen").style.display = "none";
  document.getElementById("dashboard").style.display = "block";
  document.getElementById("admin-whoami").textContent = bi(`เข้าสู่ระบบในฐานะ: ${a.name}`, `Logged in as: ${a.name}`);
  boot();
  maybeLinkAdminLine(a);
}

document.getElementById("switch-user-btn").addEventListener("click", () => {
  clearMyAdmin();
  location.reload();
});

const savedAdmin = getMyAdmin();
const matchedSavedAdmin = savedAdmin && ADMINS.find((a) => a.id === savedAdmin.id && a.pin === savedAdmin.pin);
if (matchedSavedAdmin) {
  enterDashboard(matchedSavedAdmin);
} else {
  renderAdminGrid();
}

// ============================================================
//  LINE LIFF (ฝั่งแอดมิน) — ใช้เฉพาะเพื่อส่ง "สรุปประจำวัน" เข้าแชท LINE ของแอดมินเอง
//  ด้วยปุ่มกดเอง (liff.sendMessages) ไม่มีเซิร์ฟเวอร์กลาง ไม่มีค่าใช้จ่ายเพิ่ม
//  ถ้าไม่ได้ตั้งค่า LIFF_ID_ADMIN ไว้ใน config.js จะข้ามส่วนนี้ทั้งหมด (ปุ่มจะแจ้งเตือนว่าใช้ไม่ได้)
// ============================================================
let adminLiffReady = false;

async function initAdminLiff() {
  if (!LIFF_ID_ADMIN) return;
  const loaded = await ensureLiffLoaded();
  if (!loaded) {
    console.warn("โหลด LIFF SDK ไม่สำเร็จตอนเปิดหน้าแอดมิน (จะลองใหม่อีกครั้งตอนกดปุ่มส่งสรุปเข้า LINE)");
    return;
  }
  try {
    await liff.init({ liffId: LIFF_ID_ADMIN });
    adminLiffReady = true;
  } catch (e) {
    console.warn("Admin LIFF init failed:", e);
  }
}
initAdminLiff();

// เช็ค/เตรียม LIFF ให้พร้อมอีกครั้งตอนกดปุ่มจริงๆ เผื่อครั้งแรกตอนโหลดหน้าเว็บล้มเหลว (เช่น เน็ตมือถือ
// หลุด/ช้าตอนนั้นพอดี) — กันไม่ให้ผู้ใช้เจอข้อความ "ยังไม่ได้ตั้งค่า LIFF" ทั้งที่ตั้งค่าไว้ถูกต้องแล้ว
async function ensureAdminLiffReady() {
  if (adminLiffReady) return true;
  const loaded = await ensureLiffLoaded();
  if (!loaded) return false;
  try {
    await liff.init({ liffId: LIFF_ID_ADMIN });
    adminLiffReady = true;
    return true;
  } catch (e) {
    console.warn("Admin LIFF init failed (ลองใหม่):", e);
    return false;
  }
}

// ============================================================
//  ผูกบัญชี LINE ของแอดมิน — เพื่อให้ระบบแจ้งเตือน (เช็คอิน/เอาท์/คำขอลา) ยิงเข้า LINE ของแอดมินคนนี้
//  ได้โดยตรง (ดู js/notify.js + netlify/functions/line-push.js) บันทึกไว้ที่ collection "adminLineLinks"
//  คนละส่วนกับ ADMINS (ที่ใช้แค่ชื่อ+PIN ยืนยันตัวตนเข้าหน้าแอดมิน ไม่เกี่ยวกับบัญชี LINE)
// ============================================================
function lineLinkFlagKey(adminId) {
  return `hrAdminLineLinked_${adminId}`;
}

async function maybeLinkAdminLine(a) {
  if (localStorage.getItem(lineLinkFlagKey(a.id)) === "1") {
    updateLineConnectBar(true);
    return;
  }
  const ready = await ensureAdminLiffReady();
  if (ready && typeof liff !== "undefined" && liff.isLoggedIn && liff.isLoggedIn()) {
    // เปิดจากในแอป LINE (หรือเคยล็อกอิน LIFF ค้างไว้แล้ว) -> ผูกบัญชีให้อัตโนมัติทันทีโดยไม่ต้องกดอะไรเพิ่ม
    await linkAdminLineNow(a);
  } else {
    updateLineConnectBar(false);
  }
}

async function linkAdminLineNow(a) {
  try {
    const profile = await liff.getProfile();
    await setDoc(doc(db, ADMIN_LINKS_COLLECTION, a.id), {
      adminId: a.id,
      name: a.name,
      lineUserId: profile.userId,
      lineDisplayName: profile.displayName || "",
      updatedAt: serverTimestamp(),
    });
    localStorage.setItem(lineLinkFlagKey(a.id), "1");
    updateLineConnectBar(true);
    showToast(bi(`🔔 เชื่อมต่อ LINE สำเร็จ คุณ${a.name} จะได้รับแจ้งเตือนอัตโนมัติแล้ว`, `🔔 LINE connected successfully. ${a.name} will now receive automatic notifications`));
  } catch (e) {
    console.warn("เชื่อมต่อ LINE ของแอดมินไม่สำเร็จ", e);
    updateLineConnectBar(false);
  }
}

function updateLineConnectBar(linked) {
  const bar = document.getElementById("admin-line-connect-bar");
  if (bar) bar.style.display = linked ? "none" : "flex";
}

document.getElementById("admin-line-connect-btn")?.addEventListener("click", async () => {
  if (!admin) return;
  const ready = await ensureAdminLiffReady();
  if (!ready) {
    showToast(bi("❌ โหลดระบบ LINE ไม่สำเร็จ กรุณาลองใหม่ หรือตรวจสอบอินเทอร์เน็ต", "❌ Failed to load LINE, please try again or check your internet connection"));
    return;
  }
  if (typeof liff !== "undefined" && liff.isLoggedIn && liff.isLoggedIn()) {
    await linkAdminLineNow(admin);
    return;
  }
  // ยังไม่ได้ล็อกอิน LINE ในเบราว์เซอร์นี้ -> พาไปล็อกอินก่อน (ใช้ได้ทั้งในแอป LINE และเบราว์เซอร์ทั่วไป)
  // จะพากลับมาที่หน้านี้เหมือนเดิมหลังล็อกอินสำเร็จ (ต้องเลือกชื่อ+PIN ใหม่อีกครั้งหลังกลับมา)
  liff.login({ redirectUri: window.location.href });
});

// ============================================================
//  สลับแท็บ
// ============================================================
document.querySelectorAll(".tabs .tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs .tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.atab;
    ["report", "employees", "schedule", "leave", "leavesummary"].forEach((t) => {
      document.getElementById(`atab-${t}`).style.display = t === tab ? "block" : "none";
    });
    if (tab === "leavesummary") renderLeaveSummaryTable();
  });
});

// ============================================================
//  BOOT: โหลดข้อมูลอ้างอิงทั้งหมด + สร้างค่าเริ่มต้นถ้ายังไม่มี
// ============================================================
async function boot() {
  await ensureAllDefaults();
  await Promise.all([loadEmployees(), loadShifts(), loadHolidays(), loadSwaps(), loadLeaves(), loadLeaveQuotaDefaults()]);

  fillDeptSelect();
  fillReportDeptSelect();
  fillShiftSelects();
  fillEmployeeFilterSelects();
  renderEmployeeList();
  renderShiftList();
  renderHolidayList();
  renderSwapList();
  renderLeaveList();
  fillLeaveQuotaDefaultInputs();
  resetEmployeeForm(); // เติมค่าเริ่มต้นโควต้าวันลาลงในฟอร์ม "เพิ่มพนักงานใหม่" (ต้องรอ loadLeaveQuotaDefaults ก่อน)
  setupReportDefaults();
  await runReport();

  document.getElementById("emp-form").addEventListener("submit", onSaveEmployee);
  document.getElementById("emp-cancel-edit-btn").addEventListener("click", resetEmployeeForm);
  document.getElementById("emp-list-search").addEventListener("input", renderEmployeeList);
  document.getElementById("emp-view-active-btn").addEventListener("click", () => setEmployeeListView("active"));
  document.getElementById("emp-view-deleted-btn").addEventListener("click", () => setEmployeeListView("deleted"));
  document.getElementById("emp-view-dup-btn").addEventListener("click", () => setEmployeeListView("dup"));
  document.getElementById("emp-export-btn").addEventListener("click", exportEmployeesExcel);
  document.getElementById("lq-save-defaults-btn").addEventListener("click", onSaveLeaveQuotaDefaults);
  document.getElementById("lq-apply-all-btn").addEventListener("click", onApplyLeaveQuotaDefaultsToAll);

  document.getElementById("shift-form").addEventListener("submit", onSaveShift);
  document.getElementById("shift-cancel-edit-btn").addEventListener("click", resetShiftForm);

  document.getElementById("holiday-form").addEventListener("submit", onAddHoliday);

  document.getElementById("swap-form").addEventListener("submit", onAddSwap);

  document.getElementById("rep-search-btn").addEventListener("click", runReport);
  document.getElementById("rep-dept").addEventListener("change", () => {
    refreshReportEmployeeFilterByDept();
    runReport();
  });
  document.getElementById("rep-export-btn").addEventListener("click", exportReportExcel);
  document.getElementById("rep-send-line-btn").addEventListener("click", sendDailySummaryToLine);

  document.getElementById("leave-filter-status").addEventListener("change", renderLeaveList);
}

async function loadEmployees() {
  const snap = await getDocs(collection(db, EMPLOYEES_COLLECTION));
  employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  employees.sort((a, b) => (a.name || "").localeCompare(b.name || "", "th"));
}
async function loadShifts() {
  const snap = await getDocs(collection(db, SHIFTS_COLLECTION));
  shifts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!shifts.length) shifts = SHIFTS;
}
async function loadHolidays() {
  const snap = await getDocs(collection(db, HOLIDAYS_COLLECTION));
  holidays = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  holidays.sort((a, b) => (a.date < b.date ? -1 : 1));
}
async function loadSwaps() {
  const snap = await getDocs(collection(db, SWAPS_COLLECTION));
  swaps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  swaps.sort((a, b) => (a.originalDate < b.originalDate ? 1 : -1));
}
async function loadLeaves() {
  const snap = await getDocs(collection(db, LEAVE_COLLECTION));
  leaves = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  leaves.sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
}
async function loadLeaveQuotaDefaults() {
  try {
    const snap = await getDoc(doc(db, SETTINGS_COLLECTION, "leaveQuotaDefaults"));
    leaveQuotaDefaults = snap.exists() ? { ...DEFAULT_LEAVE_QUOTA, ...snap.data() } : DEFAULT_LEAVE_QUOTA;
  } catch (e) {
    console.warn("โหลดค่าเริ่มต้นโควต้าวันลาไม่สำเร็จ ใช้ค่า default ในโค้ดแทน", e);
    leaveQuotaDefaults = DEFAULT_LEAVE_QUOTA;
  }
}

function fillDeptSelect() {
  const opts = DEPARTMENTS.map((d) => `<option value="${d}">${deptBi(d)}</option>`).join("");
  document.getElementById("emp-dept").innerHTML = `<option value="">${bi("ยังไม่ระบุแผนก", "No department")}</option>${opts}`;
}
function fillReportDeptSelect() {
  const opts = DEPARTMENTS.map((d) => `<option value="${d}">${deptBi(d)}</option>`).join("");
  document.getElementById("rep-dept").innerHTML = `<option value="">${bi("ทุกแผนก", "All departments")}</option>${opts}`;
}
function fillShiftSelects() {
  const opts = shifts.map((s) => `<option value="${s.id}">${shiftNameBi(s.name)} (${s.start}-${s.end})</option>`).join("");
  document.getElementById("emp-shift").innerHTML = opts;
}
function fillEmployeeFilterSelects() {
  const opts = employees.map((e) => `<option value="${e.id}">${e.name}</option>`).join("");
  document.getElementById("rep-employee").innerHTML = `<option value="">${bi("พนักงานทั้งหมด", "All employees")}</option>${opts}`;
  document.getElementById("swap-employee").innerHTML = opts;
}
// เมื่อเลือกแผนกในตัวกรองรายงาน จำกัดตัวเลือก "พนักงาน" ให้เหลือเฉพาะคนในแผนกนั้น เพื่อความสะดวก
function refreshReportEmployeeFilterByDept() {
  const deptFilter = document.getElementById("rep-dept").value;
  const list = deptFilter ? employees.filter((e) => e.department === deptFilter) : employees;
  const opts = list.map((e) => `<option value="${e.id}">${e.name}</option>`).join("");
  const empSelect = document.getElementById("rep-employee");
  const prevValue = empSelect.value;
  empSelect.innerHTML = `<option value="">${bi("พนักงานทั้งหมด", "All employees")}</option>${opts}`;
  if (list.some((e) => e.id === prevValue)) empSelect.value = prevValue;
}

// ============================================================
//  แท็บ: พนักงาน
// ============================================================
async function onSaveEmployee(e) {
  e.preventDefault();
  const editId = document.getElementById("emp-edit-id").value;
  const isTeamLead = document.getElementById("emp-team-lead").checked;
  const data = {
    employeeCode: document.getElementById("emp-code").value.trim(),
    name: document.getElementById("emp-name").value.trim(),
    department: document.getElementById("emp-dept").value,
    shiftId: document.getElementById("emp-shift").value,
    weeklyDayOff: Number(document.getElementById("emp-dayoff").value),
    teamLeadOf: isTeamLead ? document.getElementById("emp-dept").value : null,
    leaveQuota: readLeaveQuotaFormFields(),
    active: true,
    updatedBy: admin.name,
    updatedAt: serverTimestamp(),
  };
  if (!data.name || !data.shiftId) {
    showToast(bi("กรุณากรอกชื่อและเลือกกะการทำงาน", "Please enter a name and select a shift"));
    return;
  }
  if (isTeamLead && !data.department) {
    showToast(bi("กรุณาเลือกแผนกก่อน จึงจะแต่งตั้งเป็นหัวหน้าทีมได้", "Please select a department first before appointing a team lead"));
    return;
  }
  try {
    if (editId) {
      await updateDoc(doc(db, EMPLOYEES_COLLECTION, editId), data);
      showToast(bi("✅ แก้ไขข้อมูลพนักงานสำเร็จ", "✅ Employee updated successfully"));
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, EMPLOYEES_COLLECTION), data);
      showToast(bi("✅ เพิ่มพนักงานสำเร็จ", "✅ Employee added successfully"));
    }
    resetEmployeeForm();
    await loadEmployees();
    fillEmployeeFilterSelects();
    renderEmployeeList();
  } catch (err) {
    console.error(err);
    showToast(bi("❌ บันทึกไม่สำเร็จ กรุณาลองใหม่", "❌ Failed to save, please try again"));
  }
}

function resetEmployeeForm() {
  document.getElementById("emp-form").reset();
  document.getElementById("emp-edit-id").value = "";
  document.getElementById("emp-team-lead").checked = false;
  document.getElementById("emp-form-title").textContent = bi("➕ เพิ่มพนักงานใหม่", "➕ Add new employee");
  document.getElementById("emp-cancel-edit-btn").style.display = "none";
  // เติมโควต้าวันลาเริ่มต้น = ค่าเริ่มต้นของบริษัท (แอดมินปรับเฉพาะคนนี้ได้ก่อนกดบันทึก)
  setLeaveQuotaFormFields(DEFAULT_LEAVE_QUOTA && leaveQuotaDefaults ? leaveQuotaDefaults : DEFAULT_LEAVE_QUOTA);
}

// อ่านค่าจาก 3 ช่องโควต้าวันลาในฟอร์มพนักงาน -> object {sick, personal, vacation}
// ถ้าช่องไหนว่าง/ไม่ใช่ตัวเลข ใช้ค่าเริ่มต้นของบริษัทแทน (กันข้อมูลเพี้ยนจากช่องว่าง)
function readLeaveQuotaFormFields() {
  const result = {};
  QUOTA_LEAVE_TYPE_IDS.forEach((typeId) => {
    const el = document.getElementById(`emp-quota-${typeId}`);
    const v = el ? Number(el.value) : NaN;
    result[typeId] = Number.isFinite(v) && v >= 0 ? v : leaveQuotaDefaults[typeId] ?? DEFAULT_LEAVE_QUOTA[typeId] ?? 0;
  });
  return result;
}

function setLeaveQuotaFormFields(quota) {
  QUOTA_LEAVE_TYPE_IDS.forEach((typeId) => {
    const el = document.getElementById(`emp-quota-${typeId}`);
    if (el) el.value = quota && quota[typeId] != null ? quota[typeId] : DEFAULT_LEAVE_QUOTA[typeId] ?? 0;
  });
}

// สีประจำแผนก — ใช้สีที่กำหนดไว้ใน config.js ถ้ามี ถ้าไม่มี (แผนกใหม่ที่เพิ่งเพิ่ม) จะสุ่มสีให้คงที่
// จากชื่อแผนกเอง (hash ง่ายๆ) เพื่อให้พนักงานแผนกเดียวกันเห็นสีเดียวกันเสมอ ไม่เปลี่ยนไปมาทุกครั้งที่โหลดหน้า
const FALLBACK_DEPT_PALETTE = ["#0ea5e9", "#f59e0b", "#8b5cf6", "#10b981", "#ec4899", "#ef4444", "#6366f1", "#14b8a6"];
function getDepartmentColor(dept) {
  if (!dept) return "#94a3b8";
  if (DEPARTMENT_COLORS[dept]) return DEPARTMENT_COLORS[dept];
  let hash = 0;
  for (let i = 0; i < dept.length; i++) hash = (hash * 31 + dept.charCodeAt(i)) >>> 0;
  return FALLBACK_DEPT_PALETTE[hash % FALLBACK_DEPT_PALETTE.length];
}

// มุมมองรายชื่อพนักงาน 3 แบบ: "active" (ใช้งานอยู่ - ค่าเริ่มต้น), "deleted" (ถูกลบ/ปิดใช้งาน แยกหน้าต่างหาก
// ตามที่ขอ), "dup" (แสดงเฉพาะชื่อซ้ำ เพื่อช่วยไล่เคลียร์ข้อมูลซ้ำที่มีอยู่แล้ว)
let employeeListView = "active";
function setEmployeeListView(view) {
  employeeListView = view;
  ["active", "deleted", "dup"].forEach((v) => {
    const btn = document.getElementById(`emp-view-${v}-btn`);
    if (!btn) return;
    btn.classList.toggle("btn-primary", v === view);
    btn.classList.toggle("btn-outline", v !== view);
  });
  renderEmployeeList();
}

function renderEmployeeRowHtml(emp, nameCounts) {
  const shift = getShiftById(shifts, emp.shiftId);
  const regBadge = emp.lineUserId
    ? `<span class="badge" style="background:#d1fae5;color:#047857;">🟢 ${bi("ลงทะเบียนแล้ว (LINE)", "Registered (LINE)")}</span>`
    : emp.claimedByDevice
    ? `<span class="badge" style="background:#dbeafe;color:#1d4ed8;">🔵 ${bi("ลงทะเบียนแล้ว (อุปกรณ์)", "Registered (device)")}</span>`
    : `<span class="badge" style="background:#f1f5f9;color:#94a3b8;">⚪ ${bi("ยังไม่ได้ลงทะเบียน", "Not registered yet")}</span>`;
  const isRegistered = !!(emp.lineUserId || emp.claimedByDevice);
  const deptColor = getDepartmentColor(emp.department);
  const deptChip = emp.department
    ? `<span class="shift-chip" style="background:${deptColor}22; color:${deptColor};"><span class="dot" style="background:${deptColor};"></span>${deptBi(emp.department)}</span>`
    : `<span class="shift-chip" style="background:#94a3b822; color:#94a3b8;">${bi("ยังไม่ระบุแผนก", "No department")}</span>`;
  const nameKey = (emp.name || "").trim().toLowerCase();
  const isDup = emp.active !== false && nameKey && nameCounts[nameKey] > 1;
  const dupBadge = isDup
    ? `<span class="badge" style="background:#fef3c7;color:#b45309;" title="${bi(
        "มีพนักงานคนอื่นใช้ชื่อนี้ซ้ำกัน — ตรวจสอบว่าเป็นคนละคนจริงหรือลงทะเบียนซ้ำโดยไม่ตั้งใจ",
        "Another active employee shares this exact name — check whether this is a real duplicate registration"
      )}">⚠️ ${bi("ชื่อซ้ำ", "Duplicate name")} ×${nameCounts[nameKey]}</span>`
    : "";

  return `
    <div class="emp-row" style="border-left:4px solid ${deptColor}; padding-left:10px;">
      <div>
        <div class="emp-name">
          ${escapeHtml(emp.name)}
          ${emp.active === false ? `<span class="badge" style="background:#fee2e2;color:#ef4444;">${bi("ปิดใช้งาน/ลบแล้ว", "Disabled/Deleted")}</span>` : ""}
          ${emp.teamLeadOf ? `<span class="badge" style="background:#fef3c7;color:#b45309;">⭐ ${bi("หัวหน้าทีม", "Team lead")}</span>` : ""}
          ${dupBadge}
          ${regBadge}
        </div>
        <div class="emp-meta">
          ${emp.employeeCode || "-"} • ${deptChip} •
          ${shift ? `<span class="shift-chip" style="background:${shift.color}22; color:${shift.color};"><span class="dot" style="background:${shift.color};"></span>${shiftNameBi(shift.name)}</span>` : bi("ไม่มีกะ", "No shift")}
          • ${bi("หยุด", "Off")}${weekdayBi(emp.weeklyDayOff ?? 0)}
          ${emp.lineUserId ? ` • LINE: ${escapeHtml(emp.lineDisplayName || "-")}` : ""}
        </div>
        ${
          emp.fullName || emp.dob
            ? `<div class="emp-meta">${emp.fullName ? `${bi("ชื่อจริง", "Full name")}: ${escapeHtml(emp.fullName)}` : ""}${emp.dob ? ` • ${bi("เกิด", "DOB")}: ${formatDateThai(emp.dob)}` : ""}</div>`
            : ""
        }
      </div>
      <div class="emp-actions">
        <button class="btn btn-outline btn-sm" data-edit="${emp.id}">${bi("แก้ไข", "Edit")}</button>
        ${isRegistered ? `<button class="btn btn-outline btn-sm" data-reset-reg="${emp.id}">${bi("ยกเลิกการลงทะเบียน", "Unregister")}</button>` : ""}
        <button class="btn ${emp.active === false ? "btn-success" : "btn-danger"} btn-sm" data-toggle="${emp.id}" title="${bi("ประวัติการลงเวลา/ลาเดิมจะยังถูกเก็บไว้ ไม่ได้ลบถาวร กู้คืนภายหลังได้", "Old attendance/leave history is kept — not a permanent delete, can be restored later")}">
          ${emp.active === false ? bi("↩️ กู้คืนพนักงาน", "↩️ Restore employee") : bi("🗑️ ลบพนักงาน", "🗑️ Delete employee")}
        </button>
      </div>
    </div>`;
}

// จัดกลุ่มพนักงานตามแผนก (เรียงตามลำดับใน DEPARTMENTS ก่อน แล้วตามด้วยแผนกอื่นๆ ที่ไม่อยู่ในลิสต์ ถ้ามี)
// ภายในแต่ละแผนกเรียงตาม "รหัสพนักงาน" (employeeCode) เพื่อให้ดูเข้าใจง่าย ตามที่ขอ
function groupByDepartment(list) {
  const deptOrder = [...DEPARTMENTS];
  list.forEach((e) => {
    if (e.department && !deptOrder.includes(e.department)) deptOrder.push(e.department);
  });
  if (list.some((e) => !e.department)) deptOrder.push("");
  return deptOrder
    .map((dept) => ({
      dept,
      list: list
        .filter((e) => (e.department || "") === dept)
        .sort((a, b) => (a.employeeCode || "").localeCompare(b.employeeCode || "", "th", { numeric: true }) || (a.name || "").localeCompare(b.name || "", "th")),
    }))
    .filter((g) => g.list.length > 0);
}

function renderEmployeeList() {
  const q = (document.getElementById("emp-list-search").value || "").trim().toLowerCase();

  // นับจำนวนพนักงานที่ใช้งานอยู่ (ไม่ปิดใช้งาน) ที่มีชื่อซ้ำกัน — ใช้เตือนแอดมินว่ามีรายชื่อซ้ำในระบบ
  const nameCounts = {};
  employees
    .filter((e) => e.active !== false)
    .forEach((e) => {
      const key = (e.name || "").trim().toLowerCase();
      if (key) nameCounts[key] = (nameCounts[key] || 0) + 1;
    });

  const list = employees
    .filter((e) => !q || (e.name || "").toLowerCase().includes(q) || (e.employeeCode || "").toLowerCase().includes(q))
    .filter((e) => (employeeListView === "deleted" ? e.active === false : e.active !== false))
    .filter((e) => employeeListView !== "dup" || nameCounts[(e.name || "").trim().toLowerCase()] > 1);

  const container = document.getElementById("employee-list");
  if (!list.length) {
    const emptyMsg =
      employeeListView === "dup"
        ? { emoji: "🎉", text: bi("ไม่พบรายชื่อซ้ำในระบบแล้ว", "No duplicate names found") }
        : employeeListView === "deleted"
        ? { emoji: "🗑️", text: bi("ยังไม่มีพนักงานที่ถูกลบ", "No deleted employees yet") }
        : { emoji: "👥", text: bi("ไม่พบพนักงาน", "No employees found") };
    container.innerHTML = `<div class="empty-state"><span class="emoji">${emptyMsg.emoji}</span>${emptyMsg.text}</div>`;
    return;
  }

  const groups = groupByDepartment(list);
  container.innerHTML = groups
    .map((g) => {
      const deptColor = getDepartmentColor(g.dept);
      const deptLabel = g.dept ? deptBi(g.dept) : bi("ยังไม่ระบุแผนก", "No department");
      return `
        <div class="dept-group-header" style="border-left:4px solid ${deptColor};">
          <span class="dot" style="background:${deptColor};"></span>${deptLabel}
          <span class="dept-group-count">${g.list.length} ${bi("คน", "people")}</span>
        </div>
        ${g.list.map((emp) => renderEmployeeRowHtml(emp, nameCounts)).join("")}
      `;
    })
    .join("");

  container.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => startEditEmployee(btn.dataset.edit));
  });
  container.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => toggleEmployeeActive(btn.dataset.toggle));
  });
  container.querySelectorAll("[data-reset-reg]").forEach((btn) => {
    btn.addEventListener("click", () => resetEmployeeRegistration(btn.dataset.resetReg));
  });
}

// ยกเลิกการลงทะเบียน (ไม่ว่าจะลงทะเบียนผ่าน LINE หรือผูกกับอุปกรณ์ก็ตาม) — ใช้กรณีพนักงาน
// เลือกชื่อผิดตอนลงทะเบียนครั้งแรก ทำให้ชื่อนั้นไม่มีใครเลือกได้อีกจนกว่าแอดมินจะปลดล็อคให้แบบนี้
async function resetEmployeeRegistration(id) {
  const emp = employees.find((e) => e.id === id);
  if (!emp) return;
  if (
    !confirm(
      bi(
        `ยกเลิกการลงทะเบียนของ "${emp.name}" ใช่หรือไม่? พนักงานคนนี้ (หรือคนที่จะใช้ชื่อนี้จริงๆ) จะต้องลงทะเบียนเลือกชื่อใหม่ในการใช้งานครั้งถัดไป`,
        `Unregister "${emp.name}"? This employee (or whoever actually uses this name) will need to register and select their name again next time`
      )
    )
  )
    return;
  try {
    await updateDoc(doc(db, EMPLOYEES_COLLECTION, id), {
      lineUserId: null,
      lineDisplayName: null,
      linePictureUrl: null,
      claimedByDevice: null,
      updatedBy: admin.name,
      updatedAt: serverTimestamp(),
    });
    await loadEmployees();
    renderEmployeeList();
    showToast(bi("✅ ยกเลิกการลงทะเบียนแล้ว", "✅ Unregistered successfully"));
  } catch (e) {
    console.error(e);
    showToast(bi("❌ ดำเนินการไม่สำเร็จ", "❌ Action failed"));
  }
}

function startEditEmployee(id) {
  const emp = employees.find((e) => e.id === id);
  if (!emp) return;
  document.getElementById("emp-edit-id").value = emp.id;
  document.getElementById("emp-code").value = emp.employeeCode || "";
  document.getElementById("emp-name").value = emp.name || "";
  document.getElementById("emp-dept").value = emp.department || "";
  document.getElementById("emp-shift").value = emp.shiftId || "";
  document.getElementById("emp-dayoff").value = String(emp.weeklyDayOff ?? 0);
  document.getElementById("emp-team-lead").checked = !!(emp.teamLeadOf && emp.teamLeadOf === emp.department);
  setLeaveQuotaFormFields(resolveEmployeeQuota(emp, leaveQuotaDefaults));
  document.getElementById("emp-form-title").textContent = bi(`✏️ แก้ไขพนักงาน: ${emp.name}`, `✏️ Edit employee: ${emp.name}`);
  document.getElementById("emp-cancel-edit-btn").style.display = "inline-flex";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function toggleEmployeeActive(id) {
  const emp = employees.find((e) => e.id === id);
  if (!emp) return;
  // ยืนยันก่อน "ลบ" (ปิดใช้งาน) ทุกครั้ง กันกดพลาด — ไม่ต้องยืนยันตอนกด "กู้คืน" กลับมา
  if (
    emp.active !== false &&
    !confirm(
      bi(
        `ลบพนักงาน "${emp.name}" ออกจากรายชื่อที่ใช้งานใช่หรือไม่?\n\nประวัติการลงเวลา/การลาเดิมของพนักงานคนนี้จะยังถูกเก็บไว้ครบ (ไม่ได้ลบถาวร) และสามารถกด "กู้คืนพนักงาน" ภายหลังได้`,
        `Delete employee "${emp.name}" from the active list?\n\nTheir existing attendance/leave history will be kept (not permanently deleted) and can be restored later via "Restore employee"`
      )
    )
  )
    return;
  try {
    await updateDoc(doc(db, EMPLOYEES_COLLECTION, id), {
      active: emp.active === false ? true : false,
      updatedBy: admin.name,
      updatedAt: serverTimestamp(),
    });
    await loadEmployees();
    fillEmployeeFilterSelects();
    renderEmployeeList();
    showToast(bi("✅ อัปเดตสถานะพนักงานแล้ว", "✅ Employee status updated"));
  } catch (e) {
    console.error(e);
    showToast(bi("❌ อัปเดตไม่สำเร็จ", "❌ Update failed"));
  }
}

// ---------- ส่งออกรายชื่อพนักงานเป็น Excel (แยกตามแผนก) ----------
const DAY_OFF_NAMES_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

async function exportEmployeesExcel() {
  const btn = document.getElementById("emp-export-btn");
  if (typeof ExcelJS === "undefined") {
    showToast(bi("โหลดเครื่องมือสร้าง Excel ไม่สำเร็จ กรุณาลองใหม่", "Failed to load the Excel export tool, please try again"));
    return;
  }
  if (!employees.length) {
    showToast(bi("ไม่มีข้อมูลพนักงานให้ส่งออก", "No employee data to export"));
    return;
  }
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = bi("กำลังสร้างไฟล์...", "Generating file...");

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = COMPANY.nameTh || "ระบบลงเวลาทำงาน";

    // จัดกลุ่มพนักงานตามแผนก ตามลำดับใน DEPARTMENTS ก่อน แล้วตามด้วยแผนกอื่นๆ ที่ไม่อยู่ในลิสต์ (ถ้ามี)
    const deptOrder = [...DEPARTMENTS];
    employees.forEach((e) => {
      if (e.department && !deptOrder.includes(e.department)) deptOrder.push(e.department);
    });
    if (employees.some((e) => !e.department)) deptOrder.push("");

    const grouped = deptOrder
      .map((dept) => ({
        dept,
        list: employees
          .filter((e) => (e.department || "") === dept)
          .sort((a, b) => (a.name || "").localeCompare(b.name || "", "th")),
      }))
      .filter((g) => g.list.length > 0);

    // ---- ชีตที่ 1: สรุปจำนวนพนักงานตามแผนก ----
    const activeCount = employees.filter((e) => e.active !== false).length;
    const summarySheet = workbook.addWorksheet("สรุป");
    summarySheet.columns = [
      { header: "แผนก", key: "dept", width: 28 },
      { header: "จำนวนพนักงาน", key: "count", width: 16 },
      { header: "ใช้งานอยู่", key: "active", width: 14 },
      { header: "ปิดใช้งาน", key: "inactive", width: 14 },
    ];
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.addRow({
      dept: "รวมทั้งหมด",
      count: employees.length,
      active: activeCount,
      inactive: employees.length - activeCount,
    });
    grouped.forEach((g) => {
      summarySheet.addRow({
        dept: g.dept || "ไม่ระบุแผนก",
        count: g.list.length,
        active: g.list.filter((e) => e.active !== false).length,
        inactive: g.list.filter((e) => e.active === false).length,
      });
    });

    // ---- ชีตที่ 2: รายชื่อพนักงานแยกตามแผนก (จัดกลุ่มเหมือนไฟล์รายชื่อพนักงานต้นฉบับ) ----
    const sheet = workbook.addWorksheet("รายชื่อพนักงาน");
    const headers = ["รหัสพนักงาน", "ชื่อ", "แผนก", "กะการทำงาน", "วันหยุดประจำสัปดาห์", "สถานะ"];
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    [16, 26, 22, 24, 20, 14].forEach((w, i) => (sheet.getColumn(i + 1).width = w));

    grouped.forEach((g) => {
      const headerRow = sheet.addRow([`${g.dept || "ไม่ระบุแผนก"} (${g.list.length} คน)`]);
      sheet.mergeCells(headerRow.number, 1, headerRow.number, headers.length);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      headerRow.alignment = { vertical: "middle" };

      g.list.forEach((emp) => {
        const shift = getShiftById(shifts, emp.shiftId);
        sheet.addRow([
          emp.employeeCode || "",
          emp.name || "",
          emp.department || "",
          shift ? `${shift.name} (${shift.start}-${shift.end})` : "-",
          DAY_OFF_NAMES_TH[emp.weeklyDayOff ?? 0],
          emp.active === false ? "ปิดใช้งาน" : "ใช้งานอยู่",
        ]);
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `รายชื่อพนักงาน_${today}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(bi(`✅ ส่งออกสำเร็จ (${employees.length} คน)`, `✅ Exported successfully (${employees.length} employees)`));
  } catch (e) {
    console.error(e);
    showToast(bi("❌ ส่งออกไม่สำเร็จ: ", "❌ Export failed: ") + e.message, 4000);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

// ============================================================
//  แท็บ: กะการทำงาน
// ============================================================
async function onSaveShift(e) {
  e.preventDefault();
  const editId = document.getElementById("shift-edit-id").value;
  const data = {
    name: document.getElementById("shift-name").value.trim(),
    start: document.getElementById("shift-start").value,
    end: document.getElementById("shift-end").value,
    breakMinutes: Number(document.getElementById("shift-break").value || 0),
    crossesMidnight: document.getElementById("shift-crosses").checked,
    color: document.getElementById("shift-color").value.trim() || "#2563eb",
  };
  if (!data.name || !data.start || !data.end) {
    showToast(bi("กรุณากรอกข้อมูลกะให้ครบถ้วน", "Please fill in all shift details"));
    return;
  }
  try {
    const id = editId || `shift_${Date.now()}`;
    await setDoc(doc(db, SHIFTS_COLLECTION, id), data, { merge: true });
    showToast(bi("✅ บันทึกกะการทำงานสำเร็จ", "✅ Shift saved successfully"));
    resetShiftForm();
    await loadShifts();
    fillShiftSelects();
    renderShiftList();
  } catch (err) {
    console.error(err);
    showToast(bi("❌ บันทึกไม่สำเร็จ", "❌ Failed to save"));
  }
}

function resetShiftForm() {
  document.getElementById("shift-form").reset();
  document.getElementById("shift-edit-id").value = "";
  document.getElementById("shift-color").value = "#2563eb";
  document.getElementById("shift-cancel-edit-btn").style.display = "none";
}

function renderShiftList() {
  const container = document.getElementById("shift-list");
  container.innerHTML = shifts
    .map(
      (s) => `
      <div class="emp-row">
        <div>
          <span class="shift-chip" style="background:${s.color}22; color:${s.color};"><span class="dot" style="background:${s.color};"></span>${escapeHtml(shiftNameBi(s.name))}</span>
          <div class="emp-meta">${s.start} - ${s.end} • ${bi(`พัก ${s.breakMinutes || 0} นาที`, `${s.breakMinutes || 0} min break`)} ${s.crossesMidnight ? `• ${bi("ข้ามเที่ยงคืน", "crosses midnight")}` : ""}</div>
        </div>
        <div class="emp-actions">
          <button class="btn btn-outline btn-sm" data-edit-shift="${s.id}">${bi("แก้ไข", "Edit")}</button>
        </div>
      </div>`
    )
    .join("");
  container.querySelectorAll("[data-edit-shift]").forEach((btn) => {
    btn.addEventListener("click", () => startEditShift(btn.dataset.editShift));
  });
}

function startEditShift(id) {
  const s = shifts.find((x) => x.id === id);
  if (!s) return;
  document.getElementById("shift-edit-id").value = s.id;
  document.getElementById("shift-name").value = s.name;
  document.getElementById("shift-start").value = s.start;
  document.getElementById("shift-end").value = s.end;
  document.getElementById("shift-break").value = s.breakMinutes || 0;
  document.getElementById("shift-crosses").checked = !!s.crossesMidnight;
  document.getElementById("shift-color").value = s.color || "#2563eb";
  document.getElementById("shift-cancel-edit-btn").style.display = "inline-flex";
}

// ============================================================
//  แท็บ: วันหยุดประจำปี
// ============================================================
async function onAddHoliday(e) {
  e.preventDefault();
  const date = document.getElementById("holiday-date").value;
  const name = document.getElementById("holiday-name").value.trim();
  if (!date || !name) return;
  try {
    await addDoc(collection(db, HOLIDAYS_COLLECTION), { date, name });
    document.getElementById("holiday-form").reset();
    await loadHolidays();
    renderHolidayList();
    showToast(bi("✅ เพิ่มวันหยุดสำเร็จ", "✅ Holiday added successfully"));
  } catch (err) {
    console.error(err);
    showToast(bi("❌ เพิ่มวันหยุดไม่สำเร็จ", "❌ Failed to add holiday"));
  }
}

function renderHolidayList() {
  const container = document.getElementById("holiday-list");
  if (!holidays.length) {
    container.innerHTML = `<div class="empty-state">${bi("ยังไม่มีวันหยุดในระบบ", "No holidays in the system yet")}</div>`;
    return;
  }
  container.innerHTML = holidays
    .map(
      (h) => `
      <div class="holiday-card">
        ${h.id ? `<button class="h-remove" data-del-holiday="${h.id}">✕</button>` : ""}
        <div class="h-date">${formatDateThai(h.date)}</div>
        <div class="h-name">${escapeHtml(h.name)}</div>
      </div>`
    )
    .join("");
  container.querySelectorAll("[data-del-holiday]").forEach((btn) => {
    btn.addEventListener("click", () => deleteHoliday(btn.dataset.delHoliday));
  });
}

async function deleteHoliday(id) {
  try {
    await deleteDoc(doc(db, HOLIDAYS_COLLECTION, id));
    await loadHolidays();
    renderHolidayList();
    showToast(bi("🗑️ ลบวันหยุดแล้ว", "🗑️ Holiday deleted"));
  } catch (e) {
    console.error(e);
    showToast(bi("❌ ลบไม่สำเร็จ", "❌ Failed to delete"));
  }
}

// ============================================================
//  แท็บ: สลับวันหยุด
// ============================================================
async function onAddSwap(e) {
  e.preventDefault();
  const employeeId = document.getElementById("swap-employee").value;
  const originalDate = document.getElementById("swap-original").value;
  const newDate = document.getElementById("swap-new").value;
  const reason = document.getElementById("swap-reason").value.trim();
  const emp = employees.find((x) => x.id === employeeId);
  if (!emp || !originalDate || !newDate) {
    showToast(bi("กรุณากรอกข้อมูลให้ครบถ้วน", "Please fill in all required fields"));
    return;
  }
  try {
    await addDoc(collection(db, SWAPS_COLLECTION), {
      employeeId,
      employeeName: emp.name,
      originalDate,
      newDate,
      reason,
      status: SWAP_STATUS.APPROVED, // แอดมินเพิ่มเอง = อนุมัติทันที (มีผลกับปฏิทินทันที)
      requestedBy: "admin",
      createdBy: admin.name,
      reviewedBy: admin.name,
      reviewedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
    document.getElementById("swap-form").reset();
    await loadSwaps();
    renderSwapList();
    showToast(bi("✅ บันทึกการสลับวันหยุดสำเร็จ ระบบจะจัดการวันทำงาน/วันหยุดให้อัตโนมัติ", "✅ Day-off swap saved successfully. The system will update work/off days automatically"));
  } catch (err) {
    console.error(err);
    showToast(bi("❌ บันทึกไม่สำเร็จ", "❌ Failed to save"));
  }
}

function renderSwapList() {
  const container = document.getElementById("swap-list");
  if (!swaps.length) {
    container.innerHTML = `<div class="empty-state">${bi("ยังไม่มีรายการสลับวันหยุด", "No day-off swaps yet")}</div>`;
    return;
  }
  // เรียงให้รายการที่ "รออนุมัติ" (พนักงานยื่นขอเอง) ขึ้นมาก่อน เพื่อให้แอดมินเห็น/จัดการก่อน
  const sorted = [...swaps].sort((a, b) => {
    const aPending = a.status === SWAP_STATUS.PENDING ? 0 : 1;
    const bPending = b.status === SWAP_STATUS.PENDING ? 0 : 1;
    return aPending - bPending;
  });

  container.innerHTML = sorted
    .map((s) => {
      const status = s.status || SWAP_STATUS.APPROVED;
      const isPending = status === SWAP_STATUS.PENDING;
      const statusColor = status === SWAP_STATUS.APPROVED ? "#10b981" : status === SWAP_STATUS.REJECTED ? "#ef4444" : "#f59e0b";
      return `
      <div class="swap-row">
        <div class="sw-top">
          <div class="sw-name">
            ${escapeHtml(s.employeeName)}
            <span class="badge" style="background:${statusColor}22; color:${statusColor}; margin-left:6px;">
              <span class="dot" style="background:${statusColor};"></span>${statusBi(status)}
            </span>
            ${s.requestedBy === "employee" ? `<span class="badge" style="background:#eff6ff; color:#2563eb; margin-left:4px;">${bi("ยื่นเอง", "Self-requested")}</span>` : ""}
          </div>
          ${!isPending ? `<button class="btn btn-danger btn-sm" data-del-swap="${s.id}">${bi("ลบ", "Delete")}</button>` : ""}
        </div>
        <div class="sw-detail">
          🔄 <b>${formatDateThai(s.originalDate)}</b> (${bi("เดิมวันหยุด → ทำงานแทน", "was day off → work instead")})
          ➜ <b>${formatDateThai(s.newDate)}</b> (${bi("เดิมทำงาน → หยุดแทน", "was working → day off instead")})
        </div>
        ${s.reason ? `<div class="hint" style="margin-top:6px;">${bi("เหตุผล", "Reason")}: ${escapeHtml(s.reason)}</div>` : ""}
        ${
          isPending
            ? `<div style="display:flex; gap:8px; margin-top:10px;">
                <button class="btn btn-success btn-sm" data-approve-swap="${s.id}">✅ ${bi("อนุมัติ", "Approve")}</button>
                <button class="btn btn-danger btn-sm" data-reject-swap="${s.id}">❌ ${bi("ไม่อนุมัติ", "Reject")}</button>
               </div>`
            : ""
        }
      </div>`;
    })
    .join("");
  container.querySelectorAll("[data-del-swap]").forEach((btn) => {
    btn.addEventListener("click", () => deleteSwap(btn.dataset.delSwap));
  });
  container.querySelectorAll("[data-approve-swap]").forEach((btn) => {
    btn.addEventListener("click", () => reviewSwap(btn.dataset.approveSwap, SWAP_STATUS.APPROVED));
  });
  container.querySelectorAll("[data-reject-swap]").forEach((btn) => {
    btn.addEventListener("click", () => reviewSwap(btn.dataset.rejectSwap, SWAP_STATUS.REJECTED));
  });
}

async function reviewSwap(id, status) {
  try {
    await updateDoc(doc(db, SWAPS_COLLECTION, id), {
      status,
      reviewedBy: admin.name,
      reviewedAt: serverTimestamp(),
    });
    await loadSwaps();
    renderSwapList();
    showToast(
      status === SWAP_STATUS.APPROVED
        ? bi("✅ อนุมัติคำขอสลับวันหยุดแล้ว", "✅ Day-off swap request approved")
        : bi("❌ ไม่อนุมัติคำขอสลับวันหยุดแล้ว", "❌ Day-off swap request rejected")
    );
  } catch (e) {
    console.error(e);
    showToast(bi("❌ ดำเนินการไม่สำเร็จ", "❌ Action failed"));
  }
}

async function deleteSwap(id) {
  try {
    await deleteDoc(doc(db, SWAPS_COLLECTION, id));
    await loadSwaps();
    renderSwapList();
    showToast(bi("🗑️ ลบรายการสลับวันหยุดแล้ว", "🗑️ Day-off swap deleted"));
  } catch (e) {
    console.error(e);
    showToast(bi("❌ ลบไม่สำเร็จ", "❌ Failed to delete"));
  }
}

// ============================================================
//  แท็บ: คำขอลา (อนุมัติ/ไม่อนุมัติ)
// ============================================================
function renderLeaveList() {
  const statusFilter = document.getElementById("leave-filter-status").value;
  const list = statusFilter ? leaves.filter((l) => l.status === statusFilter) : leaves;
  const container = document.getElementById("admin-leave-list");
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><span class="emoji">🌴</span>${bi("ไม่มีคำขอลาในรายการนี้", "No leave requests in this list")}</div>`;
    return;
  }
  container.innerHTML = list
    .map((l) => {
      const statusColor =
        l.status === LEAVE_STATUS.APPROVED ? "#10b981" : l.status === LEAVE_STATUS.REJECTED ? "#ef4444" : "#f59e0b";
      const pending = l.status === LEAVE_STATUS.PENDING;
      const emp = employees.find((e) => e.id === l.employeeId);
      const impact = pending && emp ? checkQuotaImpact(l, emp, leaves, leaveQuotaDefaults) : null;
      const quotaWarn =
        impact && impact.exceeds
          ? `<div class="hint" style="color:#ef4444; margin-top:6px;">⚠️ ${bi(
              `${leaveTypeBi(l.typeLabel || l.typeId)}: ใช้ไปแล้ว ${impact.usedBefore}/${impact.quota} วัน หากอนุมัติคำขอนี้จะเกินโควต้า ${Math.abs(impact.afterApprove)} วัน`,
              `${leaveTypeBi(l.typeLabel || l.typeId)}: already used ${impact.usedBefore}/${impact.quota} days. Approving this will exceed the quota by ${Math.abs(impact.afterApprove)} day(s)`
            )}</div>`
          : "";
      return `
        <div class="leave-row">
          <div class="lr-top">
            <div>
              <div class="lr-type">${escapeHtml(l.employeeName)} — ${escapeHtml(leaveTypeBi(l.typeLabel || l.typeId))}</div>
              <div class="lr-dates">${formatDateThai(l.startDate)} - ${formatDateThai(l.endDate)} (${bi(`${l.days} วัน`, `${l.days} day(s)`)})</div>
            </div>
            <span class="badge" style="background:${statusColor}22; color:${statusColor};">
              <span class="dot" style="background:${statusColor};"></span>${statusBi(l.status)}
            </span>
          </div>
          ${l.reason ? `<div class="lr-reason">${escapeHtml(l.reason)}</div>` : ""}
          ${quotaWarn}
          ${
            pending
              ? `<div style="display:flex; gap:8px; margin-top:10px;">
                  <button class="btn btn-success btn-sm" data-approve="${l.id}">✅ ${bi("อนุมัติ", "Approve")}</button>
                  <button class="btn btn-danger btn-sm" data-reject="${l.id}">❌ ${bi("ไม่อนุมัติ", "Reject")}</button>
                 </div>`
              : `<div class="hint" style="margin-top:8px;">${bi("พิจารณาโดย", "Reviewed by")}: ${l.reviewedBy || "-"}</div>`
          }
        </div>`;
    })
    .join("");

  container.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.addEventListener("click", () => reviewLeave(btn.dataset.approve, LEAVE_STATUS.APPROVED));
  });
  container.querySelectorAll("[data-reject]").forEach((btn) => {
    btn.addEventListener("click", () => reviewLeave(btn.dataset.reject, LEAVE_STATUS.REJECTED));
  });
}

async function reviewLeave(id, status) {
  try {
    const leaveBefore = leaves.find((l) => l.id === id);
    await updateDoc(doc(db, LEAVE_COLLECTION, id), {
      status,
      reviewedBy: admin.name,
      reviewedAt: serverTimestamp(),
    });
    await loadLeaves();
    renderLeaveList();
    showToast(
      status === LEAVE_STATUS.APPROVED
        ? bi("✅ อนุมัติคำขอลาแล้ว", "✅ Leave request approved")
        : bi("❌ ไม่อนุมัติคำขอลาแล้ว", "❌ Leave request rejected")
    );
    // แจ้งเตือนตัวพนักงานเจ้าของคำขอ + หัวหน้าทีม + แอดมิน HR ทุกคน — ไม่ต้องรอผลเสร็จก่อน (fire-and-forget)
    if (leaveBefore) {
      const emp = employees.find((e) => e.id === leaveBefore.employeeId);
      const leaveAfter = { ...leaveBefore, status };
      notifyLeaveReviewed(leaveAfter, emp, status === LEAVE_STATUS.APPROVED, admin.name).catch((e) =>
        console.warn("แจ้งเตือน LINE ไม่สำเร็จ", e)
      );
    }
  } catch (e) {
    console.error(e);
    showToast(bi("❌ ดำเนินการไม่สำเร็จ", "❌ Action failed"));
  }
}

// ============================================================
//  แท็บ: สรุปวันลา — ตั้งค่าโควต้าเริ่มต้นของบริษัท + สรุปการใช้วันลารายบุคคล (ปีปัจจุบัน)
// ============================================================
function fillLeaveQuotaDefaultInputs() {
  QUOTA_LEAVE_TYPE_IDS.forEach((typeId) => {
    const el = document.getElementById(`lq-default-${typeId}`);
    if (el) el.value = leaveQuotaDefaults[typeId] ?? DEFAULT_LEAVE_QUOTA[typeId] ?? 0;
  });
}

function readLeaveQuotaDefaultInputs() {
  const result = {};
  QUOTA_LEAVE_TYPE_IDS.forEach((typeId) => {
    const el = document.getElementById(`lq-default-${typeId}`);
    const v = el ? Number(el.value) : NaN;
    result[typeId] = Number.isFinite(v) && v >= 0 ? v : DEFAULT_LEAVE_QUOTA[typeId] ?? 0;
  });
  return result;
}

async function onSaveLeaveQuotaDefaults() {
  const values = readLeaveQuotaDefaultInputs();
  try {
    await setDoc(doc(db, SETTINGS_COLLECTION, "leaveQuotaDefaults"), {
      ...values,
      updatedBy: admin.name,
      updatedAt: serverTimestamp(),
    });
    leaveQuotaDefaults = values;
    showToast(bi("✅ บันทึกค่าเริ่มต้นโควต้าวันลาแล้ว", "✅ Default leave quota saved"));
    renderLeaveSummaryTable();
  } catch (e) {
    console.error(e);
    showToast(bi("❌ บันทึกไม่สำเร็จ กรุณาลองใหม่", "❌ Failed to save, please try again"));
  }
}

async function onApplyLeaveQuotaDefaultsToAll() {
  const values = readLeaveQuotaDefaultInputs();
  const msg = bi(
    `ต้องการใช้ค่านี้ (ลาป่วย ${values.sick} / ลากิจ ${values.personal} / ลาพักร้อน ${values.vacation} วัน) กับพนักงานทุกคนใช่หรือไม่?\nการตั้งค่าเฉพาะบุคคลที่เคยปรับไว้จะถูกเขียนทับทั้งหมด`,
    `Apply this quota (Sick ${values.sick} / Personal ${values.personal} / Vacation ${values.vacation} days) to ALL employees?\nAny individual overrides will be overwritten.`
  );
  if (!confirm(msg)) return;
  try {
    await onSaveLeaveQuotaDefaults();
    await Promise.all(
      employees.map((emp) =>
        updateDoc(doc(db, EMPLOYEES_COLLECTION, emp.id), {
          leaveQuota: { ...values },
          updatedBy: admin.name,
          updatedAt: serverTimestamp(),
        })
      )
    );
    await loadEmployees();
    renderLeaveSummaryTable();
    showToast(bi("✅ ใช้ค่าโควต้านี้กับพนักงานทุกคนแล้ว", "✅ Applied this quota to all employees"));
  } catch (e) {
    console.error(e);
    showToast(bi("❌ ดำเนินการไม่สำเร็จ กรุณาลองใหม่", "❌ Action failed, please try again"));
  }
}

function renderLeaveSummaryTable() {
  const tbody = document.getElementById("leavesummary-tbody");
  const emptyEl = document.getElementById("leavesummary-empty");
  if (!tbody) return;
  const list = employees.filter((e) => e.active !== false);
  if (!list.length) {
    tbody.innerHTML = "";
    emptyEl.innerHTML = `<div class="empty-state"><span class="emoji">📊</span>${bi("ไม่พบพนักงาน", "No employees found")}</div>`;
    return;
  }
  emptyEl.innerHTML = "";
  const year = currentYear();
  tbody.innerHTML = list
    .map((emp) => {
      const balance = computeBalance(emp, leaves, leaveQuotaDefaults, year);
      const cells = QUOTA_LEAVE_TYPE_IDS.map((typeId) => {
        const b = balance[typeId];
        const over = b.remaining < 0;
        return `<td style="${over ? "color:#ef4444; font-weight:600;" : ""}">
          ${b.used}/${b.quota}
          <span class="hint" style="display:block; font-size:11px;">${bi("คงเหลือ", "left")} ${b.remaining}${over ? " ⚠️" : ""}</span>
        </td>`;
      }).join("");
      return `<tr><td>${escapeHtml(emp.name)}</td><td>${emp.department ? deptBi(emp.department) : "-"}</td>${cells}</tr>`;
    })
    .join("");
}

// ============================================================
//  แท็บ: รายงานเวลาทำงาน / OT
// ============================================================
function setupReportDefaults() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  document.getElementById("rep-from").value = toInputDate(firstOfMonth);
  document.getElementById("rep-to").value = toInputDate(today);

  // ค่าเริ่มต้นของ "ส่งสรุปเข้า LINE" — วันนี้วันเดียว + ภาพรวมทั้งบริษัท (ปรับเองได้ก่อนกด "ส่ง")
  document.getElementById("rep-line-from").value = toInputDate(today);
  document.getElementById("rep-line-to").value = toInputDate(today);
  fillLineTypeSelect();
}

function fillLineTypeSelect() {
  const deptOpts = DEPARTMENTS.map((d) => `<option value="${d}">${bi("เฉพาะแผนก", "Only")} ${deptBi(d)}</option>`).join("");
  document.getElementById("rep-line-type").innerHTML =
    `<option value="">${bi("ภาพรวมทั้งบริษัท (ทุกแผนกรวมกัน)", "Company-wide overview (all departments combined)")}</option>` +
    `<option value="__bydept__">${bi("แยกยอดตามแผนก", "Broken down by department")}</option>` +
    deptOpts;
}
function toInputDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function runReport() {
  const from = document.getElementById("rep-from").value;
  const to = document.getElementById("rep-to").value;
  const employeeFilter = document.getElementById("rep-employee").value;
  const deptFilter = document.getElementById("rep-dept").value;
  const tbody = document.getElementById("report-tbody");
  const emptyEl = document.getElementById("report-empty");
  tbody.innerHTML = `<tr><td colspan="9">${bi("กำลังโหลด...", "Loading...")}</td></tr>`;
  emptyEl.innerHTML = "";

  try {
    const snap = await getDocs(
      query(collection(db, ATTENDANCE_COLLECTION), where("date", ">=", from), where("date", "<=", to), orderBy("date"))
    );
    let records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (employeeFilter) records = records.filter((r) => r.employeeId === employeeFilter);
    if (deptFilter) {
      records = records.filter((r) => {
        const emp = employees.find((e) => e.id === r.employeeId);
        return emp && emp.department === deptFilter;
      });
    }

    const rows = records.map((r) => {
      const emp = employees.find((e) => e.id === r.employeeId);
      const shift = getShiftById(shifts, r.shiftId);
      const dayFlags = getDayFlags({ date: r.date, employee: emp || { id: r.employeeId, weeklyDayOff: null }, holidays, swaps });
      const label = getDayLabel(dayFlags);
      const summary = summarizeDay({ events: r.events || [], shift, dayFlags, otRules: OT_RULES, shiftDate: r.date });
      const sorted = [...(r.events || [])].sort((a, b) => new Date(a.time) - new Date(b.time));
      const firstEv = sorted[0];
      const lastEv = sorted[sorted.length - 1];
      return { record: r, emp, shift, dayFlags, label, summary, firstEv, lastEv };
    });

    lastReportRows = rows;
    renderReportTable(rows);
    renderReportStats(rows);

    if (!rows.length) {
      emptyEl.innerHTML = `<div class="empty-state"><span class="emoji">📭</span>${bi("ไม่พบข้อมูลในช่วงวันที่ที่เลือก", "No records found for the selected date range")}</div>`;
    }
  } catch (e) {
    console.error(e);
    tbody.innerHTML = "";
    emptyEl.innerHTML = `<div class="empty-state">${bi("เกิดข้อผิดพลาดในการโหลดข้อมูล (อาจต้องสร้าง Index ใน Firestore ครั้งแรก ดูลิงก์ใน Console ของเบราว์เซอร์)", "Failed to load data (a Firestore index may need to be created first — check the link in your browser console)")}</div>`;
  }
}

function renderReportTable(rows) {
  const tbody = document.getElementById("report-tbody");
  if (!rows.length) {
    tbody.innerHTML = "";
    return;
  }
  tbody.innerHTML = rows
    .map(({ record, emp, shift, label, summary, firstEv, lastEv }, idx) => {
      const events = record.events || [];
      const hasInPhoto = events.some((e) => e.type === "in" && e.photo);
      const hasOutPhoto = events.some((e) => e.type === "out" && e.photo);
      return `
      <tr>
        <td>${formatDateThai(record.date)}</td>
        <td>${escapeHtml(emp ? emp.name : record.employeeName || "-")}</td>
        <td>${shift ? shiftNameBi(shift.name) : "-"}</td>
        <td><span class="day-flag-badge" style="background:${label.color}22; color:${label.color};">${label.text}</span></td>
        <td>${firstEv ? formatTimeShort(firstEv.time) : "-"} / ${lastEv ? formatTimeShort(lastEv.time) : "-"}</td>
        <td>${minutesToHM(summary.workedMinutes)}</td>
        <td>${summary.otMinutes > 0 ? minutesToHM(summary.otMinutes) + ` (${summary.otMultiplier}x)` : "-"}</td>
        <td>${summary.isLate ? `⚠️ ${bi(`${summary.lateMinutes} น.`, `${summary.lateMinutes} min`)}` : "-"}</td>
        <td>
          ${hasInPhoto ? `<button type="button" class="photo-view-btn" data-row="${idx}" data-ptype="in">📷${bi("เข้า", "In")}</button>` : ""}
          ${hasOutPhoto ? `<button type="button" class="photo-view-btn" data-row="${idx}" data-ptype="out">📷${bi("ออก", "Out")}</button>` : ""}
          ${!hasInPhoto && !hasOutPhoto ? "-" : ""}
        </td>
        <td>${renderReportLocationCell(firstEv, lastEv)}</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-row]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = rows[Number(btn.dataset.row)];
      if (!row) return;
      const events = row.record.events || [];
      const type = btn.dataset.ptype;
      const ev =
        type === "in"
          ? events.find((e) => e.type === "in" && e.photo)
          : [...events].reverse().find((e) => e.type === "out" && e.photo);
      if (ev && ev.photo) showPhotoLightbox(ev.photo);
    });
  });
}

function renderReportLocationCell(firstEv, lastEv) {
  const inLink =
    firstEv && firstEv.lat != null && firstEv.lng != null
      ? `<a href="https://www.google.com/maps?q=${firstEv.lat},${firstEv.lng}" target="_blank" rel="noopener">📍${bi("เข้า", "In")}</a>`
      : "";
  const outLink =
    lastEv && lastEv.lat != null && lastEv.lng != null && lastEv !== firstEv
      ? `<a href="https://www.google.com/maps?q=${lastEv.lat},${lastEv.lng}" target="_blank" rel="noopener">📍${bi("ออก", "Out")}</a>`
      : "";
  if (!inLink && !outLink) return `<span style="color:#94a3b8;">${bi("ไม่มีข้อมูล", "N/A")}</span>`;
  return [inLink, outLink].filter(Boolean).join(" / ");
}

function renderReportStats(rows) {
  const totalRecords = rows.length;
  const totalWorkedMin = rows.reduce((s, r) => s + r.summary.workedMinutes, 0);
  const totalOtMin = rows.reduce((s, r) => s + r.summary.otMinutes, 0);
  const lateCount = rows.filter((r) => r.summary.isLate).length;
  const activeCount = employees.filter((e) => e.active !== false).length;

  document.getElementById("stat-grid").innerHTML = `
    <div class="stat-card"><div class="num">${activeCount}</div><div class="lbl">${bi("พนักงานที่ใช้งานอยู่", "Active employees")}</div></div>
    <div class="stat-card"><div class="num">${totalRecords}</div><div class="lbl">${bi("จำนวนวันที่มีการลงเวลา", "Days with time records")}</div></div>
    <div class="stat-card"><div class="num">${minutesToHM(totalWorkedMin)}</div><div class="lbl">${bi("รวมชั่วโมงทำงาน", "Total hours worked")}</div></div>
    <div class="stat-card"><div class="num" style="color:#f59e0b;">${minutesToHM(totalOtMin)}</div><div class="lbl">${bi("รวมชั่วโมง OT", "Total OT hours")}</div></div>
    <div class="stat-card"><div class="num" style="color:#ef4444;">${lateCount}</div><div class="lbl">${bi("จำนวนครั้งมาสาย", "Late instances")}</div></div>
  `;
}

async function exportReportExcel() {
  const btn = document.getElementById("rep-export-btn");
  if (typeof ExcelJS === "undefined") {
    showToast(bi("โหลดเครื่องมือสร้าง Excel ไม่สำเร็จ กรุณาลองใหม่", "Failed to load the Excel export tool, please try again"));
    return;
  }
  if (!lastReportRows.length) {
    showToast(bi("ไม่มีข้อมูลให้ส่งออก", "No data to export"));
    return;
  }
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = bi("กำลังสร้างไฟล์...", "Generating file...");

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = COMPANY.nameTh || "ระบบลงเวลาทำงาน";

    const from = document.getElementById("rep-from").value;
    const to = document.getElementById("rep-to").value;

    // ---- ชีตที่ 1: สรุป ----
    const totalWorkedMin = lastReportRows.reduce((s, r) => s + r.summary.workedMinutes, 0);
    const totalOtMin = lastReportRows.reduce((s, r) => s + r.summary.otMinutes, 0);
    const lateCount = lastReportRows.filter((r) => r.summary.isLate).length;
    const summarySheet = workbook.addWorksheet("สรุป");
    summarySheet.columns = [
      { header: "รายการ", key: "k", width: 30 },
      { header: "จำนวน", key: "v", width: 20 },
    ];
    summarySheet.getRow(1).font = { bold: true };
    [
      ["ช่วงวันที่", `${formatDateThai(from)} - ${formatDateThai(to)}`],
      ["จำนวนวันที่มีการลงเวลา", lastReportRows.length],
      ["รวมชั่วโมงทำงาน", minutesToHM(totalWorkedMin)],
      ["รวมชั่วโมง OT", minutesToHM(totalOtMin)],
      ["จำนวนครั้งมาสาย", lateCount],
    ].forEach((row) => summarySheet.addRow(row));

    // ---- ชีตที่ 2: รายละเอียดรายวัน ----
    const sheet = workbook.addWorksheet("รายละเอียด");
    sheet.columns = [
      { header: "วันที่", key: "date", width: 16 },
      { header: "รหัสพนักงาน", key: "code", width: 14 },
      { header: "ชื่อพนักงาน", key: "name", width: 24 },
      { header: "แผนก", key: "dept", width: 18 },
      { header: "กะ", key: "shift", width: 14 },
      { header: "ประเภทวัน", key: "daytype", width: 20 },
      { header: "เข้างานครั้งแรก", key: "firstIn", width: 16 },
      { header: "ออกงานครั้งสุดท้าย", key: "lastOut", width: 18 },
      { header: "ชั่วโมงทำงาน (ชม.)", key: "worked", width: 16 },
      { header: "ชั่วโมงปกติ (ชม.)", key: "regular", width: 16 },
      { header: "ชั่วโมง OT (ชม.)", key: "ot", width: 14 },
      { header: "อัตรา OT", key: "otRate", width: 10 },
      { header: "มาสาย (นาที)", key: "late", width: 14 },
      { header: "ตำแหน่งเข้างาน", key: "locIn", width: 34 },
      { header: "ตำแหน่งออกงาน", key: "locOut", width: 34 },
    ];
    sheet.getRow(1).font = { bold: true };

    lastReportRows.forEach(({ record, emp, shift, label, summary, firstEv, lastEv }) => {
      sheet.addRow({
        date: formatDateThai(record.date),
        code: emp ? emp.employeeCode || "" : "",
        name: emp ? emp.name : record.employeeName || "",
        dept: emp ? emp.department || "" : "",
        shift: shift ? shift.name : "",
        daytype: label.text,
        firstIn: firstEv ? formatTimeShort(firstEv.time) : "",
        lastOut: lastEv ? formatTimeShort(lastEv.time) : "",
        worked: (summary.workedMinutes / 60).toFixed(2),
        regular: (summary.regularMinutes / 60).toFixed(2),
        ot: (summary.otMinutes / 60).toFixed(2),
        otRate: summary.otMinutes > 0 ? `${summary.otMultiplier}x` : "-",
        late: summary.isLate ? summary.lateMinutes : 0,
        locIn: firstEv && firstEv.lat != null && firstEv.lng != null ? `https://www.google.com/maps?q=${firstEv.lat},${firstEv.lng}` : "",
        locOut: lastEv && lastEv.lat != null && lastEv.lng != null ? `https://www.google.com/maps?q=${lastEv.lat},${lastEv.lng}` : "",
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `รายงานเวลาทำงาน_${from}_${to}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(bi(`✅ ส่งออกสำเร็จ (${lastReportRows.length} รายการ)`, `✅ Exported successfully (${lastReportRows.length} records)`));
  } catch (e) {
    console.error(e);
    showToast(bi("❌ ส่งออกไม่สำเร็จ: ", "❌ Export failed: ") + e.message, 4000);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

// ============================================================
//  ส่งสรุปรายงานประจำวันเข้าแชท LINE ของแอดมิน — ส่งผ่าน Netlify Function (js/notify.js ->
//  sendAdminOwnLinePush -> netlify/functions/line-push.js) ซึ่งหา lineUserId ของแอดมินคนนี้เองจาก
//  collection "adminLineLinks" แล้ว push เข้าแชทส่วนตัวของแอดมินกับ LINE OA เท่านั้น — เปลี่ยนจากเดิมที่
//  ใช้ liff.sendMessages() ซึ่งจะโพสต์ข้อความเข้า "ห้องแชทที่เปิดแอปอยู่" (อาจเป็นห้องแชทกลุ่มโดยไม่ตั้งใจ)
//  ทำให้ข้อมูลสรุปหลุดไปที่อื่นได้ — ไม่ต้องอัปเกรด Firebase เป็นแผน Blaze เพราะ Netlify Function เป็น
//  ฟีเจอร์ฟรี ไม่ต้องผูกบัตรเครดิต ฟีเจอร์นี้จึงใช้ได้จากเบราว์เซอร์ทั่วไปด้วย ไม่จำเป็นต้องเปิดผ่านแอป
//  LINE อีกต่อไป แต่แอดมินคนนั้นต้องเคยกด "🔔 เชื่อมต่อ LINE" ที่แดชบอร์ดไว้ก่อนแล้ว (ดู maybeLinkAdminLine)
// ============================================================
// คำนวณสรุปยอดของวันใดวันหนึ่ง (dateStr) — กรองเฉพาะแผนกที่ระบุได้ (deptFilter) เพื่อรองรับ
// "ส่งสรุปเข้า LINE" แบบเลือกประเภท (ภาพรวม / แยกตามแผนก / เฉพาะแผนกเดียว) และเลือกช่วงวันที่เองได้
async function computeSummaryForDate(dateStr, deptFilter) {
  const activeEmployees = employees.filter((e) => e.active !== false && (!deptFilter || e.department === deptFilter));

  const snap = await getDocs(query(collection(db, ATTENDANCE_COLLECTION), where("date", "==", dateStr)));
  const dayRecords = snap.docs.map((d) => d.data());

  let checkedIn = 0;
  let checkedOut = 0;
  let onLeave = 0;
  let dayOff = 0;
  let absent = 0;
  let lateCount = 0;
  const absentNames = [];
  const lateNames = [];

  activeEmployees.forEach((emp) => {
    const isOnLeaveThatDay = leaves.some(
      (l) =>
        l.employeeId === emp.id &&
        l.status === LEAVE_STATUS.APPROVED &&
        l.startDate <= dateStr &&
        l.endDate >= dateStr
    );
    if (isOnLeaveThatDay) {
      onLeave++;
      return;
    }

    const dayFlags = getDayFlags({ date: dateStr, employee: emp, holidays, swaps });
    const dayCategory = classifyDay(dayFlags);
    if (dayCategory === "holiday" || dayCategory === "restday") {
      dayOff++;
      return;
    }

    const record = dayRecords.find((r) => r.employeeId === emp.id);
    const events = record?.events || [];
    const hasIn = events.some((e) => e.type === "in");
    const hasOut = events.some((e) => e.type === "out");
    if (hasOut) checkedOut++;
    if (hasIn) {
      checkedIn++;
      const shift = getShiftById(shifts, emp.shiftId);
      const summary = summarizeDay({ events, shift, dayFlags, otRules: OT_RULES, shiftDate: dateStr });
      if (summary.isLate) {
        lateCount++;
        lateNames.push(emp.name);
      }
    } else {
      absent++;
      absentNames.push(emp.name);
    }
  });

  return {
    dateStr,
    total: activeEmployees.length,
    checkedIn,
    checkedOut,
    onLeave,
    dayOff,
    absent,
    absentNames,
    lateCount,
    lateNames,
  };
}

const LINE_SUMMARY_DIVIDER = "----------------------------";

// รายชื่อพนักงานในกลุ่มหนึ่ง (มาสาย/ยังไม่มา) -> ข้อความแบบขึ้นบรรทัดใหม่ทีละคน (บูลเล็ต) อ่านง่ายกว่า
// การเรียงชื่อคั่นด้วยจุลภาคยาวๆ มาก (ปัญหาที่แจ้งมา) — ถ้าคนในกลุ่มคือ "ทุกคนในบริษัท/แผนกนั้น" พอดี
// (เช่น ยังไม่มีใครเช็คอินเลยตอนเช้าตรู่) จะไม่แสดงชื่อซ้ำทั้งหมด เพราะตัวเลขด้านบนบอกอยู่แล้วว่าคือทุกคน
// และถ้ารายชื่อยาวเกินไป จะตัดแสดงบางส่วน + บอกจำนวนที่เหลือ กันข้อความยาวจนอ่านไม่ไหว
const NAME_LIST_CAP = 20;
function formatNameListText(names, totalForContext) {
  if (!names.length) return "";
  if (totalForContext && totalForContext > 5 && names.length >= totalForContext) return "";
  const shown = names.slice(0, NAME_LIST_CAP);
  let out = "\n" + shown.map((n) => `   • ${n}`).join("\n");
  if (names.length > NAME_LIST_CAP) {
    out += `\n   • ${bi(`และอีก ${names.length - NAME_LIST_CAP} คน`, `and ${names.length - NAME_LIST_CAP} more`)}`;
  }
  return out;
}

// แปลงผลสรุป 1 วัน (ของ 1 แผนก หรือภาพรวม) เป็นข้อความสั้นๆ ไม่มีหัวข้อวันที่ (ใส่หัวข้อวันที่ครอบไว้ด้านนอกอีกที)
// จัดเป็นกลุ่มๆ คั่นด้วยบรรทัดว่าง ให้อ่านง่ายขึ้น แทนที่จะเป็นข้อความยาวติดกันหมด
function formatSummaryBlock(s, label) {
  const pct = s.total ? Math.round((s.checkedIn / s.total) * 100) : 0;
  let text = label ? `▸ ${label}\n` : "";
  text += `👥 พนักงานทั้งหมด / Total: ${s.total} คน\n`;
  text += `🟢 เช็คอินแล้ว / Checked in: ${s.checkedIn} คน (${pct}%)\n`;
  text += `🔴 เช็คเอาท์แล้ว / Checked out: ${s.checkedOut} คน\n`;
  text += `🌴 ลา / On leave: ${s.onLeave} คน\n`;
  text += `📅 วันหยุด / Day off: ${s.dayOff} คน`;

  text += `\n\n⚠️ มาสาย / Late: ${s.lateCount} คน`;
  text += formatNameListText(s.lateNames, s.total);

  text += `\n\n❌ ยังไม่มาลงเวลา / Not clocked in: ${s.absent} คน`;
  text += formatNameListText(s.absentNames, s.total);

  return text;
}

// รายชื่อวันที่ทั้งหมดระหว่าง from-to (รวมปลายทั้งสองข้าง) เป็น array ของ "YYYY-MM-DD"
function dateRangeList(fromStr, toStr) {
  const dates = [];
  let cur = new Date(fromStr + "T00:00:00");
  const end = new Date(toStr + "T00:00:00");
  while (cur <= end) {
    dates.push(toInputDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

async function sendDailySummaryToLine() {
  const btn = document.getElementById("rep-send-line-btn");
  if (!admin || !admin.id) {
    showToast(bi("❌ ไม่พบข้อมูลแอดมินปัจจุบัน", "❌ Could not identify the current admin"));
    return;
  }

  const fromStr = document.getElementById("rep-line-from").value;
  const toStr = document.getElementById("rep-line-to").value || fromStr;
  const typeVal = document.getElementById("rep-line-type").value; // "" = ภาพรวม, "__bydept__" = แยกตามแผนก, หรือชื่อแผนก
  if (!fromStr) {
    showToast(bi("❌ กรุณาเลือกวันที่ก่อน", "❌ Please select a date first"));
    return;
  }
  if (toStr < fromStr) {
    showToast(bi("❌ วันที่ 'ถึง' ต้องไม่ก่อนวันที่ 'จาก'", "❌ The 'to' date must not be before the 'from' date"));
    return;
  }
  const dates = dateRangeList(fromStr, toStr);
  if (dates.length > 31) {
    showToast(bi("❌ เลือกช่วงวันที่ได้สูงสุด 31 วันต่อครั้ง", "❌ You can select up to 31 days at a time"), 4000);
    return;
  }

  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = bi("กำลังสรุปข้อมูล...", "Summarizing data...");

  try {
    const typeHeaderTh =
      typeVal === "__bydept__" ? "แยกยอดตามแผนก" : typeVal ? `เฉพาะแผนก ${typeVal}` : "ภาพรวมทั้งบริษัท";
    const typeHeaderEn =
      typeVal === "__bydept__" ? "By department" : typeVal ? `${typeVal} department only` : "Company-wide";

    const dayBlocks = [];
    for (const dateStr of dates) {
      let block = `🗓️ ${formatDateThai(dateStr)}\n${LINE_SUMMARY_DIVIDER}\n`;
      if (typeVal === "__bydept__") {
        const perDept = [];
        for (const dept of DEPARTMENTS) {
          const s = await computeSummaryForDate(dateStr, dept);
          if (s.total > 0) perDept.push(formatSummaryBlock(s, dept));
        }
        block += perDept.length ? perDept.join(`\n${LINE_SUMMARY_DIVIDER}\n`) : bi("ไม่มีข้อมูลพนักงานตามแผนก", "No department data");
      } else {
        const s = await computeSummaryForDate(dateStr, typeVal || null);
        block += formatSummaryBlock(s, null);
      }
      dayBlocks.push(block);
    }

    let text = `📊 สรุปการเข้างาน (${bi(typeHeaderTh, typeHeaderEn)})\n${LINE_SUMMARY_DIVIDER}\n`;
    text += dayBlocks.join(`\n${LINE_SUMMARY_DIVIDER}\n`);
    text += `\n${LINE_SUMMARY_DIVIDER}\n✍️ ส่งโดย / Sent by: ${admin.name}`;

    await sendAdminOwnLinePush(admin.id, text);
    showToast(bi("✅ ส่งสรุปเข้า LINE ส่วนตัวของคุณแล้ว", "✅ Summary sent to your personal LINE chat"));
  } catch (e) {
    console.error(e);
    if (e && e.message === "NOT_LINKED") {
      showToast(
        bi(
          "❌ คุณยังไม่ได้เชื่อมต่อ LINE กรุณากดปุ่ม '🔔 เชื่อมต่อ LINE' ที่แดชบอร์ดก่อน",
          "❌ You haven't connected LINE yet. Please click '🔔 Connect LINE' on the dashboard first"
        ),
        4000
      );
    } else {
      showToast(bi("❌ ส่งสรุปไม่สำเร็จ: ", "❌ Failed to send summary: ") + (e && e.message ? e.message : ""), 4000);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}
