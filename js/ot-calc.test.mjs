// Self-tests สำหรับ ot-calc.js — รันด้วย: node js/ot-calc.test.mjs
import {
  hhmmToMinutes,
  pairSessions,
  classifyDay,
  calcDayOT,
  calcLateMinutes,
  summarizeDay,
} from "./ot-calc.js";

let pass = 0;
let fail = 0;

function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    // console.log(`✓ ${label}`);
  } else {
    fail++;
    console.log(`✗ ${label}`);
    console.log(`   expected: ${JSON.stringify(expected)}`);
    console.log(`   actual:   ${JSON.stringify(actual)}`);
  }
}

function assertTrue(cond, label) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`✗ ${label}`);
  }
}

// ---------- hhmmToMinutes ----------
assertEqual(hhmmToMinutes("08:00"), 480, "hhmmToMinutes 08:00");
assertEqual(hhmmToMinutes("00:00"), 0, "hhmmToMinutes 00:00");
assertEqual(hhmmToMinutes("23:59"), 1439, "hhmmToMinutes 23:59");

// ---------- pairSessions: single session ----------
{
  const events = [
    { type: "in", time: "2026-07-03T08:00:00" },
    { type: "out", time: "2026-07-03T17:00:00" },
  ];
  const { sessions, totalMinutes, openSession } = pairSessions(events);
  assertEqual(sessions.length, 1, "single session count");
  assertEqual(totalMinutes, 540, "single session total minutes (9h)");
  assertEqual(openSession, null, "single session no open session");
}

// ---------- pairSessions: multiple sessions in one day (lunch break gap excluded) ----------
{
  const events = [
    { type: "in", time: "2026-07-03T08:00:00" },
    { type: "out", time: "2026-07-03T12:00:00" }, // เช้า 4 ชม.
    { type: "in", time: "2026-07-03T13:00:00" },
    { type: "out", time: "2026-07-03T18:00:00" }, // บ่าย 5 ชม.
  ];
  const { sessions, totalMinutes } = pairSessions(events);
  assertEqual(sessions.length, 2, "multi-session count");
  assertEqual(totalMinutes, 9 * 60, "multi-session total excludes lunch gap (9h worked)");
}

// ---------- pairSessions: night shift crossing midnight ----------
{
  const events = [
    { type: "in", time: "2026-07-03T21:00:00" },
    { type: "out", time: "2026-07-04T06:00:00" },
  ];
  const { totalMinutes } = pairSessions(events);
  assertEqual(totalMinutes, 9 * 60, "night shift crossing midnight = 9h");
}

// ---------- pairSessions: unsorted input still pairs correctly ----------
{
  const events = [
    { type: "out", time: "2026-07-03T17:00:00" },
    { type: "in", time: "2026-07-03T08:00:00" },
  ];
  const { totalMinutes } = pairSessions(events);
  assertEqual(totalMinutes, 540, "unsorted events still pair correctly");
}

// ---------- pairSessions: open session (still clocked in) ----------
{
  const events = [{ type: "in", time: "2026-07-03T08:00:00" }];
  const { sessions, openSession, totalMinutes } = pairSessions(events);
  assertEqual(sessions.length, 0, "open session -> no completed sessions");
  assertTrue(openSession && openSession.inTime === "2026-07-03T08:00:00", "open session captured");
  assertEqual(totalMinutes, 0, "open session contributes 0 minutes");
}

// ---------- pairSessions: duplicate check-in ignores stale pending-in ----------
{
  const events = [
    { type: "in", time: "2026-07-03T08:00:00" },
    { type: "in", time: "2026-07-03T08:05:00" }, // กดซ้ำโดยไม่ได้ตั้งใจ
    { type: "out", time: "2026-07-03T17:00:00" },
  ];
  const { sessions, totalMinutes } = pairSessions(events);
  assertEqual(sessions.length, 1, "duplicate check-in still yields 1 session");
  assertEqual(totalMinutes, 8 * 60 + 55, "duplicate check-in uses latest in-time");
}

