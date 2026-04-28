# school-meal-bot

Telegram bot for a Ukrainian school class. Parents register their child by name, then pick meal option A or B for each weekday. Choices are written to a shared Google Sheet.

## Stack

Node.js 18+, Telegraf (bot framework), Google Sheets API via `googleapis`. Deployed on Railway as a single instance.

## Env vars

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Telegram bot token from BotFather |
| `SPREADSHEET_ID` | Sheet ID from the URL (between `/d/` and `/edit`) |
| `GOOGLE_CREDENTIALS` | Full service account JSON as a single-line string |

## Run locally

Create `.env` with the three vars above (`GOOGLE_CREDENTIALS` must be one line), then:

```
node index.js
```

## Deploy

Push to GitHub → connect repo in Railway → set the three env vars. Railway runs `node index.js`. No build step.

## Bot commands

`/start` — register parent→child link · `/menu` — pick A/B for Mon–Fri · `/status` — view this week's choices

## Gotchas

- **Sessions are in-memory.** A bot restart mid-conversation resets state — user must re-run `/menu`.
- **`saveChoice` is 4 sequential API calls** (read headers, read name column, write row, write cell). Not atomic; avoid running concurrent saves for the same student.
- **409 on startup** = another instance is polling. The boot loop retries 10× / 5s. If it keeps happening, check for a stuck Railway deployment.
