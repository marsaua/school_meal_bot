const { google } = require("googleapis");

// ─── Авторизація ──────────────────────────────────────────────────────────────
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
console.log("SHEETS INIT");
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Назви аркушів у Google Sheets
const SHEET_STUDENTS = "Учні"; // Список учнів: A=ПІБ, B=Клас, C=TelegramID
const SHEET_FOOD = "Харчування"; // Вибори: A=ПІБ, B=Клас, C+=дати

// ─── Хелпер: отримати клієнт Sheets ──────────────────────────────────────────
async function getSheetsClient() {
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

// ─── Отримати всіх учнів ──────────────────────────────────────────────────────
async function getAllStudents() {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_STUDENTS}!A2:C`,
  });
  return res.data.values || [];
}

// ─── Знайти учня за Telegram ID ───────────────────────────────────────────────
async function getStudentByTelegramId(telegramId) {
  const rows = await getAllStudents();
  for (let i = 0; i < rows.length; i++) {
    const [name, cls, tid] = rows[i];
    if (tid && tid.toString().trim() === telegramId.toString().trim()) {
      return { name, class: cls, rowIndex: i + 2 };
    }
  }
  return null;
}

// ─── Знайти учня за ім'ям (нечутливо до регістру) ────────────────────────────
async function findStudentByName(inputName) {
  const rows = await getAllStudents();
  const normalized = inputName.toLowerCase().trim().replace(/\s+/g, " ");

  for (let i = 0; i < rows.length; i++) {
    const [name, cls] = rows[i];
    if (name && name.toLowerCase().trim().replace(/\s+/g, " ") === normalized) {
      return { name, class: cls, rowIndex: i + 2 };
    }
  }
  return null;
}

// ─── Зберегти Telegram ID учня ────────────────────────────────────────────────
async function saveTelegramId(rowIndex, telegramId) {
  const client = await getSheetsClient();
  await client.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_STUDENTS}!C${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [[telegramId]] },
  });
}

// ─── Зберегти вибір харчування ────────────────────────────────────────────────
async function saveChoice(student, date, choice) {
  const client = await getSheetsClient();

  // 1. Отримати заголовки (рядок 1)
  const headerRes = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_FOOD}!1:1`,
  });
  const headers = (headerRes.data.values || [[]])[0] || [];

  // 2. Знайти або створити колонку з датою
  let dateColIndex = headers.findIndex((h) => h && h.trim() === date);
  if (dateColIndex === -1) {
    dateColIndex = headers.length;
    const colLetter = columnToLetter(dateColIndex + 1);
    await client.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_FOOD}!${colLetter}1`,
      valueInputOption: "RAW",
      requestBody: { values: [[date]] },
    });
  }

  // 3. Знайти або створити рядок учня
  const nameColRes = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_FOOD}!A:A`,
  });
  const nameCol = (nameColRes.data.values || []).map((r) =>
    (r[0] || "").trim(),
  );

  let studentRowIndex = nameCol.indexOf(student.name.trim());
  if (studentRowIndex === -1) {
    studentRowIndex = nameCol.length === 0 ? 1 : nameCol.length;

    // Якщо перший рядок — заголовок ПІБ/Клас
    if (studentRowIndex === 0) studentRowIndex = 1;

    await client.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_FOOD}!A${studentRowIndex + 1}:B${studentRowIndex + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: [[student.name, student.class]] },
    });
  }

  // 4. Записати вибір
  const colLetter = columnToLetter(dateColIndex + 1);
  await client.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_FOOD}!${colLetter}${studentRowIndex + 1}`,
    valueInputOption: "RAW",
    requestBody: { values: [[choice]] },
  });
}

// ─── Отримати вибори за тиждень ───────────────────────────────────────────────
async function getWeekChoices(student, dates) {
  const client = await getSheetsClient();

  const headerRes = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_FOOD}!1:1`,
  });
  const headers = (headerRes.data.values || [[]])[0] || [];

  const nameColRes = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_FOOD}!A:A`,
  });
  const nameCol = (nameColRes.data.values || []).map((r) =>
    (r[0] || "").trim(),
  );
  const studentRowIndex = nameCol.indexOf(student.name.trim());

  if (studentRowIndex === -1) return {};

  const rowRes = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_FOOD}!${studentRowIndex + 1}:${studentRowIndex + 1}`,
  });
  const row = (rowRes.data.values || [[]])[0] || [];

  const result = {};
  for (const date of dates) {
    const colIdx = headers.findIndex((h) => h && h.trim() === date);
    result[date] = colIdx !== -1 ? row[colIdx] || null : null;
  }
  return result;
}

// ─── Хелпер: номер колонки → буква (1→A, 27→AA) ──────────────────────────────
function columnToLetter(col) {
  let letter = "";
  while (col > 0) {
    const mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

module.exports = {
  getStudentByTelegramId,
  findStudentByName,
  saveTelegramId,
  saveChoice,
  getWeekChoices,
};