// ---------- classifyDay ----------
assertEqual(classifyDay({}), "workday", "classifyDay default = workday");
assertEqual(classifyDay({ isHoliday: true }), "holiday", "classifyDay holiday");
assertEqual(classifyDay({ isWeeklyDayOff: true }), "restday", "classifyDay weekly day off = restday");
assertEqual(
  classifyDay({ isWeeklyDayOff: true, isSwappedToWork: true }),
  "workday",
  "classifyDay swapped-to-work overrides weekly day off -> workday"
);
assertEqual(
  classifyDay({ isHoliday: true, isSwappedToWork: true }),
  "workday",
  "classifyDay swapped-to-work overrides holiday -> workday"
);
assertEqual(
  classifyDay({ isSwappedDayOff: true }),
  "restday",
  "classifyDay swapped-day-off on an otherwise normal workday -> restday"
);

// ---------- calcDayOT ----------
const OT_RULES = {
  normalWorkMinutesPerDay: 480,
  otRateWeekday: 1.5,
  holidayBaseRate: 1,
  holidayOtRate: 3,
  lateThresholdMinutes: 5,
};

{
  // วันทำงานปกติ ทำงานพอดี 8 ชม. -> ไม่มี OT
  const r = calcDayOT(480, "workday", OT_RULES);
  assertEqual(r.regularMinutes, 480, "workday exact 8h -> regularMinutes=480");
  assertEqual(r.otMinutes, 0, "workday exact 8h -> otMinutes=0");
  assertEqual(r.payableMinutesEquivalent, 0, "workday base already in salary -> payable OT-only = 0");
}

{
  // วันทำงานปกติ ทำงาน 10 ชม. -> OT 2 ชม. x1.5
  const r = calcDayOT(600, "workday", OT_RULES);
  assertEqual(r.regularMinutes, 480, "workday 10h -> regularMinutes=480");
  assertEqual(r.otMinutes, 120, "workday 10h -> otMinutes=120");
  assertEqual(r.otHours, 2, "workday 10h -> otHours=2");
  assertEqual(r.payableMinutesEquivalent, 120 * 1.5, "workday 10h -> payable = 120*1.5");
}

{
  // วันหยุด ทำงาน 8 ชม. -> จ่ายฐาน 1x เต็ม 8 ชม. ไม่มี OT
  const r = calcDayOT(480, "holiday", OT_RULES);
  assertEqual(r.regularMinutes, 480, "holiday 8h -> regularMinutes=480");
  assertEqual(r.otMinutes, 0, "holiday 8h -> otMinutes=0");
  assertEqual(r.payableMinutesEquivalent, 480 * 1, "holiday 8h -> payable = 480*1");
}

{
  // วันหยุด ทำงาน 10 ชม. -> ฐาน 8ชม.x1 + OT 2ชม.x3
  const r = calcDayOT(600, "holiday", OT_RULES);
  assertEqual(r.regularMinutes, 480, "holiday 10h -> regularMinutes=480");
  assertEqual(r.otMinutes, 120, "holiday 10h -> otMinutes=120");
  assertEqual(r.payableMinutesEquivalent, 480 * 1 + 120 * 3, "holiday 10h -> payable = 480*1+120*3");
}

{
  // restday ใช้อัตราเดียวกับ holiday
  const r = calcDayOT(600, "restday", OT_RULES);
  assertEqual(r.payableMinutesEquivalent, 480 * 1 + 120 * 3, "restday 10h -> payable = 480*1+120*3");
}

{
  // ลาเต็มวัน -> ไม่มีชั่วโมงทำงาน/OT เลย
  const r = calcDayOT(0, "workday", OT_RULES, { onLeave: true });
  assertEqual(r.workedMinutes, 0, "onLeave -> workedMinutes=0");
  assertEqual(r.otMinutes, 0, "onLeave -> otMinutes=0");
}

{
  // ไม่ได้มาทำงานเลย (ไม่ใช่ลา ไม่ใช่ทำงาน) -> ก็เป็น 0 เหมือนกัน แต่ category ยังคงอยู่
  const r = calcDayOT(0, "workday", OT_RULES);
  assertEqual(r.workedMinutes, 0, "no work, no leave -> workedMinutes=0");
}

// ---------- calcLateMinutes ----------
{
  const late = calcLateMinutes("08:00", "2026-07-03T08:10:00", "2026-07-03", 5);
  assertEqual(late, 10, "late by 10 minutes (threshold 5) -> reported as 10");
}
{
  const notLate = calcLateMinutes("08:00", "2026-07-03T08:03:00", "2026-07-03", 5);
  assertEqual(notLate, 0, "within threshold (3 min <= 5 min) -> not late");
}
{
  const early = calcLateMinutes("08:00", "2026-07-03T07:55:00", "2026-07-03", 5);
  assertEqual(early, 0, "arriving early -> not late");
}

