// attendance.js — หน้าหลัก (เช็คอิน/เช็คเอาท์ + สรุปวันนี้) และแท็บประวัติ ฝั่งพนักงาน
import { SHIFTS, HOLIDAYS_2026, OT_RULES } from "./config.js";
import {
  db,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "./firebase-init.js";
import { ATTENDANCE_COLLECTION, SHIFTS_COLLECTION, HOLIDAYS_COLLECTION, SWAPS_COLLECTION } from "./firebase-init.js";
import {
  getShiftById,
  showToast,
  formatDateThai,
  formatTimeShort,
  minutesToHM,
  weekdayNameTh,
  compressImageFile,
  showPhotoLightbox,
} from "./utils.js";
import { summarizeDay, pairSessions } from "./ot-calc.js";
import { getDayFlags, getDayLabel, resolveShiftDate } from "./schedule.js";
import { bi, shiftNameBi } from "./i18n.js";
import { notifyAttendanceEvent } from "./notify.js";

let employee = null;
let liffProfile = null;
let shifts = SHIFTS;
let holidays = HOLIDAYS_2026;
let swaps = [];
let unsubToday = null;
let nextAction = "in"; // ปุ่มเดียว สลับสถานะระหว่าง "in" / "out" ตามเหตุการณ์ล่าสุดของวันนี้
let pendingPunchType = null; // "in" | "out" — รอถ่ายรูปยืนยันตัวตนอยู่
let pendingPositionPromise = null; // Promise ของตำแหน่ง GPS ที่เริ่มขอไว้ตั้งแต่ตอนกดปุ่ม (ให้ทำงานคู่ขนานไปกับตอนถ่ายรูป จะได้ไม่ต้องรอซ้อนกันจนรู้สึกว่าประมวลผลนาน)

export async function initAttendance(emp, profile) {
  employee = emp;
  liffProfile = profile || null;
  await loadReferenceData();
  startClock();
  attachButtons();
  await watchToday();
  setupHistoryTab();
}

async function loadReferenceData() {
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
    const swapsSnap = await getDocs(query(collection(db, SWAPS_COLLECTION), where("employeeId", "==", employee.id)));
    swaps = swapsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("โหลดรายการสลับวันหยุดไม่สำเร็จ", e);
    swaps = [];
  }
}

// กะของวันนี้: กำหนดโดยแอดมินไว้ล่วงหน้าที่หน้าจัดการพนักงาน (employee.shiftId) พนักงานไม่ต้องเลือกเอง
function myShift() {
  return getShiftById(shifts, employee.shiftId) || shifts[0] || null;
}

// ---------- นาฬิกาสด ----------
function startClock() {
  tickClock();
  setInterval(tickClock, 1000);
}
function tickClock() {
  const now = new Date();
  const clockNow = document.getElementById("clock-now");
  const clockDate = document.getElementById("clock-date");
  if (clockNow) clockNow.textContent = now.toLocaleTimeString("th-TH", { hour12: false });
  if (clockDate) clockDate.textContent = `${bi("วัน", "")}${weekdayNameTh(shiftDateStr(now))} ${formatDateThai(shiftDateStr(now))}`;
}
function shiftDateStr(now) {
  return resolveShiftDate(myShift(), now);
}

// ---------- ติดตามข้อมูลวันนี้แบบเรียลไทม์ ----------
// กะและ "วันกะ" ของวันนี้คำนวณจาก employee.shiftId (แอดมินกำหนดไว้ล่วงหน้า) เสมอ — ไม่ต้องรอผู้ใช้เลือก
async function watchToday() {
  const shift = myShift();
  const shiftDate = resolveShiftDate(shift, new Date());
  subscribeToday(shift, shiftDate);
}

function subscribeToday(shift, shiftDate) {
  const punchBtn = document.getElementById("btn-punch");
  if (punchBtn) {
    punchBtn.style.display = "";
    punchBtn.disabled = false;
  }
  const ref = doc(db, ATTENDANCE_COLLECTION, `${employee.id}_${shiftDate}`);
  if (unsubToday) unsubToday();
  unsubToday = onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? snap.data() : { events: [] };
      renderToday(shift, shiftDate, data.events || []);
    },
    (err) => {
      console.error("onSnapshot วันนี้ล้มเหลว", err);
    }
  );
}

