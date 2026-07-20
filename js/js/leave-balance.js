// leave-balance.js — คำนวณ "โควต้าวันลา / ใช้ไปแล้ว / คงเหลือ" ต่อพนักงานแต่ละคน
// ============================================================
//  หลักการ:
//  - นับเฉพาะ 3 ประเภท: ลาป่วย (sick) / ลากิจ (personal) / ลาพักร้อน (vacation) — ตาม QUOTA_LEAVE_TYPE_IDS
//  - นับเฉพาะคำขอลาที่สถานะ "อนุมัติแล้ว" เท่านั้น (คำขอที่รออนุมัติ/ไม่อนุมัติ ไม่หักโควต้า)
//  - รอบปีนับแบบ "ปีปฏิทิน" (1 ม.ค. - 31 ธ.ค.) โดยอิงจาก "วันที่เริ่มลา" (startDate) ของคำขอ — คำขอที่
//    ลาคาบเกี่ยวข้ามปี (เช่น 30 ธ.ค. - 2 ม.ค.) จะถูกนับทั้งหมดในปีของวันที่เริ่มลา เพื่อความง่าย
//  - โควต้าของพนักงานแต่ละคน = employee.leaveQuota (ถ้าตั้งไว้) หรือ fallback เป็นค่าเริ่มต้นบริษัท
//    (DEFAULT_LEAVE_QUOTA ใน config.js หรือค่าที่แอดมินตั้งไว้ใน Firestore "appSettings/leaveQuotaDefaults")
// ============================================================
import { LEAVE_STATUS, QUOTA_LEAVE_TYPE_IDS, DEFAULT_LEAVE_QUOTA } from "./config.js";

export function currentYear() {
  return new Date().getFullYear();
}

export function yearOfDateStr(dateStr) {
  if (!dateStr) return null;
  const y = Number(String(dateStr).slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

// รวมโควต้าของพนักงานคนนี้ (ตั้งค่าเฉพาะบุคคล) เข้ากับค่าเริ่มต้นบริษัท (fallback ทีละประเภท)
export function resolveEmployeeQuota(employee, companyDefaults) {
  const defaults = companyDefaults || DEFAULT_LEAVE_QUOTA;
  const own = (employee && employee.leaveQuota) || {};
  const result = {};
  QUOTA_LEAVE_TYPE_IDS.forEach((typeId) => {
    const v = own[typeId];
    result[typeId] = typeof v === "number" && v >= 0 ? v : defaults[typeId] ?? 0;
  });
  return result;
}

// รวมจำนวนวันลาที่ "อนุมัติแล้ว" ของพนักงานคนนี้ ในปีที่กำหนด แยกตามประเภท (เฉพาะ 3 ประเภทที่มีโควต้า)
export function computeUsedDays(leaves, employeeId, year) {
  const used = {};
  QUOTA_LEAVE_TYPE_IDS.forEach((typeId) => (used[typeId] = 0));
  (leaves || []).forEach((l) => {
    if (l.employeeId !== employeeId) return;
    if (l.status !== LEAVE_STATUS.APPROVED) return;
    if (!QUOTA_LEAVE_TYPE_IDS.includes(l.typeId)) return;
    if (yearOfDateStr(l.startDate) !== year) return;
    used[l.typeId] += Number(l.days) || 0;
  });
  return used;
}

// สรุปยอดโควต้า/ใช้ไป/คงเหลือ ต่อประเภท สำหรับพนักงานคนเดียว
export function computeBalance(employee, leaves, companyDefaults, year) {
  const y = year || currentYear();
  const quota = resolveEmployeeQuota(employee, companyDefaults);
  const used = computeUsedDays(leaves, employee.id, y);
  const balance = {};
  QUOTA_LEAVE_TYPE_IDS.forEach((typeId) => {
    const q = quota[typeId] || 0;
    const u = used[typeId] || 0;
    balance[typeId] = { quota: q, used: u, remaining: q - u };
  });
  return balance;
}

// เช็กว่า "คำขอลา" รายการนี้ (สมมุติว่าอนุมัติ) จะทำให้เกินโควต้าคงเหลือหรือไม่ — ใช้เตือนแอดมินตอนอนุมัติ
// คืนค่า null ถ้าประเภทนี้ไม่มีโควต้า (ไม่ต้องเตือน) หรือ {quota, usedBefore, remainingBefore, afterApprove} ถ้ามี
export function checkQuotaImpact(leaveRequest, employee, allLeaves, companyDefaults, excludeLeaveId) {
  if (!QUOTA_LEAVE_TYPE_IDS.includes(leaveRequest.typeId)) return null;
  const year = yearOfDateStr(leaveRequest.startDate) || currentYear();
  const quota = resolveEmployeeQuota(employee, companyDefaults)[leaveRequest.typeId] || 0;
  // ใช้ไปแล้ว "ก่อน" นับคำขอนี้ (กันนับคำขอเดียวกันซ้ำ ถ้ามันถูกอนุมัติไปแล้วอยู่ใน allLeaves)
  const usedBefore = (allLeaves || [])
    .filter(
      (l) =>
        l.employeeId === leaveRequest.employeeId &&
        l.typeId === leaveRequest.typeId &&
        l.status === LEAVE_STATUS.APPROVED &&
        l.id !== (excludeLeaveId || leaveRequest.id) &&
        yearOfDateStr(l.startDate) === year
    )
    .reduce((sum, l) => sum + (Number(l.days) || 0), 0);
  const remainingBefore = quota - usedBefore;
  const afterApprove = remainingBefore - (Number(leaveRequest.days) || 0);
  return { quota, usedBefore, remainingBefore, afterApprove, exceeds: afterApprove < 0 };
}
