Add a new bot command to `index.js`.

The user will provide: command name (e.g. `reset`) and a brief description of what it should do.

Insert a new `bot.command()` block in `index.js` before the `// ─── Запуск` section, following this exact pattern:

```js
// ─── /<name> ──────────────────────────────────────────────────────────────────
bot.command("<name>", async (ctx) => {
  const telegramId = String(ctx.from.id);

  try {
    const student = await sheets.getStudentByTelegramId(telegramId);

    if (!student) {
      return ctx.reply("❗ Ви ще не зареєстровані. Натисніть /start");
    }

    // TODO: implement $ARGUMENTS

  } catch (err) {
    console.error("<name> error:", err);
    ctx.reply("Виникла помилка. Спробуйте пізніше.");
  }
});
```

Rules:
- All user-facing strings in Ukrainian
- Always check for `!student` before doing any work
- Keep the `console.error` label as `"<name> error:"`
- Do not add a session step unless the command needs multi-message flow (like `/menu` does)
