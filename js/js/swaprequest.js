// swaprequest.js — ยื่นคำขอสลับวันหยุดกับวันทำงานเอง + ดูสถานะคำขอของตนเอง (ฝั่งพนักงาน)
// ต่างจากที่แอดมินเพิ่มเอง (admin.js) ตรงที่คำขอจากพนักงานจะมี status: "รออนุมัติ" ค้างไว้ก่อน
// ยังไม่มีผลต่อปฏิทินจนกว่าแอดมินจะกดอนุมัติ (ดู schedule.js getDayFlags — กรองด้วย status)
import { SWAP_STATUS } from "./config.js";
import { db, collection, addDoc, getDocs, query, where, serverTimestamp } from "./firebase-init.js";
import { SWAPS_COLLECTION } from "./firebase-init.js";
import { showToast, formatDateThai } from "./utils.js";
import { bi, statusBi } from "./i18n.js";

let employee = null;

export function initSwapRequest(emp) {
  employee = emp;
  document.getElementById("swap-request-form").addEventListener("submit", onSubmitSwapRequest);
  loadMySwapRequests();
}

async function onSubmitSwapRequest(e) {
  e.preventDefault();
  const originalDate = document.getElementById("swapreq-original").value;
  const newDate = document.getElementById("swapreq-new").value;
  const reason = document.getElementById("swapreq-reason").value.trim();

  if (!originalDate || !newDate) {
    showToast(bi("กรุณาระบุวันที่ให้ครบถ้วน", "Please specify both dates"));
    return;
  }
  if (originalDate === newDate) {
    showToast(bi("วันหยุดเดิมและวันที่ขอหยุดแทนต้องไม่ใช่วันเดียวกัน", "The original day off and the replacement day cannot be the same"));
    return;
  }

  const btn = document.getElementById("swap-request-submit-btn");
  btn.disabled = true;
  try {
    await addDoc(collection(db, SWAPS_COLLECTION), {
      employeeId: employee.id,
      employeeName: employee.name,
      originalDate,
      newDate,
      reason,
      status: SWAP_STATUS.PENDING,
      requestedBy: "employee",
      createdAt: serverTimestamp(),
    });
    showToast(bi("✅ ส่งคำขอสลับวันหยุดสำเร็จ รอการอนุมัติ", "✅ Day-off swap request submitted, awaiting approval"));
    document.getElementById("swap-request-form").reset();
    loadMySwapRequests();
  } catch (err) {
    console.error(err);
    showToast(bi("❌ ส่งคำขอไม่สำเร็จ กรุณาลองใหม่", "❌ Failed to submit request, please try again"));
  } finally {
    btn.disabled = false;
  }
}

async function loadMySwapRequests() {
  const listEl = document.getElementById("swap-request-list");
  listEl.innerHTML = `<div class="empty-state">${bi("กำลังโหลด...", "Loading...")}</div>`;
  try {
    const snap = await getDocs(query(collection(db, SWAPS_COLLECTION), where("employeeId", "==", employee.id)));
    let requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    requests.sort((a, b) => (a.originalDate < b.originalDate ? 1 : -1));

    if (!requests.length) {
      listEl.innerHTML = `<div class="empty-state"><span class="emoji">🔄</span>${bi("ยังไม่มีประวัติการขอสลับวันหยุด", "No swap request history yet")}</div>`;
      return;
    }

    listEl.innerHTML = requests
      .map((s) => {
        const status = s.status || SWAP_STATUS.APPROVED; // รายการเก่า/ที่แอดมินเพิ่มเองไม่มี status ถือว่าอนุมัติแล้ว
        const statusColor =
          status === SWAP_STATUS.APPROVED ? "#10b981" : status === SWAP_STATUS.REJECTED ? "#ef4444" : "#f59e0b";
        return `
          <div class="leave-row" style="border-left-color:${statusColor};">
            <div class="lr-top">
              <div>
                <div class="lr-type">🔄 ${formatDateThai(s.originalDate)} ➜ ${formatDateThai(s.newDate)}</div>
                <div class="lr-dates">${bi("วันหยุดเดิม (มาทำงานแทน) → วันที่ขอหยุดแทน", "Original day off (work instead) → replacement day off")}</div>
              </div>
              <span class="badge" style="background:${statusColor}22; color:${statusColor};">
                <span class="dot" style="background:${statusColor};"></span>${statusBi(status)}
              </span>
            </div>
            ${s.reason ? `<div class="lr-reason">${escapeHtml(s.reason)}</div>` : ""}
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
