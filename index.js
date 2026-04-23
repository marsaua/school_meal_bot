require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const sheets = require('./sheets');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Зберігаємо стан розмови в пам'яті
const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) sessions.set(userId, {});
  return sessions.get(userId);
}

// ─── /start ──────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const telegramId = String(ctx.from.id);

  try {
    const student = await sheets.getStudentByTelegramId(telegramId);

    if (student) {
      return ctx.reply(
        `Привіт! 👋\nВи зареєстровані як батько/мати учня: *${student.name}* (${student.class}).\n\nНадішліть /меню щоб вибрати харчування на тиждень.`,
        { parse_mode: 'Markdown' }
      );
    }

    getSession(telegramId).step = 'waiting_name';
    return ctx.reply(
      '🍽️ Вітаємо у боті замовлення харчування!\n\nВведіть *прізвище та ім\'я* вашої дитини так, як у списку класу.\n_(Наприклад: Іваненко Петро)_',
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('start error:', err);
    ctx.reply('Виникла помилка. Спробуйте пізніше.');
  }
});

// ─── /меню ───────────────────────────────────────────────────────────────────
bot.command('меню', async (ctx) => {
  const telegramId = String(ctx.from.id);

  try {
    const student = await sheets.getStudentByTelegramId(telegramId);

    if (!student) {
      return ctx.reply('❗ Спочатку зареєструйтесь. Натисніть /start');
    }

    const days = getCurrentWeekDays();
    const session = getSession(telegramId);
    session.days = days;
    session.student = student;
    session.currentDayIndex = 0;

    await ctx.reply(`📋 Обираємо харчування для *${student.name}* на цей тиждень:`, {
      parse_mode: 'Markdown',
    });

    await askForDay(ctx, session);
  } catch (err) {
    console.error('меню error:', err);
    ctx.reply('Виникла помилка. Спробуйте пізніше.');
  }
});

// ─── /статус ─────────────────────────────────────────────────────────────────
bot.command('статус', async (ctx) => {
  const telegramId = String(ctx.from.id);

  try {
    const student = await sheets.getStudentByTelegramId(telegramId);

    if (!student) {
      return ctx.reply('❗ Ви ще не зареєстровані. Натисніть /start');
    }

    const days = getCurrentWeekDays();
    const choices = await sheets.getWeekChoices(student, days.map((d) => d.date));

    let text = `📊 Харчування *${student.name}* на цей тиждень:\n\n`;
    for (const day of days) {
      const choice = choices[day.date];
      text += `${day.label}: ${choice ? `*${choice}*` : '—'}\n`;
    }

    ctx.reply(text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('статус error:', err);
    ctx.reply('Виникла помилка. Спробуйте пізніше.');
  }
});

// ─── Callback: кнопки А/Б ────────────────────────────────────────────────────
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const telegramId = String(ctx.from.id);
  const session = getSession(telegramId);

  if (!data.startsWith('choice_')) return;

  try {
    // формат: choice_А_28.04
    const parts = data.split('_');
    const choice = parts[1];
    const date = parts[2];
    const student = session.student;

    if (!student) {
      return ctx.answerCbQuery('Сесія застаріла. Надішліть /меню знову.');
    }

    await sheets.saveChoice(student, date, choice);
    await ctx.answerCbQuery(`✅ Збережено: Варіант ${choice}`);

    const day = session.days[session.currentDayIndex];
    await ctx.editMessageText(`✅ ${day.label}: *Варіант ${choice}*`, {
      parse_mode: 'Markdown',
    });

    session.currentDayIndex++;

    if (session.currentDayIndex < session.days.length) {
      await askForDay(ctx, session);
    } else {
      await ctx.reply('🎉 Дякуємо! Всі варіанти харчування на тиждень збережено.\n\nПеревірити: /статус');
    }
  } catch (err) {
    console.error('callback error:', err);
    ctx.answerCbQuery('Помилка збереження. Спробуйте ще раз.');
  }
});

// ─── Текст: реєстрація ───────────────────────────────────────────────────────
bot.on('text', async (ctx) => {
  const telegramId = String(ctx.from.id);
  const session = getSession(telegramId);

  if (session.step !== 'waiting_name') return;

  try {
    const inputName = ctx.message.text.trim();
    const student = await sheets.findStudentByName(inputName);

    if (!student) {
      return ctx.reply(
        `❌ Учня *"${inputName}"* не знайдено у списку.\n\nПеревірте правопис або зверніться до класного керівника.`,
        { parse_mode: 'Markdown' }
      );
    }

    await sheets.saveTelegramId(student.rowIndex, telegramId);
    session.step = null;

    return ctx.reply(
      `✅ Реєстрація успішна!\n\n👤 Ваша дитина: *${student.name}* (${student.class})\n\nНадішліть /меню щоб обрати харчування на тиждень.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('text error:', err);
    ctx.reply('Виникла помилка. Спробуйте пізніше.');
  }
});

// ─── Хелпер: надіслати питання для поточного дня ─────────────────────────────
async function askForDay(ctx, session) {
  const day = session.days[session.currentDayIndex];
  if (!day) return;

  await ctx.reply(`${day.label}\nОберіть варіант харчування:`, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      Markup.button.callback('🍱  Варіант А', `choice_А_${day.date}`),
      Markup.button.callback('🥗  Варіант Б', `choice_Б_${day.date}`),
    ]),
  });
}

// ─── Хелпер: дні поточного тижня (Пн–Пт) ───────────────────────────────────
function getCurrentWeekDays() {
  const dayNames = ['📅 Понеділок', '📅 Вівторок', '📅 Середа', '📅 Четвер', '📅 П\'ятниця'];
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);

  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return {
      label: `${dayNames[i]}, ${dd}.${mm}`,
      date: `${dd}.${mm}`,
    };
  });
}

// ─── Запуск ───────────────────────────────────────────────────────────────────
bot.launch({ dropPendingUpdates: true });
console.log('✅ Бот запущений!');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