function renderToday(shift, shiftDate, events) {
  // ป้ายกะวันนี้
  const shiftBadgeWrap = document.getElementById("shift-today-badge-wrap");
  if (shift) {
    shiftBadgeWrap.innerHTML = `<span class="shift-today-badge" style="background:${shift.color}22; color:${shift.color};">🕒 ${shiftNameBi(shift.name)} (${shift.start}-${shift.end})</span>`;
  } else {
    shiftBadgeWrap.innerHTML = `<span class="shift-today-badge" style="background:#f1f5f9; color:#64748b;">${bi("ยังไม่ได้กำหนดกะการทำงาน — กรุณาติดต่อแอดมิน", "No shift assigned yet — please contact admin")}</span>`;
  }

  // ป้ายประเภทวัน (วันทำงาน/วันหยุด/สลับวันหยุด)
  const dayFlags = getDayFlags({ date: shiftDate, employee, holidays, swaps });
  const label = getDayLabel(dayFlags);
  document.getElementById("day-flag-badge-wrap").innerHTML =
    `<span class="day-flag-badge" style="background:${label.color}22; color:${label.color}; margin-left:6px;">${label.text}</span>`;

  // ปุ่มเช็คอิน/เช็คเอาท์แบบวงกลมปุ่มเดียว: สลับสถานะตามเหตุการณ์ล่าสุด
  const sorted = [...events].sort((a, b) => new Date(a.time) - new Date(b.time));
  const last = sorted[sorted.length - 1];
  const isClockedIn = last && last.type === "in";
  nextAction = isClockedIn ? "out" : "in";

  const punchBtn = document.getElementById("btn-punch");
  const iconEl = document.getElementById("btn-punch-icon");
  const labelEl = document.getElementById("btn-punch-label");
  if (punchBtn) {
    punchBtn.classList.toggle("punch-out", isClockedIn);
    iconEl.textContent = isClockedIn ? "🔴" : "🟢";
    labelEl.textContent = isClockedIn ? bi("เช็คเอาท์", "Check-out") : bi("เช็คอิน", "Check-in");
  }

  // สรุปวันนี้ (ใช้เครื่องคำนวณ OT ตัวเดียวกับที่แอดมินใช้ทำรายงาน)
  const summary = summarizeDay({
    events,
    shift,
    dayFlags,
    otRules: OT_RULES,
    shiftDate,
  });

  document.getElementById("today-summary-grid").innerHTML = `
    <div class="day-summary-item">
      <div class="val">${minutesToHM(summary.workedMinutes)}</div>
      <div class="lbl">${bi("ทำงานรวม", "Total worked")}</div>
    </div>
    <div class="day-summary-item">
      <div class="val">${minutesToHM(summary.regularMinutes)}</div>
      <div class="lbl">${bi("ชั่วโมงปกติ", "Regular hours")}</div>
    </div>
    <div class="day-summary-item">
      <div class="val" style="color:${summary.otMinutes > 0 ? '#f59e0b' : '#94a3b8'};">${minutesToHM(summary.otMinutes)}</div>
      <div class="lbl">OT (${summary.otMultiplier || 0}x)</div>
    </div>
  `;

  // รายการช่วงเวลาเข้า-ออกวันนี้
  const { sessions, openSession } = pairSessions(events);
  let html = "";
  sessions.forEach((s, i) => {
    html += `
      <div class="session-row">
        <div>
          <div class="session-times">${bi(`รอบที่ ${i + 1}`, `Session ${i + 1}`)}: ${formatTimeShort(s.inTime)} - ${formatTimeShort(s.outTime)} ${mapLinkFor(s.inTime, events)}${photoIconFor(s.inTime, events, "data-photo-time")}</div>
        </div>
        <div class="session-dur">${minutesToHM(s.minutes)}</div>
      </div>`;
  });
  if (openSession) {
    html += `
      <div class="session-row" style="border-color:#10b981;">
        <div class="session-times">🟢 ${bi("เข้างานเมื่อ", "Checked in at")} ${formatTimeShort(openSession.inTime)} (${bi("กำลังทำงาน...", "working now...")}) ${mapLinkFor(openSession.inTime, events)}${photoIconFor(openSession.inTime, events, "data-photo-time")}</div>
      </div>`;
  }
  if (!sessions.length && !openSession) {
    html = `<div class="empty-state" style="padding:16px;"><span class="emoji">🕒</span>${bi("ยังไม่มีการเช็คอินวันนี้", "No check-in yet today")}</div>`;
  }
  if (summary.isLate) {
    html =
      `<div class="session-row" style="border-color:#ef4444; color:#ef4444;">⚠️ ${bi(`มาสาย ${summary.lateMinutes} นาที`, `Late by ${summary.lateMinutes} min`)}</div>` +
      html;
  }
  document.getElementById("today-session-log").innerHTML = html;
  document.getElementById("today-session-log").querySelectorAll("[data-photo-time]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ev = (events || []).find((e) => e.time === btn.dataset.photoTime && e.photo);
      if (ev) showPhotoLightbox(ev.photo);
    });
  });
}

