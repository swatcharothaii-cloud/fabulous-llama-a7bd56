// leave.js — ยื่นคำขอลา + ดูประวัติการลาของตนเอง + สรุปโควต้าวันลาปีนี้ (ฝั่งพนักงาน)
import { LEAVE_TYPES, LEAVE_STATUS, QUOTA_LEAVE_TYPE_IDS, DEFAULT_LEAVE_QUOTA } from "./config.js";
import { db, collection, addDoc, getDoc, getDocs, doc, query, where, serverTimestamp } from "./firebase-init.js";
import { LEAVE_COLLECTION, SETTINGS_COLLECTION } from "./firebase-init.js";
import { showToast, formatDateThai } from "./utils.js";
import { bi, leaveTypeBi, statusBi } from "./i18n.js";
import { notifyLeaveCreated } from "./notify.js";
import { currentYear, computeBalance } from "./leave-balance.js";

let employee = null;
let companyQuotaDefaults = DEFAULT_LEAVE_QUOTA;

export function initLeave(emp) {
  employee = emp;
  fillLeaveTypeSelect();
  document.getElementById("leave-form").addEventListener("submit", onSubmitLeave);
  loadCompanyQuotaDefaults().then(() => loadMyLeaves());
}

async function loadCompanyQuotaDefaults() {
  try {
    const snap = await getDoc(doc(db, SETTINGS_COLLECTION, "leaveQuotaDefaults"));
    if (snap.exists()) companyQuotaDefaults = { ...DEFAULT_LEAVE_QUOTA, ...snap.data() };
  } catch (e) {
    console.warn("โหลดค่าเริ่มต้นโควต้าวันลาไม่สำเร็จ ใช้ค่า default ในโค้ดแทน", e);
  }
}

function renderLeaveBalance(leaves) {
  const el = document.getElementById("leave-balance-summary");
  if (!el) return;
  const balance = computeBalance(employee, leaves, companyQuotaDefaults, currentYear());
  const labelKey = { sick: "lq.sick", personal: "lq.personal", vacation: "lq.vacation" };
  el.innerHTML = QUOTA_LEAVE_TYPE_IDS.map((typeId) => {
    const b = balance[typeId];
    const type = LEAVE_TYPES.find((t) => t.id === typeId);
    const over = b.remaining < 0;
    const pct = b.quota > 0 ? Math.min(100, Math.round((b.used / b.quota) * 100)) : 0;
    return `
      <div class="stat-card">
        <div class="num" style="color:${over ? '#ef4444' : (type ? type.color : '#111827')};">${b.remaining}</div>
        <div class="lbl">${leaveTypeBi(type ? type.label : typeId)} · ${bi(`ใช้ ${b.used}/${b.quota} วัน`, `${b.used}/${b.quota} days used`)}</div>
        <div class="balance-bar"><div class="balance-bar-fill" style="width:${pct}%; background:${over ? '#ef4444' : (type ? type.color : '#2563eb')};"></div></div>
      </div>`;
  }).join("");
}

function fillLeaveTypeSelect() {
  const sel = document.getElementById("leave-type");
  sel.innerHTML = LEAVE_TYPES.map((t) => `<option value="${t.id}">${leaveTypeBi(t.label)}</option>`).join("");
}

async function onSubmitLeave(e) {
  e.preventDefault();
  const typeId = document.getElementById("leave-type").value;
  const start = document.getElementById("leave-start").value;
  const end = document.getElementById("leave-end").value;
  const reason = document.getElementById("leave-reason").value.trim();
  const type = LEAVE_TYPES.find((t) => t.id === typeId);

  if (!start || !end) {
    showToast(bi("กรุณาระบุวันที่ให้ครบถ้วน", "Please specify both dates"));
    return;
  }
  if (end < start) {
    showToast(bi("วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มลา", "End date cannot be before the start date"));
    return;
  }

  const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
  const btn = document.getElementById("leave-submit-btn");
  btn.disabled = true;

  try {
    const leavePayload = {
      employeeId: employee.id,
      employeeName: employee.name,
      typeId,
      typeLabel: type ? type.label : typeId,
      startDate: start,
      endDate: end,
      days,
      reason,
      status: LEAVE_STATUS.PENDING,
      createdAt: serverTimestamp(),
    };
    await addDoc(collection(db, LEAVE_COLLECTION), leavePayload);
    showToast(bi("✅ ส่งคำขอลาสำเร็จ รอการอนุมัติ", "✅ Leave request submitted, awaiting approval"));
    // แจ้งเตือนหัวหน้าทีม + แอดมิน HR ทุกคน — ไม่ต้องรอผลเสร็จก่อน (fire-and-forget)
    notifyLeaveCreated(leavePayload, employee).catch((e) => console.warn("แจ้งเตือน LINE ไม่สำเร็จ", e));
    document.getElementById("leave-form").reset();
    fillLeaveTypeSelect();
    loadMyLeaves();
  } catch (err) {
    console.error(err);
    showToast(bi("❌ ส่งคำขอลาไม่สำเร็จ กรุณาลองใหม่", "❌ Failed to submit leave request, please try again"));
  } finally {
    btn.disabled = false;
  }
}

async function loadMyLeaves() {
  const listEl = document.getElementById("leave-list");
  listEl.innerHTML = `<div class="empty-state">${bi("กำลังโหลด...", "Loading...")}</div>`;
  try {
    const snap = await getDocs(query(collection(db, LEAVE_COLLECTION), where("employeeId", "==", employee.id)));
    let leaves = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    leaves.sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

    renderLeaveBalance(leaves);

    if (!leaves.length) {
      listEl.innerHTML = `<div class="empty-state"><span class="emoji">🌴</span>${bi("ยังไม่มีประวัติการลา", "No leave history yet")}</div>`;
      return;
    }

    listEl.innerHTML = leaves
      .map((l) => {
        const type = LEAVE_TYPES.find((t) => t.id === l.typeId);
        const statusColor =
          l.status === LEAVE_STATUS.APPROVED ? "#10b981" : l.status === LEAVE_STATUS.REJECTED ? "#ef4444" : "#f59e0b";
        return `
          <div class="leave-row" style="border-left-color:${type ? type.color : '#94a3b8'};">
            <div class="lr-top">
              <div>
                <div class="lr-type">${leaveTypeBi(l.typeLabel || l.typeId)}</div>
                <div class="lr-dates">${formatDateThai(l.startDate)} - ${formatDateThai(l.endDate)} (${bi(`${l.days} วัน`, `${l.days} day(s)`)})</div>
              </div>
              <span class="badge" style="background:${statusColor}22; color:${statusColor};">
                <span class="dot" style="background:${statusColor};"></span>${statusBi(l.status)}
              </span>
            </div>
            ${l.reason ? `<div class="lr-reason">${escapeHtml(l.reason)}</div>` : ""}
          </div>`;
      })
      .join("");
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<div class="empty-state">${bi("เกิดข้อผิดพลาดในการโหลดข้อมูล", "Failed to load data")}</div>`;
  }
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}
