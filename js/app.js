// app.js — จุดเริ่มต้นของแอปฝั่งพนักงาน: LIFF, การผูกบัญชี LINE / เลือกชื่อ (identity), และสลับแท็บ
//
// หลักการระบุตัวตน (แบบเดียวกับ Hello Boss):
//  - ถ้าเปิดผ่านแอป LINE (ตั้งค่า LIFF_ID ไว้แล้ว): ระบบจะดึงบัญชี LINE (LINE userId) ของผู้ใช้
//    มาเทียบกับพนักงานที่เคย "ผูกบัญชี" ไว้แล้ว ถ้าเจอจะเข้าระบบให้อัตโนมัติทันทีโดยไม่ต้องเลือกชื่อ
//    ไม่ว่าจะเปิดจากอุปกรณ์ไหนก็ตาม (เพราะผูกกับบัญชี LINE ไม่ใช่อุปกรณ์)
//    ถ้ายังไม่เคยผูก จะให้เลือกชื่อ "ครั้งเดียว" เพื่อผูกบัญชี LINE เข้ากับชื่อพนักงานนั้น
//  - ถ้าเปิดผ่านเบราว์เซอร์ปกติ (ไม่มี LIFF หรือยังไม่ได้ตั้งค่า LIFF_ID): ใช้วิธีเดิมคือเลือกชื่อ
//    แล้วจดจำไว้ในอุปกรณ์เครื่องนั้น (localStorage)
import { LIFF_ID, COMPANY, SHIFTS, DEFAULT_WEEKLY_DAYOFF } from "./config.js";
import { db, collection, addDoc, doc, updateDoc, getDocs, query, where, serverTimestamp } from "./firebase-init.js";
import { EMPLOYEES_COLLECTION } from "./firebase-init.js";
import {
  renderCompanyBrandBar,
  getMyEmployeeId,
  saveMyEmployeeId,
  clearMyEmployeeId,
  getDeviceToken,
  showToast,
  ensureLiffLoaded,
} from "./utils.js";
import { ensureAllDefaults } from "./seed.js";
import { initAttendance } from "./attendance.js";
import { initLeave } from "./leave.js";
import { initSwapRequest } from "./swaprequest.js";
import { initMyTeam } from "./myteam.js";
import { bi, deptBi, applyI18n, initLangToggle } from "./i18n.js";

renderCompanyBrandBar("brand-bar", COMPANY);
applyI18n();
initLangToggle("lang-toggle-btn");

let allEmployees = [];
let currentEmployee = null;
let liffProfile = null; // ถ้าเปิดผ่าน LINE สำเร็จ จะมีค่านี้ (มี userId/displayName/pictureUrl)
let identityMode = "device"; // "device" (เลือกชื่อ+จำในเครื่อง) หรือ "link" (ผูกบัญชี LINE ครั้งแรก)

// ---------- สลับแท็บ ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById("tab-home").style.display = tab === "home" ? "block" : "none";
    document.getElementById("tab-history").style.display = tab === "history" ? "block" : "none";
    document.getElementById("tab-leave").style.display = tab === "leave" ? "block" : "none";
    document.getElementById("tab-team").style.display = tab === "team" ? "block" : "none";
  });
});

