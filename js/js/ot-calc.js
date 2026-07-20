// ============================================================
//  ot-calc.js — เครื่องคำนวณชั่วโมงทำงาน / OT
//  เป็นฟังก์ชัน pure function ล้วนๆ (ไม่แตะ DOM / Firestore) เพื่อให้ทดสอบได้ง่าย
//  และเรียกใช้ซ้ำได้ทั้งฝั่งพนักงาน (สรุปประจำวัน) และฝั่งแอดมิน (รายงาน/Excel)
//
//  ⚠️ คำเตือน: อัตราและเงื่อนไขที่ใช้เป็นค่าเริ่มต้นทั่วไปตามหลัก พ.ร.บ.คุ้มครองแรงงาน
//  สำหรับลูกจ้างรายเดือน เท่านั้น ไม่ใช่คำแนะนำทางกฎหมาย/บัญชีเงินเดือน
//  กรุณาตรวจสอบกับฝ่ายบุคคล/นักบัญชี/ที่ปรึกษากฎหมายแรงงานของบริษัทก่อนใช้จ่ายค่าจ้างจริง
// ============================================================

// ---------- ยูทิลิตี้เวลาพื้นฐาน ----------

// แปลง "HH:MM" -> จำนวนนาทีนับจากเที่ยงคืน
export function hhmmToMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// แปลง timestamp (ISO string หรือ Date) -> milliseconds (epoch)
function toMs(t) {
  if (t instanceof Date) return t.getTime();
  return new Date(t).getTime();
}

// ---------- จับคู่ check-in/check-out หลายรอบต่อวัน ----------
//
// events: [{ type: "in" | "out", time: <ISO string หรือ Date> }, ...]
// ไม่จำเป็นต้องเรียงมาก่อน — ฟังก์ชันนี้จะเรียงตามเวลาให้เอง
//
// คืนค่า:
//   sessions: [{ inTime, outTime, minutes }, ...]  (เฉพาะคู่ที่สมบูรณ์ เข้า-ออก ครบ)
//   openSession: { inTime } หรือ null  (ถ้ามีการเช็คอินค้างไว้ยังไม่เช็คเอาท์)
//   totalMinutes: ผลรวมนาทีที่ทำงานจริงจากทุก session ที่สมบูรณ์
export function pairSessions(events) {
  const sorted = [...(events || [])]
    .filter((e) => e && e.time && (e.type === "in" || e.type === "out"))
    .sort((a, b) => toMs(a.time) - toMs(b.time));

  const sessions = [];
  let pendingIn = null;
  let totalMinutes = 0;

  for (const ev of sorted) {
    if (ev.type === "in") {
      // ถ้ามีการเช็คอินค้างอยู่แล้วโดยไม่มีเช็คเอาท์คั่น ให้ถือว่าอันเก่าถูกแทนที่
      // (ป้องกันข้อมูลผิดปกติ เช่น กดเช็คอินซ้ำ 2 ครั้งติดกัน)
      pendingIn = ev.time;
    } else if (ev.type === "out") {
      if (pendingIn) {
        const minutes = Math.max(0, Math.round((toMs(ev.time) - toMs(pendingIn)) / 60000));
        sessions.push({ inTime: pendingIn, outTime: ev.time, minutes });
        totalMinutes += minutes;
        pendingIn = null;
      }
      // ถ้าเช็คเอาท์มาโดยไม่มีเช็คอินก่อนหน้า -> ข้อมูลผิดปกติ, ข้ามไป (ไม่นับ)
    }
  }

  return {
    sessions,
    openSession: pendingIn ? { inTime: pendingIn } : null,
    totalMinutes,
  };
}

// ---------- จัดประเภทของวัน (workday / holiday / restday) ----------
//
// params:
//   isHoliday          - เป็นวันหยุดนักขัตฤกษ์ของบริษัทหรือไม่
//   isWeeklyDayOff      - เป็นวันหยุดประจำสัปดาห์ปกติของพนักงานคนนี้หรือไม่
//   isSwappedToWork     - พนักงานสลับวันหยุดนี้ไปทำงานแทน (วันนี้เดิมเป็นวันหยุด แต่มาทำงานปกติ)
//   isSwappedDayOff     - วันนี้เดิมเป็นวันทำงานปกติ แต่ถูกสลับให้เป็นวันหยุดแทน (กรณีสลับวันหยุด)
//
// หลักการ: ถ้ามีการ "สลับวันหยุด" ระบบจะจัดการวันทำงานที่สลับให้อัตโนมัติ
//   - isSwappedToWork = true  -> ถือเป็น "workday" ปกติ (จ่าย OT อัตรา 1.5x ไม่ใช่อัตราวันหยุด)
//   - isSwappedDayOff = true  -> ถือเป็น "restday" (วันหยุดของพนักงานคนนี้ แม้จะไม่ตรงวันหยุดประจำสัปดาห์เดิม)
export function classifyDay({ isHoliday = false, isWeeklyDayOff = false, isSwappedToWork = false, isSwappedDayOff = false } = {}) {
  if (isSwappedDayOff) return "restday";
  if (isSwappedToWork) return "workday";
  if (isHoliday) return "holiday";
  if (isWeeklyDayOff) return "restday";
  return "workday";
}

