// notify.js — ส่งแจ้งเตือนเข้า LINE (เช็คอิน/เช็คเอาท์, ยื่น/พิจารณาคำขอลา, สรุปประจำวันของแอดมิน)
// ============================================================
//  ทำงานฟรี ไม่ต้องอัปเกรด Firebase เป็นแผน Blaze — ส่งผ่าน Netlify Function (netlify/functions/line-push.js)
//  ซึ่งเก็บ LINE Channel Access Token ไว้ที่ Netlify Environment Variables (ไม่เคยส่งมาให้เบราว์เซอร์เห็น)
//  ตัวไฟล์นี้ทำหน้าที่ (1) หา lineUserId ของผู้ที่ควรได้รับแจ้งเตือน จาก Firestore ตรงๆ จากฝั่งเบราว์เซอร์
//  (อ่านได้อยู่แล้วตามสิทธิ์ของแอปนี้ ดู firestore.rules) แล้ว (2) เรียก endpoint /.netlify/functions/line-push
//  ให้ยิงข้อความออกไปให้จริง — ถ้าส่งไม่สำเร็จ (เช่น ยังไม่ได้ตั้งค่า Token/อินเทอร์เน็ตขัดข้อง) จะไม่ทำให้
//  การบันทึกเวลา/ยื่นคำขอ/อนุมัติ ที่เพิ่งทำสำเร็จไปแล้วได้รับผลกระทบ (แค่ไม่มีข้อความแจ้งเตือนไปถึงเท่านั้น)
// ============================================================
import { db, collection, getDocs, query, where, doc, getDoc } from "./firebase-init.js";
import { EMPLOYEES_COLLECTION, ADMIN_LINKS_COLLECTION } from "./firebase-init.js";

const PUSH_ENDPOINT = "/.netlify/functions/line-push";

// ---------- หาผู้รับแจ้งเตือน ----------
async function getTeamLeadLineUserIds(department, excludeEmployeeId) {
  const ids = new Set();
  if (!department) return ids;
  try {
    const snap = await getDocs(
      query(
        collection(db, EMPLOYEES_COLLECTION),
        where("teamLeadOf", "==", department),
        where("active", "==", true)
      )
    );
    snap.forEach((d) => {
      if (d.id === excludeEmployeeId) return; // ไม่ต้องแจ้งเตือนหัวหน้าทีมตอนหัวหน้าทีมทำรายการของตัวเอง
      const v = d.data();
      if (v && v.lineUserId) ids.add(v.lineUserId);
    });
  } catch (e) {
    console.warn("หาหัวหน้าทีมไม่สำเร็จ", e);
  }
  return ids;
}

async function getAdminLineUserIds() {
  const ids = new Set();
  try {
    const snap = await getDocs(collection(db, ADMIN_LINKS_COLLECTION));
    snap.forEach((d) => {
      const v = d.data();
      if (v && v.lineUserId) ids.add(v.lineUserId);
    });
  } catch (e) {
    console.warn("หารายชื่อแอดมินที่เชื่อมต่อ LINE ไม่สำเร็จ", e);
  }
  return ids;
}

async function getBroadcastRecipients(department, excludeEmployeeId) {
  const [leads, admins] = await Promise.all([
    getTeamLeadLineUserIds(department, excludeEmployeeId),
    getAdminLineUserIds(),
  ]);
  return Array.from(new Set([...leads, ...admins]));
}

// เรียก Netlify Function ให้ส่งข้อความจริง — จงใจไม่ throw ออกไปให้โค้ดที่เรียกใช้ต้อง await/catch เอง
// (การแจ้งเตือนเป็นเรื่อง "ดีถ้ามี" ไม่ควรทำให้ฟีเจอร์หลัก เช่น การบันทึกเวลา ล้มเหลวไปด้วย)
async function sendLinePush(to, text) {
  const ids = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!ids.length || !text) return;
  try {
    const res = await fetch(PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: ids, text }),
    });
    if (!res.ok) {
      console.warn("ส่งแจ้งเตือน LINE ไม่สำเร็จ (HTTP " + res.status + ")");
    }
  } catch (e) {
    console.warn("ส่งแจ้งเตือน LINE ไม่สำเร็จ (ไม่กระทบข้อมูลหลักที่บันทึกไปแล้ว)", e);
  }
}

