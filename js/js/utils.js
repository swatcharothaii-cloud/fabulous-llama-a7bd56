// ยูทิลิตี้ที่ใช้ร่วมกันทั้งฝั่งพนักงานและฝั่งแอดมิน
import { getLang } from "./i18n.js";

// ---------- LINE LIFF SDK ----------
// เช็คว่า LIFF SDK (สคริปต์ที่ฝังไว้ใน <head>) โหลดสำเร็จหรือยัง — ถ้ายัง (เช่น เน็ตหลุด/ช้าตอนโหลด
// หน้าเว็บครั้งแรกพอดี หรือเครือข่ายบางแห่งบล็อก CDN บางตัว) จะลองโหลดซ้ำแบบไดนามิกให้อัตโนมัติ โดย
// ลองที่ CDN ทางการของ LINE เอง (static.line-scdn.net — ตัวหลักที่ฝังไว้ใน <head> อยู่แล้ว น่าเชื่อถือ
// และเสถียรกว่าเพราะเป็นโดเมนเดียวกับที่แอป LINE เรียกใช้งานปกติ) ก่อน แล้วค่อยลอง jsdelivr (mirror
// ผ่าน npm) เป็นตัวสำรองอีกชั้นถ้าตัวหลักยังใช้ไม่ได้จริงๆ — ช่วยกันปัญหา "ยังไม่ได้ตั้งค่า LIFF" ที่
// จริงๆ ตั้งค่าไว้ถูกต้องแล้ว แค่โหลดสคริปต์ไม่สำเร็จตอนนั้นพอดี
const LIFF_SDK_URLS = [
  "https://static.line-scdn.net/liff/edge/versions/2.24.0/sdk.js",
  "https://cdn.jsdelivr.net/npm/@line/liff@2.24.0/dist/liff.js",
];
let liffScriptRetryPromise = null;
export function ensureLiffLoaded(timeoutMs = 6000) {
  if (typeof liff !== "undefined") return Promise.resolve(true);
  if (liffScriptRetryPromise) return liffScriptRetryPromise;
  liffScriptRetryPromise = loadLiffFromUrls(LIFF_SDK_URLS.slice(), timeoutMs);
  return liffScriptRetryPromise;
}

function loadLiffFromUrls(urls, timeoutMs) {
  const url = urls.shift();
  if (!url) return Promise.resolve(typeof liff !== "undefined");
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      resolve(val);
    };
    const script = document.createElement("script");
    script.charset = "utf-8";
    script.src = url;
    script.onload = () => finish(typeof liff !== "undefined");
    script.onerror = () => finish(false);
    document.head.appendChild(script);
    setTimeout(() => finish(typeof liff !== "undefined"), timeoutMs);
  }).then((ok) => {
    if (ok) return true;
    if (!urls.length) return false;
    return loadLiffFromUrls(urls, timeoutMs); // ตัวหลักยังไม่สำเร็จ ลองตัวสำรองถัดไป
  });
}