// ---------- คำนวณชั่วโมงทำงาน + OT ของวันเดียว ----------
//
// params:
//   workedMinutes  - นาทีที่ทำงานจริงทั้งหมด (จาก pairSessions().totalMinutes)
//   category       - "workday" | "holiday" | "restday" (จาก classifyDay)
//   otRules        - อ็อบเจกต์ OT_RULES จาก config.js
//   onLeave        - true ถ้าวันนี้ลาเต็มวัน (ไม่ต้องคำนวณ OT จากเวลาเข้า-ออก)
//
// คืนค่า: { category, workedMinutes, regularMinutes, otMinutes, regularHours, otHours,
//           otMultiplier, baseMultiplier, payableMinutesEquivalent }
//
//   payableMinutesEquivalent = "นาทีเทียบเท่าอัตราปกติ" ใช้เป็นตัวเลขอ้างอิงเดียวสำหรับ
//   คำนวณค่าแรง เช่น (regularMinutes * baseMultiplier) + (otMinutes * otMultiplier)
export function calcDayOT(workedMinutes, category, otRules, { onLeave = false } = {}) {
  const rules = otRules || {};
  const threshold = rules.normalWorkMinutesPerDay ?? 480;

  if (onLeave || !workedMinutes || workedMinutes <= 0) {
    return {
      category,
      workedMinutes: 0,
      regularMinutes: 0,
      otMinutes: 0,
      regularHours: 0,
      otHours: 0,
      otMultiplier: 0,
      baseMultiplier: category === "workday" ? 0 : (rules.holidayBaseRate ?? 1),
      payableMinutesEquivalent: 0,
    };
  }

  const regularMinutes = Math.min(workedMinutes, threshold);
  const otMinutes = Math.max(0, workedMinutes - threshold);

  let baseMultiplier;
  let otMultiplier;

  if (category === "holiday" || category === "restday") {
    // วันหยุด/วันหยุดนักขัตฤกษ์: ชั่วโมงปกติจ่ายเพิ่ม (นอกเหนือเงินเดือน) ที่ holidayBaseRate,
    // เกินชั่วโมงปกติจ่าย holidayOtRate
    baseMultiplier = rules.holidayBaseRate ?? 1;
    otMultiplier = rules.holidayOtRate ?? 3;
  } else {
    // วันทำงานปกติ: ชั่วโมงปกติรวมอยู่ในเงินเดือนแล้ว (ไม่คิดเพิ่ม), OT คิดที่ otRateWeekday
    baseMultiplier = 0;
    otMultiplier = rules.otRateWeekday ?? 1.5;
  }

  const payableMinutesEquivalent = regularMinutes * baseMultiplier + otMinutes * otMultiplier;

  return {
    category,
    workedMinutes,
    regularMinutes,
    otMinutes,
    regularHours: round2(regularMinutes / 60),
    otHours: round2(otMinutes / 60),
    otMultiplier,
    baseMultiplier,
    payableMinutesEquivalent,
    payableHoursEquivalent: round2(payableMinutesEquivalent / 60),
  };
}

// ---------- ตรวจสอบมาสาย ----------
//
// shiftStart: "HH:MM" ของกะที่กำหนด, firstCheckIn: ISO string/Date ของการเช็คอินครั้งแรกของวัน
// referenceDate: "YYYY-MM-DD" ของวันที่กะเริ่ม (ใช้ประกอบ shiftStart เป็นเวลาสัมบูรณ์)
export function calcLateMinutes(shiftStart, firstCheckIn, referenceDate, lateThresholdMinutes = 5) {
  if (!shiftStart || !firstCheckIn || !referenceDate) return 0;
  const shiftStartMs = new Date(`${referenceDate}T${shiftStart}:00`).getTime();
  const checkInMs = toMs(firstCheckIn);
  const diffMinutes = Math.round((checkInMs - shiftStartMs) / 60000);
  if (diffMinutes <= lateThresholdMinutes) return 0;
  return diffMinutes;
}

// ---------- สรุปวันเดียวแบบครบวงจร (ใช้เป็นทางลัดหลัก) ----------
//
// input:
//   events        - รายการเช็คอิน/เช็คเอาท์ของวันนั้น (หลายรอบได้)
//   shift         - อ็อบเจกต์กะจาก config.SHIFTS (ต้องมี start, end, crossesMidnight)
//   dayFlags      - { isHoliday, isWeeklyDayOff, isSwappedToWork, isSwappedDayOff }
//   otRules       - config.OT_RULES
//   shiftDate     - "YYYY-MM-DD" วันที่ของกะ (ใช้คำนวณมาสาย)
//   onLeave       - true ถ้าลาเต็มวัน
export function summarizeDay({ events, shift, dayFlags, otRules, shiftDate, onLeave = false }) {
  const { sessions, openSession, totalMinutes } = pairSessions(events);
  const category = classifyDay(dayFlags || {});
  const ot = calcDayOT(totalMinutes, category, otRules, { onLeave });
  const lateMinutes =
    !onLeave && shift && sessions.length
      ? calcLateMinutes(shift.start, sessions[0].inTime, shiftDate, otRules?.lateThresholdMinutes ?? 5)
      : 0;

  return {
    sessions,
    openSession,
    ...ot,
    lateMinutes,
    isLate: lateMinutes > 0,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