// หาพิกัดที่บันทึกไว้คู่กับเวลาเช็คอินที่ตรงกัน แล้วคืนลิงก์เปิดแผนที่แบบสั้นๆ (ถ้ามี)
function mapLinkFor(inTimeIso, events) {
  const ev = (events || []).find((e) => e.time === inTimeIso && e.lat != null && e.lng != null);
  if (!ev) return "";
  return `<a href="https://www.google.com/maps?q=${ev.lat},${ev.lng}" target="_blank" rel="noopener" style="margin-left:4px;">📍</a>`;
}

// ปุ่มดูรูปยืนยันตัวตนที่ถ่ายไว้ตอนเช็คอิน/เช็คเอาท์ครั้งนั้น (ถ้ามี)
function photoIconFor(inTimeIso, events, attrName) {
  const ev = (events || []).find((e) => e.time === inTimeIso && e.photo);
  if (!ev) return "";
  return ` <button type="button" class="photo-view-btn" ${attrName}="${ev.time}">📷</button>`;
}

// ---------- ปุ่มเช็คอิน/เช็คเอาท์ (ปุ่มเดียว สลับสถานะเอง) — บังคับถ่ายรูปยืนยันตัวตนก่อนบันทึกทุกครั้ง ----------
function attachButtons() {
  const punchBtn = document.getElementById("btn-punch");
  if (punchBtn) punchBtn.addEventListener("click", () => beginPunch(nextAction));

  const photoInput = document.getElementById("punch-photo-input");
  if (photoInput) {
    photoInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      photoInput.value = ""; // เคลียร์ค่าไว้ เพื่อให้เลือก/ถ่ายไฟล์เดิมซ้ำได้ในครั้งถัดไป
      if (!file) {
        setPhotoStatus("");
        setPunchDisabled(false);
        setGeoStatus("");
        showToast(bi("⚠️ ต้องถ่ายรูปเพื่อยืนยันตัวตนก่อนบันทึกเวลา", "⚠️ You must take a photo to verify identity before recording time"));
        pendingPunchType = null;
        pendingPositionPromise = null;
        return;
      }
      await finishPunchWithPhoto(file);
    });
  }
}

function setPunchDisabled(disabled) {
  const punchBtn = document.getElementById("btn-punch");
  if (punchBtn) punchBtn.disabled = disabled;
}

function setPhotoStatus(text) {
  const el = document.getElementById("photo-status-line");
  if (el) el.textContent = text;
}