function formatBangkokDateTime(d) {
  const dateStr = d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", year: "numeric", month: "long", day: "numeric" });
  const weekdayStr = d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", weekday: "long" });
  const timeStr = d.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
  return { dateStr, weekdayStr, timeStr };
}

const DIVIDER = "----------------------------";

// เทียบเวลาเช็คอินจริง (HH:mm ตามเวลากรุงเทพฯ) กับเวลาเริ่มกะ เพื่อบอกว่า "มาสาย" หรือไม่ — เป็นการเทียบ
// แบบง่าย (ไม่ได้คำนวณ OT/กะข้ามเที่ยงคืนแบบละเอียดเหมือน ot-calc.js) แค่ใช้ประกอบข้อความแจ้งเตือนเท่านั้น
function computeLateInfo(eventTime, shift) {
  if (!shift || !shift.start) return null;
  const hhmm = eventTime.toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });
  return { isLate: hhmm > shift.start, actualHHMM: hhmm, shiftStart: shift.start };
}

// ---------- 1) เช็คอิน / เช็คเอาท์ ----------
export async function notifyAttendanceEvent(employee, isIn, eventTime, pos, shift) {
  const { dateStr, weekdayStr, timeStr } = formatBangkokDateTime(eventTime);
  const lateInfo = isIn ? computeLateInfo(eventTime, shift) : null;

  // 1a) แจ้งเตือน "ตัวเอง" — ข้อความ 2 ภาษา ไทย/อังกฤษ อ่านง่าย มีรายละเอียดกะ/เวลาที่ควรเข้า
  if (employee.lineUserId) {
    const headLine = isIn
      ? `✅ บันทึกเวลาเข้างานสำเร็จ / Check-in recorded`
      : `✅ บันทึกเวลาเลิกงานสำเร็จ / Check-out recorded`;
    let selfText =
      `${headLine}\n${DIVIDER}\n` +
      `🗓️ วันที่ / Date: ${dateStr} (${weekdayStr})\n` +
      `⏰ เวลา / Time: ${timeStr} น.`;
    if (shift && shift.name) selfText += `\n🕒 กะ / Shift: ${shift.name} (${shift.start}-${shift.end})`;
    if (isIn && lateInfo && lateInfo.isLate) {
      selfText += `\n⚠️ มาสาย (เวลาเริ่มกะ ${lateInfo.shiftStart} น.) / Late (shift starts at ${lateInfo.shiftStart})`;
    }
    sendLinePush(employee.lineUserId, selfText);
  }

  // 1b) แจ้งเตือนหัวหน้าทีมของแผนกนี้ + แอดมิน HR ทุกคน — รายงานอ่านง่าย มีหัวข้อ/คั่นบรรทัดชัดเจน
  const recipients = await getBroadcastRecipients(employee.department, employee.id);
  if (recipients.length) {
    const label = isIn ? "🟢 เช็คอิน / Check-in" : "🔴 เช็คเอาท์ / Check-out";
    let text =
      `${label}\n${DIVIDER}\n` +
      `👤 พนักงาน / Employee: ${employee.name}\n` +
      `🏢 แผนก / Department: ${employee.department || "-"}\n` +
      `🗓️ วันที่ / Date: ${dateStr} (${weekdayStr})\n` +
      `⏰ เวลา / Time: ${timeStr} น.`;
    if (shift && shift.name) text += `\n🕒 กะ / Shift: ${shift.name} (${shift.start}-${shift.end})`;
    if (isIn && lateInfo && lateInfo.isLate) {
      text += `\n⚠️ มาสาย / Late arrival`;
    }
    if (pos && pos.lat != null && pos.lng != null) {
      text += `\n📍 ตำแหน่ง / Location: https://www.google.com/maps?q=${pos.lat},${pos.lng}`;
    }
    sendLinePush(recipients, text);
  }
}

