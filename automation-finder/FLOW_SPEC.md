# Automation Finder — Power Automate flow spec

Same overall shape as the Bullhorn Categorisation lookup
(`../bullhorn-category/AI_LOOKUP_BUILD_SPEC.md`): **HTTP trigger → build one
text input → Run a prompt → Response**. The difference is that this flow
also reads the automation register from SharePoint on every request, so
the answers are always up to date with the spreadsheet, and the register
itself never has to be copied into this public repo.

The browser doesn't call this flow directly. It calls a Cloudflare Worker
(`worker/`), which holds the flow's signed trigger URL as a secret. See
`worker/DEPLOY.md`.

```
When an HTTP request is received
 ├─ List rows: Candidate      ┐
 ├─ List rows: Sales Contact  │  (run these five side by side)
 ├─ List rows: Placement      │
 ├─ List rows: Job            │
 └─ List rows: Submission     ┘
     └─ Select ×5 (tidy each sheet's rows into the same shape)
         └─ Compose "All automations" (join the five lists)
             └─ Filter array (drop blank rows)
                 ├─ Select "Register lines" (one line of text per automation)
                 └─ Select "Conversation lines"
                     └─ Compose "Prompt input"
                         └─ Run a prompt
                             └─ Compose "Reply text"
                                 └─ Response
```

## 0. One-off: turn each sheet into an Excel table

The Excel connector can only read rows from a **table**, not a plain sheet.
Open **Active Automation Register 2026.xlsx** (Marketing › BH Automation
(Herefish)) in Excel, and for each of these five sheets:

1. Click any cell in the data, press **Ctrl+T**, tick **My table has
   headers**, OK.
2. **Table Design** tab → **Table Name** box → rename it:

| Sheet | Table name |
|---|---|
| Candidate | `Candidate` |
| Sales Contact | `SalesContact` |
| Placement | `Placement` |
| Job | `Job` |
| Submission | `Submission` |

Leave **Candidate Insights** alone, it's a summary, not a list of
automations.

Things to know:

- Some sheets have a blank header cell. Excel names those `Column1`,
  `Column2`, etc. That's fine, the flow ignores them.
- New rows typed directly under a table are added to it automatically, so
  nobody's workflow changes.
- If you'd rather not change the table's colours, pick **Table Design →
  Table Styles → None** (the first, plain style).

## 1. Trigger

**When an HTTP request is received.** Generate the request body schema from
this sample:

```json
{
  "conversation": [
    { "role": "user", "content": "Do we have an automation that texts candidates when their email bounces?" },
    { "role": "assistant", "content": "{\"answer\":\"Yes...\",\"matches\":[],\"question\":null}" },
    { "role": "user", "content": "What about for sales contacts?" }
  ]
}
```

`conversation` is the back-and-forth so far, oldest first. Most requests
will be a single question.

If the trigger has a **Who can trigger the flow** setting, set it to
**Anyone**. The worker calls the flow with the signed URL, not as a signed-in
user.

## 2. List rows present in a table (×5)

Add an **Excel Online (Business) → List rows present in a table** action
for each table. Set them up as five parallel branches (hover under the
trigger → **+** → **Add a parallel branch**) so they run at the same time.

For each one:

- **Location**: the Marketing SharePoint site
- **Document Library**: Documents
- **File**: `/BH Automation (Herefish)/Active Automation Register 2026.xlsx`
- **Table**: the table name from step 0
- **Advanced parameters → DateTime Format**: **ISO 8601**. Without this,
  dates come through as Excel serial numbers (e.g. `46254`).

Rename the actions so the expressions below work as written:
`List Candidate`, `List SalesContact`, `List Placement`, `List Job`,
`List Submission`.

The connector returns up to 256 rows by default. The biggest sheet is
around 170 rows. If any sheet grows past 256, open that action's
**Settings → Pagination**, turn it on and set a threshold of 2000.

## 3. Select ×5 — put every sheet's rows in the same shape

The sheets have their columns in slightly different orders, so tidy each
one into the same set of fields. Add a **Data Operation → Select** action
after each List rows action.