// ---------- บูตแอป: เตรียมข้อมูลเริ่มต้น + เชื่อม LINE (ถ้ามี) + ตัดสินใจหน้าที่จะแสดง ----------
async function boot() {
  await ensureAllDefaults(); // สร้างกะ/วันหยุด/รายชื่อพนักงานเริ่มต้นให้ ถ้ายังไม่มีข้อมูลเลยในระบบ
  await loadEmployees();
  await initLiff(); // รอผลของ LIFF ก่อน (ถ้าตั้งค่า LIFF_ID ไว้) จะได้รู้ว่ามีบัญชี LINE หรือไม่

  if (liffProfile) {
    const linked = allEmployees.find((e) => e.lineUserId === liffProfile.userId);
    if (linked) {
      enterApp(linked);
      return;
    }
    identityMode = "link";
    showIdentityScreen();
    return;
  }

  identityMode = "device";
  const savedId = getMyEmployeeId();
  const savedEmployee = savedId ? allEmployees.find((e) => e.id === savedId) : null;
  // ต้องตรงกับ token ของอุปกรณ์นี้เท่านั้น (กันกรณีแอดมิน "ยกเลิกการลงทะเบียน" ให้ชื่อนี้ไปแล้ว
  // หรือ localStorage ถูกย้าย/คัดลอกข้ามเครื่อง — จะบังคับให้ลงทะเบียนใหม่แทนที่จะเข้าระบบเป็นคนอื่นได้ทันที)
  if (savedEmployee && savedEmployee.claimedByDevice === getDeviceToken()) {
    enterApp(savedEmployee);
  } else {
    if (savedId) clearMyEmployeeId();
    showIdentityScreen();
  }
}

async function loadEmployees() {
  try {
    const snap = await getDocs(query(collection(db, EMPLOYEES_COLLECTION), where("active", "==", true)));
    allEmployees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("โหลดรายชื่อพนักงานไม่สำเร็จ (ตรวจสอบว่าตั้งค่า Firebase/Firestore rules ไว้แล้วหรือยัง)", e);
    allEmployees = [];
  }
}

function showIdentityScreen() {
  document.getElementById("identity-screen").style.display = "flex";
  document.getElementById("main-app").style.display = "none";

  const titleEl = document.getElementById("id-screen-title");
  const subtitleEl = document.getElementById("id-screen-subtitle");
  if (identityMode === "link") {
    titleEl.textContent = bi("🔗 เชื่อมบัญชี LINE ของคุณ", "🔗 Link your LINE account");
    subtitleEl.textContent = bi(
      "เลือกชื่อของคุณจากรายชื่อพนักงานด้านล่าง (ถ้าแอดมินเพิ่มชื่อคุณไว้แล้ว) เพื่อผูกกับบัญชี LINE นี้ — ระบบจะจำคุณได้อัตโนมัติทุกครั้งที่เปิดผ่าน LINE ไม่ต้องเลือกซ้ำอีก",
      "Select your name from the employee list below (if your admin already added you) to link it with this LINE account — the system will recognize you automatically every time you open it through LINE."
    );
  } else {
    titleEl.textContent = bi("👋 ยินดีต้อนรับ", "👋 Welcome");
    subtitleEl.textContent = bi(
      "เลือกชื่อของคุณจากรายชื่อพนักงานด้านล่าง (ถ้าแอดมินเพิ่มชื่อคุณไว้แล้ว) — หลังจากเลือกแล้วระบบจะจดจำไว้ในอุปกรณ์นี้โดยเฉพาะ ไม่ต้องเลือกซ้ำในครั้งถัดไป",
      "Select your name from the employee list below (if your admin already added you) — after selecting, the system will remember you on this device, no need to select again next time."
    );
  }

  const hasUnclaimed = allEmployees.some((e) => !e.lineUserId && !e.claimedByDevice);
  const selectPanel = document.getElementById("select-existing-panel");
  const form = document.getElementById("register-form");
  // ถ้ายังไม่มีรายชื่อที่ว่างให้เลือกเลย (เช่น แอดมินยังไม่ได้เพิ่มใครไว้ล่วงหน้า) ให้ข้ามไปหน้าลงทะเบียนใหม่เลย
  // แต่ถ้ามี ให้เริ่มที่หน้า "เลือกชื่อ" ก่อนเสมอ เพื่อกันไม่ให้เผลอสร้างชื่อซ้ำกับที่มีอยู่แล้วในระบบ
  if (selectPanel) selectPanel.style.display = hasUnclaimed ? "block" : "none";
  if (form) form.style.display = hasUnclaimed ? "none" : "block";
  const searchInput = document.getElementById("emp-search-input");
  if (searchInput) searchInput.value = "";
  renderEmployeeSelectList();
  if (form) form.reset();
}

