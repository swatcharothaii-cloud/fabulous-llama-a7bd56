// netlify/functions/line-push.js
// ============================================================
//  Netlify Function (ฟรี ไม่ต้องผูกบัตรเครดิต ไม่ต้องอัปเกรดแผน Firebase เป็น Blaze) — ทำหน้าที่เป็น
//  "เซิร์ฟเวอร์กลาง" เดียวที่เก็บ LINE Channel Access Token ไว้อย่างปลอดภัย (เก็บเป็น Environment
//  Variable ในตั้งค่าไซต์ Netlify ไม่เคยถูกส่งไปให้เบราว์เซอร์ผู้ใช้เห็นเลย) แล้วยิงข้อความ LINE แบบ
//  push message ไปหา lineUserId ที่ระบุมาเท่านั้น
//
//  ทำไมต้องมีฟังก์ชันนี้ (แทนที่จะยิงจากเบราว์เซอร์ตรงๆ): การส่งข้อความ LINE แบบ push ต้องใช้ Channel
//  Access Token ซึ่งเป็นความลับ — ถ้าฝังไว้ในโค้ดฝั่งเบราว์เซอร์ ใครก็เปิดดู source code แล้วขโมยไปใช้ส่ง
//  สแปมได้ จึงต้องมีเซิร์ฟเวอร์ (ฟังก์ชันนี้) คั่นกลางเก็บ Token ไว้แทน
//
//  ⚠️ หมายเหตุความปลอดภัย: แอปนี้ไม่มีระบบล็อกอิน/ยืนยันตัวตนจริงอยู่แล้ว (ดูคำเตือนใน firestore.rules)
//  ฟังก์ชันนี้จึงรับรายชื่อผู้รับ (lineUserId) และข้อความมาจากฝั่งเบราว์เซอร์ตรงๆ เหมือนส่วนอื่นของแอป
//  ผลกระทบเสี่ยงต่ำ เพราะทำได้แค่ "สั่งส่งข้อความไปหา lineUserId ที่ระบุ" เท่านั้น (ต้องรู้ lineUserId ของ
//  เป้าหมายอยู่แล้วถึงจะส่งได้ และผู้รับต้องเป็นเพื่อนกับ LINE OA อยู่ก่อน ไม่สามารถส่งไปหาใครก็ได้ตามใจ)
//  จำกัดจำนวนผู้รับ/ความยาวข้อความต่อ 1 คำขอไว้ป้องกันการใช้งานผิดวัตถุประสงค์แบบส่งสแปมจำนวนมาก
// ============================================================

const https = require("https");

const MAX_RECIPIENTS_PER_REQUEST = 50;
const MAX_TEXT_LENGTH = 3000;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Netlify Environment variables",
      }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { to, text } = payload;
  const ids = (Array.isArray(to) ? to : [to])
    .filter((id) => typeof id === "string" && id.trim())
    .slice(0, MAX_RECIPIENTS_PER_REQUEST);

  if (!ids.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "ต้องระบุผู้รับ (to) อย่างน้อย 1 คน" }) };
  }
  if (!text || typeof text !== "string" || text.length > MAX_TEXT_LENGTH) {
    return { statusCode: 400, body: JSON.stringify({ error: "ข้อความไม่ถูกต้องหรือยาวเกินไป" }) };
  }

  const results = await Promise.all(ids.map((id) => pushLineMessage(token, id, text)));
  const failed = results.filter((r) => !r.ok).length;

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, sent: results.length - failed, failed }),
  };
};

// ยิง request ไปยัง LINE Messaging API push endpoint โดยตรง (ไม่ต้องติดตั้ง SDK/dependency เพิ่ม
// เพื่อให้ Netlify build ฟังก์ชันนี้ได้เร็วและไม่มี dependency ให้ต้อง npm install)
function pushLineMessage(token, to, text) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ to, messages: [{ type: "text", text }] });
    const req = https.request(
      {
        hostname: "api.line.me",
        path: "/v2/bot/message/push",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            console.error(`LINE push ล้มเหลว (HTTP ${res.statusCode}) ถึง ${to}: ${body}`);
            resolve({ ok: false });
          } else {
            resolve({ ok: true });
          }
        });
      }
    );
    req.on("error", (e) => {
      console.error("LINE push เกิดข้อผิดพลาดขณะเชื่อมต่อ", e);
      resolve({ ok: false });
    });
    req.write(data);
    req.end();
  });
}