- **From**: the List rows action's `value` output
- **Map**: click **Switch Map to text mode** (the small `T` icon), then
  paste the block below. Change only the `"record"` value to match the
  sheet: `Candidate`, `Sales Contact`, `Placement`, `Job`, `Submission`.

```json
{
  "record": "Candidate",
  "name": "@{trim(coalesce(item()?['Automation Name'], ''))}",
  "status": "@{item()?['Status']}",
  "activation": "@{item()?['Activation Type']}",
  "purpose": "@{item()?['Purpose']}",
  "list": "@{item()?['List Name']}",
  "exclusion": "@{item()?['Exclusion List']}",
  "days": "@{item()?['Days Allowed to Send']}",
  "start": "@{item()?['Send Start Time']}",
  "end": "@{item()?['Send End Time']}",
  "timezone": "@{item()?['Time Zone']}",
  "reentry": "@{item()?['Re-Entry Settings']}",
  "reentryFrequency": "@{item()?['Re-Entry Frequency']}",
  "groups": "@{item()?['Groups']}",
  "created": "@{item()?['Date Created']}",
  "modified": "@{item()?['Date Last Modified']}",
  "url": "@{item()?['Automation URL']}"
}
```

Name them `Select Candidate`, `Select SalesContact`, `Select Placement`,
`Select Job`, `Select Submission`.

If a column is ever renamed in the spreadsheet, update the name in quotes
here (e.g. `'Purpose'`) or that field will come through blank.

## 4. Compose "All automations"

After all five branches (the Compose must come after the branches join).
Inputs, in the expression editor (`fx`):

```
union(body('Select_Candidate'), body('Select_SalesContact'), body('Select_Placement'), body('Select_Job'), body('Select_Submission'))
```

## 5. Filter array

- **From**: `outputs('All_automations')`
- **Condition**: left box, expression `empty(item()?['name'])`; middle,
  **is equal to**; right box, expression `false`.

This drops the blank rows at the bottom of each sheet. Name it
`Filter automations`.

## 6. Select "Register lines" — one line of text per automation

This is what the AI reads. It's deliberately shorter than the full row so
the prompt stays small; the page shows the full details itself from the
rows in step 5.

- **From**: `body('Filter_automations')`
- **Map**: switch to text mode and paste this as an expression (`fx`), not
  as a key/value pair:

```
concat(item()?['record'], ' | ', item()?['status'], ' | ', item()?['name'], ' | Does: ', item()?['purpose'], ' | List: ', item()?['list'], ' | Groups: ', item()?['groups'])
```

## 7. Select "Conversation lines"

- **From**: `triggerBody()?['conversation']`
- **Map** (text mode, expression):

```
concat(if(equals(item()?['role'], 'user'), 'Staff member: ', 'Assistant: '), item()?['content'])
```

## 8. Compose "Prompt input"

Bundles everything into the single text input the AI Builder prompt takes:

```
concat('AUTOMATION REGISTER (record type | status | automation name | what it does | who it runs on | groups):', decodeUriComponent('%0A'), join(body('Register_lines'), decodeUriComponent('%0A')), decodeUriComponent('%0A'), decodeUriComponent('%0A'), 'CONVERSATION SO FAR:', decodeUriComponent('%0A'), join(body('Conversation_lines'), decodeUriComponent('%0A')))
```

`decodeUriComponent('%0A')` is a line break, so this can be pasted as one
line without typing real line breaks into the expression editor.

## 9. Run a prompt

Create a new AI Builder Prompt (AI Builder → Prompts), GPT-4o, default
settings, with a single **Text input** variable. Set its body to:

```
You help staff at Fuse Recruitment, an Australian recruitment agency, find out whether an automation already exists in Bullhorn Automation (formerly Herefish).

You will be given the full automation register, one automation per line, followed by the conversation so far. The latest message from the staff member is the one to answer. Earlier messages give context, for example a follow-up like "what about for sales contacts?".

Record types: "Candidate" automations run on jobseekers. "Sales Contact" automations run on client contacts. "Placement", "Job" and "Submission" automations run on those Bullhorn records.

Each register line has the automation's name, what it does ("Does:") and who it runs on ("List:"). The List is usually the trigger or condition. For example "List: In List: Candidates Submitted to Client L7D" means it runs on candidates submitted to a client in the last 7 days. The name often describes the automation too.

How to answer:
- Find the automations in the register that best match what the staff member described. Match on meaning, not just shared words. For example "texts people when their email doesn't work" matches an automation whose purpose is "Sends SMS about email bounce".
- Check the name, "Does:" AND "List:" of every line. When the staff member says when or for whom something should happen (e.g. "after they're submitted to a client"), that usually matches the List, not "Does:".
- If several near-identical automations do the same job for different values (e.g. one per state), say so in "answer" (e.g. "There's one for each state") and return the most relevant ones.
- Return up to 3 matches, best first. Only include an automation if it is a genuine match or a close relative worth knowing about. Returning no matches is fine and is better than returning weak ones.
- If the staff member mentions a record type (candidates, contacts, clients, placements, jobs, submissions), prefer automations for that record type.
- Active automations are usually more useful than Paused, Retired or Hibernated ones, but still return an inactive one if it is the best match, and say in "why" that it is not currently running.
- Copy "name" and "record" EXACTLY as they appear in the register, character for character. Never invent, shorten or tidy up a name. Never make up an automation that is not in the register.
- "why" is one short sentence explaining what the automation does and why it fits. Plain Australian English.
- "answer" is one or two short sentences that directly answer the question, e.g. "Yes, there's an active Candidate automation that does this." or "Not exactly. The closest is one that does X, but it only runs on Y." or "No, nothing in the register does this."
- "question": only if the request is too vague to search sensibly (e.g. "the email one"), ask ONE short question to narrow it down, and return your best guesses in "matches" anyway if there are any. Otherwise null.

Respond with ONLY raw JSON, no markdown fences, no preamble, matching exactly this shape:
{"answer": string, "matches": [{"name": string, "record": string, "why": string}], "question": string|null}

Data:

[insert the "Text input" variable here — Compose "Prompt input"'s output]
```

In the flow, point **Run a prompt** at this prompt and set its Text input
to `outputs('Prompt_input')`.

**Size check:** the register is roughly 360 automations, which comes to
around 50,000 characters of input. If the prompt step complains the input
is too long, take `' | Groups: ', item()?['groups']` out of step 6 first,
then `' | List: ', item()?['list']`.

## 10. Compose "Reply text"

Inputs: the **Run a prompt** step's text output, from the dynamic content
picker (labelled something like "Text" or "responsetext").

## 11. Response

- **Status code**: 200
- **Headers**: `Content-Type` = `application/json`
- **Body**, as an expression (`fx`):

```
addProperty(addProperty(json('{}'), 'reply', outputs('Reply_text')), 'automations', body('Filter_automations'))
```

That returns:

```json
{
  "reply": "{\"answer\":\"...\",\"matches\":[...],\"question\":null}",
  "automations": [ { "record": "Candidate", "name": "...", "url": "https://app.herefish.com/...", ... } ]
}
```

`reply` is the AI's text, untouched; the page parses it. `automations` is
the tidied register. The page looks up each match by name in this list and
shows the details and link from the spreadsheet, not from the AI, so a link
can never be made up.

## 12. Wire it up

1. Save the flow and copy the trigger's **HTTP POST URL** (the one with
   `sig=...`).
2. Set it as the Worker's `POWER_AUTOMATE_FINDER_URL` secret and deploy.
   See `worker/DEPLOY.md`.
3. Open https://fuserecruitment.github.io/hub/automation-finder/ and try
   one of the example questions.

## Permissions

The Excel actions run as whoever owns the flow's Excel connection, so that
person needs access to the Marketing site. Anyone using the page doesn't,
they only ever see what the flow sends back.

## Rotating the signature later

If the trigger URL is regenerated, update the Worker secret with the new
URL and redeploy. The page never needs to change.