// ---------- เลือกชื่อจากรายชื่อพนักงานที่มีอยู่แล้ว (ยังไม่ถูกจับคู่กับอุปกรณ์/บัญชี LINE ใดๆ) ----------
function renderEmployeeSelectList() {
  const wrap = document.getElementById("emp-select-list");
  const searchInput = document.getElementById("emp-search-input");
  if (!wrap) return;
  const q = ((searchInput && searchInput.value) || "").trim().toLowerCase();
  const unclaimed = allEmployees.filter((e) => !e.lineUserId && !e.claimedByDevice);
  const filtered = q
    ? unclaimed.filter(
        (e) =>
          (e.name || "").toLowerCase().includes(q) ||
          (e.fullName || "").toLowerCase().includes(q) ||
          (e.employeeCode || "").toLowerCase().includes(q)
      )
    : unclaimed;

  if (!unclaimed.length) {
    wrap.innerHTML = `<p class="hint">${bi(
      "ยังไม่มีรายชื่อพนักงานที่ยังไม่ถูกจับคู่ในระบบ กรุณาลงทะเบียนใหม่ด้านล่าง",
      "No unclaimed employee names available. Please register below."
    )}</p>`;
    return;
  }
  if (!filtered.length) {
    wrap.innerHTML = `<p class="hint">${bi("ไม่พบชื่อที่ค้นหา", "No matching name found")}</p>`;
    return;
  }
  wrap.innerHTML = filtered
    .map(
      (e) => `
      <div class="emp-pick-item" data-pick="${e.id}">
        <div class="name">${escapeHtml(e.name)}</div>
        <div class="meta">${e.employeeCode ? escapeHtml(e.employeeCode) + " • " : ""}${
        e.department ? deptBi(e.department) : bi("ยังไม่ระบุแผนก", "No department")
      }</div>
      </div>`
    )
    .join("");
  wrap.querySelectorAll("[data-pick]").forEach((el) => {
    el.addEventListener("click", () => {
      const emp = allEmployees.find((x) => x.id === el.dataset.pick);
      if (emp) claimExistingEmployee(emp);
    });
  });
}

document.getElementById("emp-search-input")?.addEventListener("input", renderEmployeeSelectList);
document.getElementById("show-register-link")?.addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("select-existing-panel").style.display = "none";
  document.getElementById("register-form").style.display = "block";
});
document.getElementById("show-select-link")?.addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("select-existing-panel").style.display = "block";
  document.getElementById("register-form").style.display = "none";
  renderEmployeeSelectList();
});

// เลือกชื่อที่มีอยู่แล้ว -> ผูกกับบัญชี LINE นี้ หรืออุปกรณ์นี้ (ไม่สร้างพนักงานใหม่ซ้ำ)
async function claimExistingEmployee(emp) {
  try {
    const payload = { updatedAt: serverTimestamp() };
    if (identityMode === "link" && liffProfile) {
      payload.lineUserId = liffProfile.userId;
      payload.lineDisplayName = liffProfile.displayName || "";
      payload.linePictureUrl = liffProfile.pictureUrl || null;
    } else {
      payload.claimedByDevice = getDeviceToken();
    }
    await updateDoc(doc(db, EMPLOYEES_COLLECTION, emp.id), payload);
    const updatedEmp = { ...emp, ...payload };
    const idx = allEmployees.findIndex((e) => e.id === emp.id);
    if (idx >= 0) allEmployees[idx] = updatedEmp;

    if (identityMode !== "link") {
      saveMyEmployeeId(emp.id);
    }

    showToast(bi(`✅ ยินดีต้อนรับกลับคุณ ${emp.name}`, `✅ Welcome back, ${emp.name}`));
    enterApp(updatedEmp);
  } catch (err) {
    console.error(err);
    showToast(bi("❌ เลือกชื่อไม่สำเร็จ กรุณาลองใหม่", "❌ Failed to select your name, please try again"));
  }
}

