# "Mark checked" — Power Automate flow spec

Behind the **Checked – looks fine** tick box on the Journey Map's "Might need
update" tab, its cards, and Automation Finder answers. Ticking it writes
today's date into that automation's **Last Checked** cell in the register,
which hides its "Might need update" flag for 90 days (see
`../shared/automation-checks.js`).

This is its own small flow, separate from the Automation Finder flow
(`FLOW_SPEC.md`), so the search flow never writes to the register.

```
When an HTTP request is received   { record, url }
 └─ Compose "Today"
     └─ Switch on record
         ├─ Candidate      → Update a row (Table1)
         ├─ Sales Contact  → Update a row (Table2)
         ├─ Placement      → Update a row (Table3)
         ├─ Job            → Update a row (Table4)
         └─ Submission     → Update a row (Table5)
             └─ Response   { "checked": "YYYY-MM-DD" }
```

The page calls the Cloudflare Worker's `/api/check` route, never the flow.
The worker only passes on a known record type and a
`https://app.herefish.com/Automations/Automation/<number>` link, and holds
this flow's URL as the `POWER_AUTOMATE_CHECK_URL` secret.

## 1. Trigger

New **Instant cloud flow** named `Automation Finder - Mark checked`, trigger
**When an HTTP request is received**.

- **Request Body JSON Schema** → **Use sample payload to generate schema**:

  ```json
  { "record": "Candidate", "url": "https://app.herefish.com/Automations/Automation/41014" }
  ```

- **Who can trigger the flow** (if shown): **Anyone**.

## 2. Compose "Today"

Today's date in Australian Eastern time, as `YYYY-MM-DD`. Inputs, as an
expression (`fx`):

```
convertTimeZone(utcNow(), 'UTC', 'AUS Eastern Standard Time', 'yyyy-MM-dd')
```

## 3. Switch on the record type

Add **Control → Switch**. **On**: `triggerBody()?['record']` (expression).

Add five cases. In each, add **Excel Online (Business) → Update a row**:

| Case equals | Table |
|---|---|
| `Candidate` | `Table1` |
| `Sales Contact` | `Table2` |
| `Placement` | `Table3` |
| `Job` | `Table4` |
| `Submission` | `Table5` |

For every **Update a row**:

- **Location**: the Marketing SharePoint site
- **Document Library**: Documents
- **File**: `/BH Automation (Herefish)/Active Automation Register 2026.xlsx`
- **Table**: from the table above
- **Key Column**: `Automation URL`
- **Key Value**: `triggerBody()?['url']` (expression)
- Once the table is picked, a box appears for every column. Leave them all
  empty except **Last Checked**: `outputs('Today')` (expression). Empty boxes
  are left as they are in the register.

(The register's tables are called `Table1`–`Table5` in sheet order. If
they're ever renamed, pick the one on the matching sheet.)

Leave **Default** empty: the worker never sends any other record type.

If no row has that Automation URL, Update a row fails, the flow stops before
the Response, and the page says it couldn't save.

## 4. Response

This step is required. Without it, Power Automate answers the page straight
away with an empty "accepted" before the row is updated, and the page treats
that as "couldn't save".

After the Switch (not inside a case), add **Response**:

- **Status Code**: `200`
- **Headers**: `Content-Type` = `application/json`
- **Body**:

  ```
  { "checked": "@{outputs('Today')}" }
  ```

## 5. Wire it up

1. Save, and copy the trigger's **HTTP URL** (the one with `sig=`). Don't
   paste it anywhere else.
2. Cloudflare → **Workers & Pages** → `bullhorn-automation-finder` →
   **Settings** → **Variables and Secrets** → **Add** → type **Secret**, name
   `POWER_AUTOMATE_CHECK_URL`, paste the URL → **Deploy**.
3. Tick a flagged automation on the Journey Map's "Might need update" tab and
   check its Last Checked cell in the register.

The Excel actions run as whoever owns the flow's Excel connection. To reset
this flow's URL later, use the steps in "Rotating the signature later" in
`FLOW_SPEC.md` on this flow, then update `POWER_AUTOMATE_CHECK_URL`.