// ---------- 2) ยื่นคำขอลาใหม่ ----------
export async function notifyLeaveCreated(leave, employee) {
  const recipients = await getBroadcastRecipients(employee.department, employee.id);
  if (!recipients.length) return;
  const text =
    `🌴 มีคำขอลาใหม่ (รออนุมัติ) / New leave request (Pending)\n${DIVIDER}\n` +
    `👤 พนักงาน / Employee: ${leave.employeeName || employee.name || "-"}\n` +
    `🏢 แผนก / Department: ${employee.department || "-"}\n` +
    `📋 ประเภท / Type: ${leave.typeLabel || leave.typeId || "-"}\n` +
    `🗓️ ช่วงวันที่ / Dates: ${leave.startDate} ถึง / to ${leave.endDate}\n` +
    `🔢 จำนวน / Total: ${leave.days || "-"} วัน / day(s)\n` +
    `📝 เหตุผล / Reason: ${leave.reason || "-"}\n` +
    `${DIVIDER}\n` +
    `👉 กรุณาเข้าแอปหน้าแอดมินเพื่อพิจารณาอนุมัติ / Please open the admin app to review this request`;
  sendLinePush(recipients, text);
}

// ---------- 3) พิจารณาคำขอลา (อนุมัติ/ไม่อนุมัติ) ----------
export async function notifyLeaveReviewed(leave, employee, isApproved, reviewedBy) {
  // 3a) แจ้งเตือนตัวพนักงานเจ้าของคำขอลา — ข้อความ 2 ภาษา ไทย/อังกฤษ อ่านง่าย มีรายละเอียดครบ
  if (employee && employee.lineUserId) {
    const headLine = isApproved
      ? `✅ คำขอลาของคุณได้รับการอนุมัติ / Your leave request was approved`
      : `❌ คำขอลาของคุณไม่ได้รับการอนุมัติ / Your leave request was not approved`;
    let selfText =
      `${headLine}\n${DIVIDER}\n` +
      `📋 ประเภท / Type: ${leave.typeLabel || leave.typeId || "-"}\n` +
      `🗓️ ช่วงวันที่ / Dates: ${leave.startDate} ถึง / to ${leave.endDate}\n` +
      `🔢 จำนวน / Total: ${leave.days || "-"} วัน / day(s)\n` +
      `👤 พิจารณาโดย / Reviewed by: ${reviewedBy || "-"}`;
    if (!isApproved) {
      selfText += `\n${DIVIDER}\nกรุณาติดต่อฝ่าย HR หรือหัวหน้างานหากมีข้อสงสัย / Please contact HR or your supervisor if you have questions`;
    }
    sendLinePush(employee.lineUserId, selfText);
  }

  // 3b) แจ้งเตือนหัวหน้าทีม + แอดมิน HR ทุกคน (สรุปผลการพิจารณา)
  const recipients = await getBroadcastRecipients(employee ? employee.department : null, leave.employeeId);
  if (recipients.length) {
    const label = isApproved ? "✅ อนุมัติคำขอลา / Leave approved" : "❌ ไม่อนุมัติคำขอลา / Leave rejected";
    const text =
      `${label}\n${DIVIDER}\n` +
      `👤 พนักงาน / Employee: ${leave.employeeName || (employee && employee.name) || "-"}\n` +
      `🏢 แผนก / Department: ${employee ? employee.department || "-" : "-"}\n` +
      `📋 ประเภท / Type: ${leave.typeLabel || leave.typeId || "-"}\n` +
      `🗓️ ช่วงวันที่ / Dates: ${leave.startDate} ถึง / to ${leave.endDate}\n` +
      `👤 พิจารณาโดย / Reviewed by: ${reviewedBy || "-"}`;
    sendLinePush(recipients, text);
  }
}

// ---------- 4) (กดเอง) ส่งสรุปวันนี้เข้า LINE ส่วนตัวของแอดมิน ----------
// id เอกสารใน adminLineLinks = admin.id ตรงๆ (ดู js/admin.js -> linkAdminLineNow) จึงอ่านตรงด้วย getDoc ได้เลย
export async function sendAdminOwnLinePush(adminId, text) {
  const snap = await getDoc(doc(db, ADMIN_LINKS_COLLECTION, adminId));
  const link = snap.exists() ? snap.data() : null;
  if (!link || !link.lineUserId) {
    throw new Error("NOT_LINKED");
  }
  await sendLinePush(link.lineUserId, text);
}