export function showToast(msg, ms = 2600) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- วันที่/เวลา ----------

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function nowTimeStr() {
  const d = new Date();
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDateThai(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(`${dateStr}T00:00:00`);
  // ภาษาอังกฤษ: ใช้ locale en-GB (ปีคริสต์ศักราชปกติ) ภาษาไทย: ใช้ th-TH (ปีพุทธศักราชตามปกติ)
  const locale = getLang() === "en" ? "en-GB" : "th-TH";
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric", weekday: "short" });
}

export function formatTimeShort(isoOrDate) {
  if (!isoOrDate) return "-";
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export function minutesToHM(minutes) {
  const m = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  const unit = getLang() === "en" ? "h" : "ชม.";
  return `${h}:${String(rem).padStart(2, "0")} ${unit}`;
}

export function minutesToHoursDecimal(minutes) {
  return Math.round(((minutes || 0) / 60) * 100) / 100;
}

// วันในสัปดาห์ (0=อาทิตย์) ของวันที่ "YYYY-MM-DD"
export function dayOfWeek(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

// เพิ่ม/ลด จำนวนวันจากวันที่ "YYYY-MM-DD" คืนค่าเป็น "YYYY-MM-DD"
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// สร้างรายการวันที่ระหว่าง start กับ end (รวมทั้งสองวัน)
export function dateRange(startStr, endStr) {
  const out = [];
  let cur = startStr;
  let guard = 0;
  while (cur <= endStr && guard < 2000) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}

const WEEKDAY_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function weekdayNameTh(dateStr) {
  const idx = dayOfWeek(dateStr);
  return getLang() === "en" ? WEEKDAY_EN[idx] : WEEKDAY_TH[idx];
}

// ---------- กะงาน ----------

export function getShiftById(shifts, id) {
  return (shifts || []).find((s) => s.id === id) || null;
}

// ---------- ระบุตัวตน (ไม่มีระบบล็อกอินจริง) ----------
// พนักงาน: เก็บ employeeId ที่เลือกไว้ในเครื่อง เพื่อไม่ต้องเลือกชื่อซ้ำทุกครั้ง
const MY_EMPLOYEE_KEY = "hrMyEmployeeId";

export function saveMyEmployeeId(id) {
  localStorage.setItem(MY_EMPLOYEE_KEY, id);
}
export function getMyEmployeeId() {
  return localStorage.getItem(MY_EMPLOYEE_KEY) || "";
}
export function clearMyEmployeeId() {
  localStorage.removeItem(MY_EMPLOYEE_KEY);
}

// อุปกรณ์: token สุ่มถาวรต่ออุปกรณ์ (เก็บใน localStorage) ใช้ "ผูก" ชื่อพนักงานที่ลงทะเบียนไว้กับ
// อุปกรณ์นี้โดยเฉพาะ กันไม่ให้อุปกรณ์อื่นเลือกชื่อเดิมซ้ำ/สวมรอยเข้าระบบเป็นคนอื่นได้
// (ดู registerNewEmployee() ใน app.js — เขียนค่านี้ลง field "claimedByDevice" ของพนักงานใน Firestore)
const DEVICE_TOKEN_KEY = "hrDeviceToken";

export function getDeviceToken() {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    token = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
}

// แอดมิน: เก็บชื่อแอดมินที่เลือกไว้ในเครื่อง (สำหรับบันทึก updatedBy)
const MY_ADMIN_KEY = "hrMyAdmin";

export function saveMyAdmin(admin) {
  localStorage.setItem(MY_ADMIN_KEY, JSON.stringify(admin));
}
export function getMyAdmin() {
  try {
    return JSON.parse(localStorage.getItem(MY_ADMIN_KEY) || "null");
  } catch {
    return null;
  }
}
export function clearMyAdmin() {
  localStorage.removeItem(MY_ADMIN_KEY);
}

// ---------- รูปภาพ (ถ่ายรูปยืนยันตัวตนตอนเช็คอิน/เช็คเอาท์) ----------
// บีบอัดรูปฝั่งเบราว์เซอร์ก่อนอัปโหลด (ย่อขนาด + ลดคุณภาพ JPEG ทีละนิดจนกว่าจะได้ขนาดไม่เกิน targetBytes)
// เพื่อให้เก็บเป็น base64 ฝังไว้ใน Firestore document ได้โดยไม่ชนขีดจำกัด 1MB ต่อเอกสาร
// (ไม่ใช้ Firebase Storage เพื่อไม่ต้องผูกบัตรเครดิต/อัปเกรดแผน ดู firebase-init.js)
//
// ใช้ createImageBitmap() ก่อนถ้าเบราว์เซอร์รองรับ (เร็วกว่าและกินหน่วยความจำน้อยกว่ามากบนมือถือ
// เพราะย่อขนาดตอนถอดรหัสภาพเลยโดยไม่ต้องโหลดภาพความละเอียดเต็มจากกล้อง 12-48MP เข้ามาก่อน ซึ่งเป็น
// สาเหตุหลักที่ทำให้บางเครื่อง/เบราว์เซอร์ในแอป LINE ค้างนานตอน "กำลังประมวลผลรูป") ถ้าใช้ไม่ได้จะ
// ใช้วิธีเดิม (Image + canvas) แทนโดยอัตโนมัติ พร้อมกำหนดเวลาสูงสุดที่ยอมรอไว้กันค้างไม่มีที่สิ้นสุด
export function compressImageFile(file, maxDimension = 640, targetBytes = 100 * 1024) {
  return withTimeout(
    compressImageFileInner(file, maxDimension, targetBytes),
    20000,
    getLang() === "en"
      ? "Processing the photo took too long, please try again (make sure there's enough light or your internet isn't too slow)"
      : "ประมวลผลรูปใช้เวลานานเกินไป กรุณาลองถ่ายใหม่อีกครั้ง (ลองที่แสงสว่างเพียงพอ หรือเช็คว่าเน็ตไม่ช้าเกินไป)"
  );
}

function withTimeout(promise, ms, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

async function compressImageFileInner(file, maxDimension, targetBytes) {
  let drawable = null;
  let isBitmap = false;
  if (typeof createImageBitmap === "function") {
    try {
      drawable = await createImageBitmap(file);
      isBitmap = true;
    } catch (e) {
      drawable = null; // ใช้ไม่ได้ (เช่นไฟล์ฟอร์แมตแปลก) — ไปใช้วิธีสำรองด้านล่างแทน
    }
  }
  if (!drawable) {
    drawable = await loadImageElement(file);
  }

  const srcWidth = isBitmap ? drawable.width : (drawable.naturalWidth || drawable.width);
  const srcHeight = isBitmap ? drawable.height : (drawable.naturalHeight || drawable.height);
  let width = srcWidth;
  let height = srcHeight;
  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(drawable, 0, 0, width, height);
  if (isBitmap && drawable.close) drawable.close();

  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  // ลดคุณภาพทีละนิดจนกว่าขนาดจะไม่เกิน targetBytes (base64 ยาวกว่าไฟล์จริงประมาณ 1.37 เท่า)
  while (dataUrl.length * 0.74 > targetBytes && quality > 0.3) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

// วิธีสำรอง (เบราว์เซอร์เก่า/ไม่รองรับ createImageBitmap): อ่านไฟล์เป็น data URL แล้วโหลดผ่าน <img>
function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    reader.onload = () => {
      img.onerror = () => reject(new Error("โหลดรูปไม่สำเร็จ"));
      img.onload = () => resolve(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// เปิดรูปยืนยันตัวตน (ที่ถ่ายตอนเช็คอิน/เช็คเอาท์) แบบเต็มจอ — สร้าง overlay ครั้งเดียวแล้วใช้ซ้ำ
export function showPhotoLightbox(dataUrl) {
  if (!dataUrl) return;
  let overlay = document.getElementById("photo-lightbox");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "photo-lightbox";
    overlay.className = "photo-lightbox";
    overlay.innerHTML = `<span class="photo-lightbox-close">✕</span><img id="photo-lightbox-img" alt="รูปยืนยันตัวตน">`;
    overlay.addEventListener("click", () => {
      overlay.style.display = "none";
    });
    document.body.appendChild(overlay);
  }
  document.getElementById("photo-lightbox-img").src = dataUrl;
  overlay.style.display = "flex";
}

// แสดงแถบโลโก้/ชื่อบริษัท
export function renderCompanyBrandBar(containerId, company) {
  const el = document.getElementById(containerId);
  if (!el || !company) return;
  el.innerHTML = `
    ${company.logo ? `<img src="${company.logo}" alt="โลโก้บริษัท" class="brand-logo">` : ""}
    <div class="brand-text">
      <div class="brand-name-th">${company.nameTh}</div>
    </div>
  `;
}
