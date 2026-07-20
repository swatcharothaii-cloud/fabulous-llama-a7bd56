// myteam.js — แท็บ "ทีมของฉัน" สำหรับหัวหน้าทีม (ดูอย่างเดียว เฉพาะทีมตัวเอง)
// แสดงเฉพาะเมื่อแอดมินตั้งค่า employee.teamLeadOf ไว้ให้ (ดูหน้าแอดมิน > พนักงาน > แก้ไข)
// แสดงสถานะเช็คอิน/เช็คเอาท์วันนี้ (หรือวันที่เลือก) ของพนักงานทุกคนในแผนกเดียวกัน
import { SHIFTS, HOLIDAYS_2026, OT_RULES, LEAVE_STATUS } from "./config.js";
import { db, collection, getDocs, query, where } from "./firebase-init.js";
import {
  EMPLOYEES_COLLECTION,
  ATTENDANCE_COLLECTION,
  LEAVE_COLLECTION,
  SWAPS_COLLECTION,
  HOLIDAYS_COLLECTION,
  SHIFTS_COLLECTION,
} from "./firebase-init.js";
import { getShiftById, formatTimeShort, showPhotoLightbox } from "./utils.js";
import { summarizeDay } from "./ot-calc.js";
import { getDayFlags, getDayLabel, classifyDay } from "./schedule.js";
import { bi, deptBi, shiftNameBi } from "./i18n.js";

let leadEmployee = null;
let teamMembers = [];
let shifts = SHIFTS;
let holidays = HOLIDAYS_2026;
let swaps = [];
let leaves = [];
let wired = false;

export async function initMyTeam(employee) {
  leadEmployee = employee;
  const dateInput = document.getElementById("team-date");
  if (dateInput) dateInput.value = toInputDate(new Date());
  const titleEl = document.getElementById("team-title");
  if (titleEl) titleEl.textContent = bi(`👥 ทีมของฉัน — แผนก ${employee.teamLeadOf}`, `👥 My Team — ${deptBi(employee.teamLeadOf)} department`);

  if (!wired) {
    wired = true;
    const btn = document.getElementById("team-search-btn");
    if (btn) btn.addEventListener("click", () => renderTeamForDate());
  }

  await loadReferenceData();
  await renderTeamForDate();
}

async function loadReferenceData() {
  try {
    const snap = await getDocs(
      query(
        collection(db, EMPLOYEES_COLLECTION),
        where("department", "==", leadEmployee.teamLeadOf),
        where("active", "==", true)
      )
    );
    teamMembers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    teamMembers.sort((a, b) => (a.name || "").localeCompare(b.name || "", "th"));
  } catch (e) {
    console.error("โหลดรายชื่อทีมไม่สำเร็จ", e);
    teamMembers = [];
  }
  try {
    const shiftsSnap = await getDocs(collection(db, SHIFTS_COLLECTION));
    if (!shiftsSnap.empty) shifts = shiftsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("ใช้กะเริ่มต้นจาก config.js (โหลดจาก Firestore ไม่สำเร็จ)", e);
  }
  try {
    const holidaysSnap = await getDocs(collection(db, HOLIDAYS_COLLECTION));
    if (!holidaysSnap.empty) holidays = holidaysSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("ใช้วันหยุดเริ่มต้นจาก config.js (โหลดจาก Firestore ไม่สำเร็จ)", e);
  }
  try {
    const swapsSnap = await getDocs(collection(db, SWAPS_COLLECTION));
    swaps = swapsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    swaps = [];
  }
  try {
    const leavesSnap = await getDocs(collection(db, LEAVE_COLLECTION));
    leaves = leavesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    leaves = [];
  }
}

function toInputDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function renderTeamForDate() {
  const dateEl = document.getElementById("team-date");
  const dateStr = (dateEl && dateEl.value) || toInputDate(new Date());
  const listEl = document.getElementById("team-list");
  const statGrid = document.getElementById("team-stat-grid");
  listEl.innerHTML = `<div class="empty-state">${bi("กำลังโหลด...", "Loading...")}</div>`;
  statGrid.innerHTML = "";

  if (!teamMembers.length) {
    listEl.innerHTML = `<div class="empty-state"><span class="emoji">👥</span>${bi("ยังไม่มีพนักงานในแผนกนี้ (หรือทุกคนถูกปิดใช้งานอยู่)", "No employees in this department yet (or all are disabled)")}</div>`;
    return;
  }

  let records = [];
  try {
    const snap = await getDocs(query(collection(db, ATTENDANCE_COLLECTION), where("date", "==", dateStr)));
    records = snap.docs.map((d) => d.data());
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<div class="empty-state">${bi("เกิดข้อผิดพลาดในการโหลดข้อมูล (อาจต้องสร้าง Index ใน Firestore ครั้งแรก ดูลิงก์ใน Console ของเบราว์เซอร์)", "Failed to load data (a Firestore index may need to be created first — check the link in your browser console)")}</div>`;
    return;
  }

  let checkedInCount = 0;
  let checkedOutCount = 0;
  let absentCount = 0;
  let lateCount = 0;

  const rows = teamMembers.map((emp) => {
    const isOnLeave = leaves.some(
      (l) =>
        l.employeeId === emp.id &&
        l.status === LEAVE_STATUS.APPROVED &&
        l.startDate <= dateStr &&
        l.endDate >= dateStr
    );
    const dayFlags = getDayFlags({ date: dateStr, employee: emp, holidays, swaps });
    const dayCategory = classifyDay(dayFlags);
    const label = getDayLabel(dayFlags);
    const shift = getShiftById(shifts, emp.shiftId);
    const record = records.find((r) => r.employeeId === emp.id);
    const events = record?.events || [];
    const sorted = [...events].sort((a, b) => new Date(a.time) - new Date(b.time));
    const firstIn = sorted.find((e) => e.type === "in");
    const lastOut = [...sorted].reverse().find((e) => e.type === "out");

    let statusText = "";
    let statusColor = "#94a3b8";
    let isLate = false;
    let lateMinutes = 0;

    if (isOnLeave) {
      statusText = bi("🌴 ลา", "🌴 On leave");
      statusColor = "#10b981";
    } else if (dayCategory === "holiday" || dayCategory === "restday") {
      statusText = `📅 ${label.text}`;
      statusColor = "#64748b";
    } else if (firstIn && lastOut) {
      statusText = bi(
        `✅ เข้า ${formatTimeShort(firstIn.time)} • ออก ${formatTimeShort(lastOut.time)}`,
        `✅ In ${formatTimeShort(firstIn.time)} • Out ${formatTimeShort(lastOut.time)}`
      );
      statusColor = "#2563eb";
      checkedInCount++;
      checkedOutCount++;
    } else if (firstIn) {
      statusText = bi(
        `🟢 เช็คอินแล้ว ${formatTimeShort(firstIn.time)} (กำลังทำงาน)`,
        `🟢 Checked in ${formatTimeShort(firstIn.time)} (working)`
      );
      statusColor = "#10b981";
      checkedInCount++;
    } else {
      statusText = bi("❌ ยังไม่เช็คอิน", "❌ Not checked in yet");
      statusColor = "#ef4444";
      absentCount++;
    }

    if (firstIn && shift && !isOnLeave && dayCategory !== "holiday" && dayCategory !== "restday") {
      const summary = summarizeDay({ events, shift, dayFlags, otRules: OT_RULES, shiftDate: dateStr });
      isLate = summary.isLate;
      lateMinutes = summary.lateMinutes;
      if (isLate) lateCount++;
    }

    return { emp, shift, statusText, statusColor, isLate, lateMinutes, firstIn, lastOut, record };
  });

  statGrid.innerHTML = `
    <div class="stat-card"><div class="num">${teamMembers.length}</div><div class="lbl">${bi("สมาชิกทีม", "Team members")}</div></div>
    <div class="stat-card"><div class="num" style="color:#10b981;">${checkedInCount}</div><div class="lbl">${bi("เช็คอินแล้ว", "Checked in")}</div></div>
    <div class="stat-card"><div class="num" style="color:#2563eb;">${checkedOutCount}</div><div class="lbl">${bi("เช็คเอาท์แล้ว", "Checked out")}</div></div>
    <div class="stat-card"><div class="num" style="color:#ef4444;">${absentCount}</div><div class="lbl">${bi("ยังไม่เช็คอิน", "Not checked in")}</div></div>
    <div class="stat-card"><div class="num" style="color:#f59e0b;">${lateCount}</div><div class="lbl">${bi("มาสาย", "Late")}</div></div>
  `;

  listEl.innerHTML = rows
    .map(({ emp, shift, statusText, statusColor, isLate, lateMinutes, firstIn, lastOut, record }, idx) => {
      const events = record?.events || [];
      const hasInPhoto = events.some((e) => e.type === "in" && e.photo);
      return `
      <div class="emp-row">
        <div>
          <div class="emp-name">${escapeHtml(emp.name)}</div>
          <div class="emp-meta">
            ${
              shift
                ? `<span class="shift-chip" style="background:${shift.color}22; color:${shift.color};"><span class="dot" style="background:${shift.color};"></span>${shiftNameBi(shift.name)}</span>`
                : bi("ไม่มีกะ", "No shift")
            }
            <span style="margin-left:6px; color:${statusColor};">${statusText}</span>
            ${isLate ? `<span style="color:#ef4444; margin-left:6px;">⚠️ ${bi(`สาย ${lateMinutes} น.`, `Late ${lateMinutes} min`)}</span>` : ""}
          </div>
        </div>
        <div class="emp-actions">
          ${
            firstIn && firstIn.lat != null
              ? `<a class="btn btn-outline btn-sm" href="https://www.google.com/maps?q=${firstIn.lat},${firstIn.lng}" target="_blank" rel="noopener">📍 ${bi("เข้า", "In")}</a>`
              : ""
          }
          ${
            lastOut && lastOut.lat != null && lastOut !== firstIn
              ? `<a class="btn btn-outline btn-sm" href="https://www.google.com/maps?q=${lastOut.lat},${lastOut.lng}" target="_blank" rel="noopener">📍 ${bi("ออก", "Out")}</a>`
              : ""
          }
          ${hasInPhoto ? `<button type="button" class="btn btn-outline btn-sm" data-team-photo="${idx}">📷 ${bi("รูป", "Photo")}</button>` : ""}
        </div>
      </div>`;
    })
    .join("");

  listEl.querySelectorAll("[data-team-photo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = rows[Number(btn.dataset.teamPhoto)];
      const ev = (row?.record?.events || []).find((e) => e.type === "in" && e.photo);
      if (ev) showPhotoLightbox(ev.photo);
    });
  });

  if (!teamMembers.length) {
    listEl.innerHTML = `<div class="empty-state"><span class="emoji">👥</span>${bi("ไม่พบพนักงาน", "No employees found")}</div>`;
  }
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}