// ขั้นที่ 1: กดปุ่มเช็คอิน/เช็คเอาท์ -> เปิดกล้องหน้าให้ถ่ายรูปยืนยันตัวตนก่อนเสมอ (บังคับทุกครั้ง กันสวมรอย)
function beginPunch(type) {
  pendingPunchType = type;
  setPunchDisabled(true);
  setPhotoStatus(bi("📷 กรุณาถ่ายรูปเพื่อยืนยันตัวตน...", "📷 Please take a photo to verify identity..."));
  // เริ่มขอพิกัด GPS "ทันที" ให้ทำงานคู่ขนานไปกับช่วงที่ผู้ใช้กำลังถ่ายรูป/รอกล้องเปิด
  // (แทนที่จะรอจนถ่ายรูปเสร็จค่อยเริ่มขอพิกัดทีหลัง) ช่วยลดเวลารอรวมที่รู้สึกว่า "ประมวลผลนาน" ได้มาก
  setGeoStatus(bi("📍 กำลังระบุตำแหน่ง...", "📍 Getting your location..."));
  pendingPositionPromise = getCurrentPosition();
  const input = document.getElementById("punch-photo-input");
  if (!input) {
    setPunchDisabled(false);
    return;
  }
  input.click();
  // เผื่อกรณีเบราว์เซอร์บางตัวไม่ยิง event "change" ตอนผู้ใช้กด "ยกเลิก" ในหน้าต่างกล้อง —
  // ถ้ากลับมาที่หน้าเว็บแล้วยังไม่มีไฟล์ถูกเลือกภายในไม่กี่ร้อย ms ให้ปลดล็อกปุ่มกลับคืน
  const onFocusBack = () => {
    window.removeEventListener("focus", onFocusBack);
    setTimeout(() => {
      if (pendingPunchType && (!input.files || !input.files.length)) {
        pendingPunchType = null;
        setPunchDisabled(false);
        setPhotoStatus("");
      }
    }, 800);
  };
  window.addEventListener("focus", onFocusBack);
}

// ขั้นที่ 2: ได้รูปจากกล้องแล้ว -> บีบอัดรูป -> บันทึกเวลา+รูปจริงลง Firestore
async function finishPunchWithPhoto(file) {
  setPhotoStatus(bi("📷 กำลังประมวลผลรูป...", "📷 Processing photo..."));
  let photoDataUrl = null;
  try {
    photoDataUrl = await compressImageFile(file);
  } catch (e) {
    console.error(e);
    showToast(`❌ ${e && e.message ? e.message : bi("ประมวลผลรูปไม่สำเร็จ กรุณาลองใหม่", "Failed to process photo, please try again")}`);
    setPunchDisabled(false);
    setPhotoStatus("");
    setGeoStatus("");
    pendingPunchType = null;
    pendingPositionPromise = null;
    return;
  }
  const type = pendingPunchType;
  pendingPunchType = null;
  await recordEvent(type, photoDataUrl);
  setPhotoStatus("");
}

function setGeoStatus(text) {
  const el = document.getElementById("geo-status-line");
  if (el) el.textContent = text;
}

// ขอพิกัด GPS ปัจจุบัน — ⚠️ ตอนนี้ "บังคับ" ต้องได้ตำแหน่งก่อนถึงจะเช็คอิน/เช็คเอาท์ได้ (ตามที่แจ้งว่า
// ตำแหน่งหายไปสำหรับพนักงานบางคน จึงเปลี่ยนจาก "ไม่บล็อกถ้าขอไม่สำเร็จ" เป็น "บล็อกและแจ้งเหตุผลชัดเจน")
// คืนค่า { lat, lng } ถ้าสำเร็จ หรือ { error: "denied" | "unsupported" | "timeout" | "unavailable" } ถ้าไม่สำเร็จ
// ตั้ง timeout สำรองไว้อีกชั้นด้วย setTimeout ของเราเอง เพราะเบราว์เซอร์ในแอป LINE บางรุ่น
// (โดยเฉพาะ iOS) บางครั้งไม่ยิง callback กลับมาเลยแม้จะตั้งค่า timeout ในพารามิเตอร์ของ
// getCurrentPosition ไว้แล้วก็ตาม — ถ้าไม่มีตัวกันสำรองนี้ การเช็คอินจะค้างรอไม่มีที่สิ้นสุด
function getCurrentPosition(timeoutMs = 15000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      resolve(val);
    };
    if (!navigator.geolocation) return finish({ error: "unsupported" });
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => finish({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          const code = err && err.code;
          // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT (มาตรฐาน GeolocationPositionError)
          finish({ error: code === 1 ? "denied" : code === 3 ? "timeout" : "unavailable" });
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
      );
    } catch (e) {
      finish({ error: "unavailable" });
    }
    setTimeout(() => finish({ error: "timeout" }), timeoutMs + 2000);
  });
}