// ---------- summarizeDay: full integration ----------
{
  const shift = { id: "morning", name: "กะเช้า", start: "08:00", end: "17:00", breakMinutes: 60, crossesMidnight: false };
  const events = [
    { type: "in", time: "2026-07-03T08:10:00" }, // สาย 10 นาที
    { type: "out", time: "2026-07-03T12:00:00" },
    { type: "in", time: "2026-07-03T13:00:00" },
    { type: "out", time: "2026-07-03T19:00:00" }, // ทำต่อ OT ตอนเย็น
  ];
  const result = summarizeDay({
    events,
    shift,
    dayFlags: { isWeeklyDayOff: false, isHoliday: false },
    otRules: OT_RULES,
    shiftDate: "2026-07-03",
  });
  // ทำงานจริง: (12:00-08:10=3h50m) + (19:00-13:00=6h) = 9h50m = 590 นาที
  assertEqual(result.workedMinutes, 590, "summarizeDay integration workedMinutes");
  assertEqual(result.category, "workday", "summarizeDay integration category");
  assertEqual(result.regularMinutes, 480, "summarizeDay integration regularMinutes");
  assertEqual(result.otMinutes, 110, "summarizeDay integration otMinutes");
  assertTrue(result.isLate, "summarizeDay integration isLate=true");
  assertEqual(result.lateMinutes, 10, "summarizeDay integration lateMinutes");
}

// ---------- summarizeDay: night shift crossing midnight, on a company holiday ----------
{
  const shift = { id: "night", name: "กะดึก", start: "21:00", end: "06:00", breakMinutes: 60, crossesMidnight: true };
  const events = [
    { type: "in", time: "2026-01-01T21:00:00" }, // วันขึ้นปีใหม่ (วันหยุดนักขัตฤกษ์)
    { type: "out", time: "2026-01-02T06:00:00" },
  ];
  const result = summarizeDay({
    events,
    shift,
    dayFlags: { isHoliday: true },
    otRules: OT_RULES,
    shiftDate: "2026-01-01",
  });
  assertEqual(result.workedMinutes, 540, "night-shift-holiday workedMinutes = 9h");
  assertEqual(result.category, "holiday", "night-shift-holiday category");
  assertEqual(result.regularMinutes, 480, "night-shift-holiday regularMinutes");
  assertEqual(result.otMinutes, 60, "night-shift-holiday otMinutes");
  assertEqual(result.payableMinutesEquivalent, 480 * 1 + 60 * 3, "night-shift-holiday payable");
}

// ---------- summarizeDay: day-off swap (สลับวันหยุด) ----------
{
  // พนักงานคนนี้วันหยุดประจำสัปดาห์คือวันอาทิตย์ แต่สลับมาทำงานวันนี้แทน (isSwappedToWork)
  const shift = { id: "office", name: "กะออฟฟิศ", start: "09:00", end: "18:00", breakMinutes: 60, crossesMidnight: false };
  const events = [
    { type: "in", time: "2026-07-05T09:00:00" }, // สมมติวันอาทิตย์ที่ 5 ก.ค. 2026
    { type: "out", time: "2026-07-05T13:00:00" }, // เช้า 4 ชม.
    { type: "in", time: "2026-07-05T14:00:00" }, // พักเที่ยง 1 ชม. (ไม่นับเป็นเวลาทำงาน)
    { type: "out", time: "2026-07-05T18:00:00" }, // บ่าย 4 ชม.
  ];
  const result = summarizeDay({
    events,
    shift,
    dayFlags: { isWeeklyDayOff: true, isSwappedToWork: true },
    otRules: OT_RULES,
    shiftDate: "2026-07-05",
  });
  assertEqual(result.category, "workday", "day-off-swap treated as workday (not restday rate)");
  assertEqual(result.workedMinutes, 480, "day-off-swap workedMinutes = 8h exact (lunch gap excluded)");
  assertEqual(result.otMinutes, 0, "day-off-swap no OT since exactly 8h");
  assertEqual(result.payableMinutesEquivalent, 0, "day-off-swap: no extra holiday pay, normal workday rules apply");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