// ลงทะเบียนใช้งานครั้งแรก: กรอกข้อมูลส่วนตัว -> สร้างพนักงานใหม่ในระบบ -> ผูกกับบัญชี LINE
// หรืออุปกรณ์นี้ทันที (จนกว่าแอดมินจะ "ยกเลิกการลงทะเบียน" ให้ในหน้าแอดมิน)
async function registerNewEmployee(e) {
  e.preventDefault();
  const fullName = document.getElementById("reg-fullname").value.trim();
  const nickname = document.getElementById("reg-nickname").value.trim();
  const dob = document.getElementById("reg-dob").value;

  if (!fullName || !nickname || !dob) {
    showToast(bi("กรุณากรอกข้อมูลให้ครบถ้วน", "Please fill in all required fields"));
    return;
  }

  const btn = document.getElementById("reg-submit-btn");
  btn.disabled = true;
  try {
    const defaultShift = SHIFTS.find((s) => s.id === "office") || SHIFTS[0] || null;
    const payload = {
      name: nickname,
      fullName,
      nickname,
      dob,
      department: "",
      shiftId: defaultShift ? defaultShift.id : "",
      weeklyDayOff: DEFAULT_WEEKLY_DAYOFF,
      active: true,
      createdAt: serverTimestamp(),
    };

    if (identityMode === "link" && liffProfile) {
      payload.lineUserId = liffProfile.userId;
      payload.lineDisplayName = liffProfile.displayName || "";
      payload.linePictureUrl = liffProfile.pictureUrl || null;
    } else {
      payload.claimedByDevice = getDeviceToken();
    }

    const newRef = await addDoc(collection(db, EMPLOYEES_COLLECTION), payload);
    const newEmp = { id: newRef.id, ...payload };
    allEmployees.push(newEmp);

    if (identityMode !== "link") {
      saveMyEmployeeId(newRef.id);
    }

    showToast(bi(`✅ ลงทะเบียนสำเร็จ ยินดีต้อนรับคุณ ${nickname}`, `✅ Registered successfully, welcome ${nickname}`));
    enterApp(newEmp);
  } catch (err) {
    console.error(err);
    showToast(bi("❌ ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่", "❌ Registration failed, please try again"));
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("register-form").addEventListener("submit", registerNewEmployee);

function enterApp(employee) {
  currentEmployee = employee;
  document.getElementById("identity-screen").style.display = "none";
  document.getElementById("main-app").style.display = "block";
  document.getElementById("welcome-line").textContent = bi(`สวัสดีคุณ ${employee.name} 👋`, `Hello, ${employee.name} 👋`);

  const modeLine = document.getElementById("identity-mode-line");
  if (modeLine) {
    modeLine.innerHTML = employee.lineUserId
      ? bi("🔗 เชื่อมกับบัญชี LINE ของคุณแล้ว", "🔗 Your LINE account is linked")
      : `<a href="#" onclick="window.switchEmployeeIdentity(); return false;" style="color:#fff; text-decoration:underline;">${bi("ไม่ใช่คุณ? เปลี่ยนผู้ใช้งาน", "Not you? Switch user")}</a>`;
  }

  initAttendance(employee, liffProfile);
  initLeave(employee);
  initSwapRequest(employee);

  const teamTabBtn = document.getElementById("tab-btn-team");
  if (employee.teamLeadOf) {
    if (teamTabBtn) teamTabBtn.style.display = "";
    initMyTeam(employee);
  } else if (teamTabBtn) {
    teamTabBtn.style.display = "none";
  }

  applyDeepLinkTab();
}

// ---------- เปิดแท็บที่ต้องการโดยตรงผ่าน query string เช่น ?tab=home / ?tab=leave / ?tab=history ----------
// ใช้สำหรับปุ่ม Rich Menu ของ LINE Official Account ที่ลิงก์มายัง LIFF URL นี้พร้อมระบุแท็บที่ต้องการ
// เช่น ปุ่ม "Check In-Out" -> ...?tab=home, ปุ่ม "ลางาน" -> ...?tab=leave, ปุ่ม "สรุปการทำงาน" -> ...?tab=history
function applyDeepLinkTab() {
  try {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (!tab) return;
    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (btn) btn.click();
  } catch (e) {
    console.warn("เปิดแท็บตาม query string ไม่สำเร็จ", e);
  }
}

window.switchEmployeeIdentity = function () {
  clearMyEmployeeId();
  showToast(bi("สลับผู้ใช้งาน กรุณาเลือกชื่อใหม่", "Switching user, please select your name again"));
  location.reload();
};

boot();

// ============================================================
//  LINE LIFF — ถ้าไม่ได้ตั้งค่า LIFF_ID ไว้ใน config.js จะข้ามส่วนนี้ทั้งหมด
//  และแอปทำงานเป็นเว็บแอปปกติทันที (เปิดผ่านเบราว์เซอร์ได้ตามปกติ)
// ============================================================
async function initLiff() {
  if (!LIFF_ID) return;
  // เผื่อกรณีสคริปต์ liff.js จาก CDN โหลดไม่สำเร็จตอนเปิดหน้าเว็บครั้งแรก (เน็ตมือถือหลุด/ช้าตอนนั้น
  // พอดี) ให้ลองโหลดซ้ำแบบไดนามิกอีกครั้งก่อน ไม่งั้นระบบจะเข้าใจผิดว่าไม่ได้ตั้งค่า LIFF ไว้เลย
  // ทั้งที่ตั้งค่าถูกต้องแล้ว แล้วบังคับให้ลงทะเบียนใหม่ทั้งที่เป็นผู้ใช้เดิม
  const liffOk = await ensureLiffLoaded();
  if (!liffOk) {
    console.warn("โหลด LIFF SDK ไม่สำเร็จ (เน็ตอาจช้า/หลุดตอนโหลดหน้า) — ทำงานเป็นเว็บแอปปกติแทน");
    liffProfile = null;
    return;
  }
  try {
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) {
      // ถ้าไม่ได้เปิดผ่านแอป LINE (เช่น เปิดลิงก์เว็บตรงๆ ใน Safari/Chrome) การพยายาม login ผ่าน LINE
      // อัตโนมัติแบบนี้อาจเจอ error "400 Bad Request" จาก access.line.me ได้ (ปัญหาที่เจอบ่อยเวลาเปิด
      // จากเบราว์เซอร์ภายนอกโดยตรงแทนที่จะเปิดผ่านลิงก์ liff.line.me ในแอป LINE) — ในกรณีนี้ให้ข้ามการ
      // login ผ่าน LINE ไปเลย แล้วใช้งานเป็นเว็บแอปปกติแทน (เลือกชื่อ + จำในอุปกรณ์นี้) ไม่ต้อง redirect
      if (!liff.isInClient()) {
        console.warn("เปิดผ่านเบราว์เซอร์ภายนอก (ไม่ใช่แอป LINE) — ข้ามการ login ผ่าน LINE อัตโนมัติ ใช้งานแบบเว็บแอปปกติแทน");
        liffProfile = null;
        return;
      }
      liff.login({ redirectUri: window.location.href });
      return; // กำลังจะ redirect ไปหน้าล็อกอิน LINE — ไม่ต้องทำอะไรต่อ
    }
    liffProfile = await liff.getProfile();
    renderLiffBar(liffProfile);
  } catch (e) {
    console.warn("LIFF init failed, running as normal web app:", e);
    liffProfile = null;
  }
}

function renderLiffBar(profile) {
  if (!profile) return;
  const header = document.querySelector(".app-header");
  if (!header) return;
  const bar = document.createElement("div");
  bar.className = "liff-user-bar";
  bar.innerHTML = `
    ${profile.pictureUrl ? `<img src="${profile.pictureUrl}" alt="">` : `<span class="liff-avatar-fallback">🙂</span>`}
    <span>${bi("สวัสดี", "Hello")} ${escapeHtml(profile.displayName || "")}</span>
  `;
  header.appendChild(bar);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}