// แปลผลเหตุผลที่ขอตำแหน่งไม่สำเร็จ ให้เป็นข้อความที่พนักงานเข้าใจและแก้ไขได้เอง
function geoErrorMessage(errCode) {
  if (errCode === "denied") {
    return bi(
      "ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง (Location) กรุณาเปิดสิทธิ์การเข้าถึงตำแหน่งให้เว็บไซต์/แอปนี้ในการตั้งค่าเบราว์เซอร์หรือแอป LINE แล้วลองใหม่",
      "Location access was denied. Please allow location access for this site in your browser or LINE app settings, then try again"
    );
  }
  if (errCode === "unsupported") {
    return bi(
      "อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง (GPS) กรุณาติดต่อแอดมิน",
      "This device/browser does not support location (GPS). Please contact your admin"
    );
  }
  return bi(
    "ไม่สามารถระบุตำแหน่งได้ (สัญญาณ GPS อ่อนหรือใช้เวลานานเกินไป) กรุณาออกไปที่โล่งหรือเปิด Wi-Fi/เน็ตมือถือแล้วลองใหม่อีกครั้ง",
    "Could not determine your location (weak GPS signal or it timed out). Please move to an open area or enable Wi-Fi/mobile data, then try again"
  );
}

// ครอบ Promise ใดๆ ด้วยเวลาสูงสุดที่ยอมรอ — กันไม่ให้การเช็คอินค้างรอไม่มีที่สิ้นสุดถ้าเน็ต/Firestore
// มีปัญหาแบบเงียบๆ (ไม่ throw error ทันที แต่ก็ไม่ตอบกลับมาเลย) ผู้ใช้จะได้เห็นข้อความแจ้งเตือนแทนที่
// จะเห็นแค่ "กำลังประมวลผล" ค้างอยู่แบบไม่รู้จบ
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} ใช้เวลานานเกินไป`)), ms)),
  ]);
}

async function recordEvent(type, photoDataUrl) {
  const shift = myShift();
  const now = new Date();
  const shiftDate = resolveShiftDate(shift, now);
  const ref = doc(db, ATTENDANCE_COLLECTION, `${employee.id}_${shiftDate}`);

  // ใช้พิกัดที่เริ่มขอไว้แล้วตั้งแต่ตอนกดปุ่ม (คู่ขนานกับตอนถ่ายรูป) ถ้ามี ไม่ต้องขอใหม่ซ้ำอีกรอบ
  const posResult = await (pendingPositionPromise || getCurrentPosition());
  pendingPositionPromise = null;

  // ⚠️ บังคับต้องมีตำแหน่ง GPS ก่อนถึงจะเช็คอิน/เช็คเอาท์ได้ (ตามที่แจ้งว่าตำแหน่งหายไปสำหรับบางคน) —
  // ถ้าขอตำแหน่งไม่สำเร็จ ยกเลิกการบันทึกเวลาทั้งหมด (รวมถึงรูปที่เพิ่งถ่ายไป) ผู้ใช้ต้องกดปุ่มใหม่อีกครั้ง
  if (!posResult || posResult.error) {
    setGeoStatus(bi("📍 ไม่สามารถระบุตำแหน่งได้", "📍 Could not get your location"));
    showToast(`❌ ${geoErrorMessage(posResult && posResult.error)}`);
    setPunchDisabled(false);
    return;
  }
  const pos = posResult;
  setGeoStatus(bi("📍 บันทึกตำแหน่งที่เช็คอิน/เอาท์แล้ว", "📍 Check-in/out location recorded"));

  try {
    const snap = await withTimeout(getDoc(ref), 15000, "ตรวจสอบข้อมูลเดิม");
    const existingEvents = snap.exists() ? snap.data().events || [] : [];
    const newEvent = {
      type,
      time: now.toISOString(),
      ...(pos ? { lat: pos.lat, lng: pos.lng } : {}),
      ...(photoDataUrl ? { photo: photoDataUrl } : {}),
    };
    await withTimeout(
      setDoc(
        ref,
        {
          employeeId: employee.id,
          employeeName: employee.name,
          date: shiftDate,
          shiftId: shift ? shift.id : null,
          events: [...existingEvents, newEvent],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
      15000,
      "บันทึกเวลา"
    );
    showToast(type === "in" ? bi("✅ เช็คอินสำเร็จ", "✅ Check-in successful") : bi("✅ เช็คเอาท์สำเร็จ", "✅ Check-out successful"));
    // แจ้งเตือนเข้า LINE ของตัวเอง/หัวหน้าทีม/แอดมิน — ส่งผ่าน Netlify Function (ดู js/notify.js) ไม่ใช้
    // liff.sendMessages() (ซึ่งจะโพสต์เข้าห้องแชทที่เปิดแอปอยู่ อาจหลุดไปห้องแชทกลุ่มได้) ไม่ต้องรอผลเสร็จ
    // ก่อน (fire-and-forget) เพราะถ้าส่งแจ้งเตือนไม่สำเร็จก็ไม่ควรทำให้ผู้ใช้เห็นว่าการบันทึกเวลาล้มเหลวไปด้วย
    notifyAttendanceEvent(employee, type === "in", now, pos).catch((e) => console.warn("แจ้งเตือน LINE ไม่สำเร็จ", e));
    // รีเฟรช listener เสมอ (เผื่อกะข้ามเที่ยงคืน หรือเพิ่งเช็คอินครั้งแรกของวันไปหมาดๆ)
    await watchToday();
  } catch (e) {
    console.error(e);
    showToast(bi("❌ บันทึกเวลาไม่สำเร็จ อินเทอร์เน็ตอาจช้าหรือไม่เสถียร กรุณาลองใหม่", "❌ Failed to record time. Your internet may be slow or unstable, please try again"));
  } finally {
    setPunchDisabled(false);
  }
}

// ---------- แท็บประวัติ ----------
function setupHistoryTab() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  document.getElementById("hist-from").value = toInputDate(firstOfMonth);
  document.getElementById("hist-to").value = toInputDate(today);
  document.getElementById("hist-search-btn").addEventListener("click", loadHistory);
  loadHistory();
}

function toInputDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function loadHistory() {
  const from = document.getElementById("hist-from").value;
  const to = document.getElementById("hist-to").value;
  const listEl = document.getElementById("history-list");
  listEl.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;

  try {
    const snap = await getDocs(query(collection(db, ATTENDANCE_COLLECTION), where("employeeId", "==", employee.id)));
    let records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    records = records.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
    records.sort((a, b) => (a.date < b.date ? 1 : -1));

    if (!records.length) {
      listEl.innerHTML = `<div class="empty-state"><span class="emoji">📭</span>${bi("ไม่พบข้อมูลในช่วงวันที่ที่เลือก", "No records found for the selected date range")}</div>`;
      return;
    }

    listEl.innerHTML = records
      .map((r) => {
        const shift = getShiftById(shifts, r.shiftId);
        const dayFlags = getDayFlags({ date: r.date, employee, holidays, swaps });
        const label = getDayLabel(dayFlags);
        const summary = summarizeDay({ events: r.events || [], shift, dayFlags, otRules: OT_RULES, shiftDate: r.date });
        return `
          <div class="history-row">
            <div>
              <div class="hr-date">${formatDateThai(r.date)}</div>
              <div class="hr-meta">
                ${shift ? shiftNameBi(shift.name) : bi("ไม่มีกะ", "No shift")}
                <span class="day-flag-badge" style="background:${label.color}22; color:${label.color}; margin-left:6px;">${label.text}</span>
                ${summary.isLate ? `<span style="color:#ef4444;"> • ${bi(`สาย ${summary.lateMinutes} น.`, `Late ${summary.lateMinutes} min`)}</span>` : ""}
              </div>
            </div>
            <div class="hr-hours">
              ${minutesToHM(summary.workedMinutes)}
              ${summary.otMinutes > 0 ? `<div class="hr-ot">OT ${minutesToHM(summary.otMinutes)}</div>` : ""}
            </div>
          </div>`;
      })
      .join("");
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<div class="empty-state">${bi("เกิดข้อผิดพลาดในการโหลดข้อมูล", "Failed to load data")}</div>`;
  }
}
