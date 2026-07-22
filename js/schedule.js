// schedule.js — เชื่อมข้อมูลจริง (พนักงาน / วันหยุดบริษัท / รายการสลับวันหยุด)
// เข้ากับตรรกะการจัดประเภทวันใน ot-calc.js
//
// นี่คือจุดเดียวที่ตัดสินว่า "วันนี้ของพนักงานคนนี้" เป็นวันทำงานปกติ วันหยุดนักขัตฤกษ์
// หรือวันหยุดประจำสัปดาห์ — โดยคำนึงถึงการสลับวันหยุดที่แอดมินตั้งไว้ล่วงหน้าด้วย
import { dayOfWeek, addDays } from "./utils.js";
import { classifyDay, hhmmToMinutes } from "./ot-calc.js";
import { bi } from "./i18n.js";

// หาว่าเวลา "ตอนนี้" ควรถูกบันทึกเป็นเหตุการณ์ของ "วันกะ" ไหน (shiftDate)
// กรณีกะข้ามเที่ยงคืน (crossesMidnight) เช่น กะดึก 21:00-06:00 การเช็คอิน/เอาท์ในช่วงเช้ามืด
// (ก่อนเวลาสิ้นสุดกะ) ยังถือเป็นส่วนหนึ่งของ "กะเมื่อคืน" ไม่ใช่กะของวันปฏิทินปัจจุบัน
export function resolveShiftDate(shift, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const calendarToday = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (!shift) return calendarToday;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const endMinutes = hhmmToMinutes(shift.end);
  if (shift.crossesMidnight && nowMinutes <= endMinutes) {
    return addDays(calendarToday, -1);
  }
  return calendarToday;
}

// หาว่าวันที่ระบุ (ต้องเป็นวันเสาร์เท่านั้น) เป็น "เสาร์ที่ 2 หรือ 4 ของเดือน" หรือไม่ — ใช้กับ
// พนักงานกลุ่ม "BKK Office" ที่หยุดวันอาทิตย์ปกติ + เสาร์เว้นสัปดาห์ (สัปดาห์ที่ 2 และ 4) เพิ่มอีกวัน
// (นับแบบ ceil(วันที่ / 7) จึงถูกต้องเสมอไม่ว่าวันที่ 1 ของเดือนจะตรงกับวันไหนก็ตาม)
function isSecondOrFourthSaturday(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (d.getDay() !== 6) return false; // ไม่ใช่วันเสาร์ ไม่เกี่ยวข้อง
  const nth = Math.ceil(d.getDate() / 7);
  return nth === 2 || nth === 4;
}

// swaps: รายการจาก collection "dayOffSwaps" แต่ละรายการ
//   { employeeId, originalDate, newDate, reason, ... }
//   ความหมาย: พนักงานคนนี้ "สลับ" วันหยุดจาก originalDate ไปเป็น newDate แทน
//   -> originalDate จะกลายเป็นวันทำงานปกติ (isSwappedToWork)
//   -> newDate จะกลายเป็นวันหยุดแทน (isSwappedDayOff)
//
// employee.extraBiweeklySaturdayOff = true -> กลุ่ม "BKK Office" (ดู README/แผนกที่ตั้งไว้) หยุดเพิ่มทุก
// เสาร์ที่ 2 และ 4 ของเดือน นอกเหนือจากวันหยุดประจำสัปดาห์ปกติ (employee.weeklyDayOff) — ตั้งค่าได้ที่หน้า
// แอดมิน → แก้ไขพนักงาน → "หยุดเสาร์ที่ 2 และ 4 ของเดือนเพิ่ม (BKK Office)"
export function getDayFlags({ date, employee, holidays = [], swaps = [] }) {
  const isHoliday = holidays.some((h) => h.date === date);
  const weeklyDayOff = employee?.weeklyDayOff;
  const isPlainWeeklyDayOff = weeklyDayOff !== undefined && weeklyDayOff !== null && dayOfWeek(date) === Number(weeklyDayOff);
  const isBiweeklySaturdayOff = !!employee?.extraBiweeklySaturdayOff && isSecondOrFourthSaturday(date);
  const isWeeklyDayOff = isPlainWeeklyDayOff || isBiweeklySaturdayOff;

  // เฉพาะรายการที่ "อนุมัติแล้ว" เท่านั้นที่มีผลจริงต่อปฏิทิน — รายการที่แอดมินเพิ่มเองโดยตรง (ไม่มี
  // ฟิลด์ status) ถือว่าอนุมัติแล้วโดยปริยาย ส่วนคำขอที่พนักงานยื่นเองจะมี status: "รออนุมัติ"/"ไม่อนุมัติ"
  // ค้างอยู่จนกว่าแอดมินจะกดอนุมัติ (ดู admin.js reviewSwap)
  const effectiveSwaps = swaps.filter((s) => !s.status || s.status === "อนุมัติแล้ว");
  const mySwaps = effectiveSwaps.filter((s) => s.employeeId === employee?.id);
  const isSwappedToWork = mySwaps.some((s) => s.originalDate === date);
  const isSwappedDayOff = mySwaps.some((s) => s.newDate === date);

  return { isHoliday, isWeeklyDayOff, isBiweeklySaturdayOff, isSwappedToWork, isSwappedDayOff };
}

// คืนป้ายกำกับสั้นๆ สำหรับแสดงผล เช่น "วันหยุดนักขัตฤกษ์", "วันหยุดประจำสัปดาห์", "วันหยุด (สลับ)", "วันทำงาน (สลับ)"
export function getDayLabel(dayFlags) {
  const category = classifyDay(dayFlags);
  if (dayFlags.isSwappedDayOff) return { category, text: bi("วันหยุด (สลับ)", "Day off (swapped)"), color: "#8b5cf6" };
  if (dayFlags.isSwappedToWork) return { category, text: bi("วันทำงาน (สลับวันหยุด)", "Working day (swapped)"), color: "#0ea5e9" };
  if (dayFlags.isHoliday) return { category, text: bi("วันหยุดนักขัตฤกษ์", "Public holiday"), color: "#ef4444" };
  if (dayFlags.isBiweeklySaturdayOff) return { category, text: bi("วันหยุด (เสาร์เว้นสัปดาห์)", "Day off (biweekly Saturday)"), color: "#f59e0b" };
  if (dayFlags.isWeeklyDayOff) return { category, text: bi("วันหยุดประจำสัปดาห์", "Weekly day off"), color: "#f59e0b" };
  return { category, text: bi("วันทำงานปกติ", "Regular working day"), color: "#10b981" };
}

export { classifyDay };
