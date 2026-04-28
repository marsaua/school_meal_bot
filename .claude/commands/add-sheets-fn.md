Add a new exported function to `sheets.js`.

The user will provide: function name and what it should read or write.

Insert the new function before the `module.exports` block, following this pattern:

```js
// ─── <Description> ───────────────────────────────────────────────────────────
async function <name>(<params>) {
  const client = await getSheetsClient();

  // reads: client.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_...}!...` })
  // writes: client.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `...`, valueInputOption: 'RAW', requestBody: { values: [[...]] } })

  return <result>;
}
```

Then add `<name>` to the `module.exports` object at the bottom.

Rules:
- Always use `getSheetsClient()` — never instantiate auth directly
- Use `SHEET_STUDENTS` or `SHEET_FOOD` constants for sheet names, never hardcode the strings
- For writes that need a column letter, use the existing `columnToLetter()` helper
- If reading a full column, use `A:A` range pattern (not a fixed row count)
- `saveChoice` in the same file shows the full read-then-write pattern; follow it for any operation that needs to locate a row before writing
