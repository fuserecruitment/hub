# Social Post Generator: SharePoint list and Power Automate flows

The page never reads fuserecruitment.com itself, and nothing about the jobs
is stored in this public repo. Instead:

```
fuserecruitment.com ──(1. Sync jobs, hourly)──► SharePoint "Jobs" list
                                                     │
page ──► worker /api/jobs ────► 2. Get jobs ─────────┤
page ──► worker /api/caption ─► 3. Write caption ────┘──► Run a prompt
```

1. **Sync jobs** (scheduled, hourly) copies the live jobs from the website
   into the Jobs list. It only opens job pages that are new or have changed.
2. **Get jobs** (HTTP trigger) returns the open jobs to the page.
3. **Write caption** (HTTP trigger) looks up one job, asks the AI for two
   caption drafts and returns them.

The browser doesn't call flows 2 and 3 directly. It calls the Cloudflare
Worker (`worker/`), which holds their signed trigger URLs as secrets. See
`worker/DEPLOY.md`.

> Not yet built in Fuse's tenant. Steps marked **(check)** depend on exactly
> what SharePoint or the website sends back, so test them on the first run.

## 0. The Jobs list

On the Marketing site, the list is called **Social Post Generator - Jobs List**
(created 26 Nov 2026). Wherever this guide says "the Jobs list" or "from
Jobs", pick that list in the SharePoint action's **List Name** dropdown.
Its columns:

| Column | Type | Notes |
|---|---|---|
| Title | (built in) | Job title |
| JobKey | Single line of text | The ID at the end of the job link. Turn on **Enforce unique values** (this also indexes it). |
| Reference | Single line of text | Bullhorn reference, e.g. BH-40427. **Indexed** (List settings → Indexed columns), because flow 3 filters on it. |
| Url | Single line of text | Link to the job ad |
| Summary | Multiple lines (plain text) | |
| Description | Multiple lines (plain text) | Full ad as plain text |
| Location | Single line of text | |
| State | Single line of text | |
| Country | Single line of text | |
| WorkType | Single line of text | FULL_TIME, CONTRACT/TEMP etc. The page shows friendly names. |
| Salary | Single line of text | Usually blank: the website's job data rarely includes it |
| DatePosted | Date only | |
| ValidThrough | Date only | |
| LastModified | Single line of text | From the website's job sitemap. Used to skip unchanged jobs. |
| Status | Choice: Open, Closed | Default Open |
| HideFromPosts | Yes/No | Default No. Tick to keep a job out of the tool. |

## 1. Sync jobs

**Trigger:** Recurrence, every 1 hour. You can also click **Run** any time.
Uses the **HTTP** action (Premium).

### Read what's live on the website

1. **HTTP** `Get sitemap`: GET
   `https://www.fuserecruitment.com/wp-content/plugins/applyflow-cms-extension/jobs-sitemap.php`
2. **Compose** `Sitemap urls`:
   `xpath(xml(body('Get_sitemap')), '//*[local-name()="url"]')`
3. **SharePoint: Get items** `Get open jobs` from Jobs. Filter query
   `Status eq 'Open'`. Top count 5000, and turn on **Pagination** in
   Settings (threshold 5000).

### Add new jobs, update changed ones

4. **Apply to each** over `outputs('Sitemap_urls')`. Settings: Concurrency 4.
   Inside it:
   1. **Compose** `Loc`: `xpath(item(), 'string(//*[local-name()="loc"])')`
   2. **Compose** `Lastmod`: `xpath(item(), 'string(//*[local-name()="lastmod"])')`
   3. **Compose** `Key` (the link ends in `/`, so take the second-last part):
      `first(skip(reverse(split(outputs('Loc'), '/')), 1))`
   4. **Filter array** `Existing`: from `body('Get_open_jobs')?['value']`,
      where `item()?['JobKey']` is equal to `outputs('Key')`.
   5. **Condition**: `length(body('Existing'))` is equal to 0, **or**
      `first(body('Existing'))?['LastModified']` is not equal to `outputs('Lastmod')`.
      - **If yes:**
        1. **HTTP** `Get job page`: GET `outputs('Loc')`, header
           `User-Agent` = `Mozilla/5.0`
        2. **Condition** `Has job data`:
           `contains(body('Get_job_page'), '"JobPosting"')` is equal to `true`.
           Some pages still in the sitemap have no job data (e.g. BH-40231 on
           26 Nov 2026, likely closing), so steps 3 to 6 go in its **True**
           branch and **False** stays empty: those pages are skipped and
           checked again next run.
        3. **Compose** `JobJson`, the job's structured data on the page
           (the tag is exactly `<script type="application/ld+json">`):
           `json(first(split(last(split(body('Get_job_page'), 'application/ld+json">')), '</script>')))`
        4. **Compose** `MetaDescription`:
           `first(split(last(split(body('Get_job_page'), '<meta name="description" content="')), '"'))`
        5. **Content Conversion: Html to text**, renamed `Ad text`, content
           `outputs('JobJson')?['description']`
        6. If `Existing` is empty, **SharePoint: Create item**. Otherwise
           **Update item** with ID `first(body('Existing'))?['ID']`.
           Both on the Jobs list, with:
           - Title: `outputs('JobJson')?['title']`
           - JobKey: `outputs('Key')`
           - Reference: `outputs('JobJson')?['identifier']?['value']`
           - Url: `outputs('Loc')`
           - Summary: `outputs('MetaDescription')` (it ends with the reference; the page tidies that)
           - Description: `body('Ad_text')` (Html to text returns plain text, not an object)
           - Location: `outputs('JobJson')?['jobLocation']?['address']?['addressLocality']`
           - State: `outputs('JobJson')?['jobLocation']?['address']?['addressRegion']`
           - Country: `outputs('JobJson')?['jobLocation']?['address']?['addressCountry']`
           - WorkType: `outputs('JobJson')?['employmentType']`
           - DatePosted: `outputs('JobJson')?['datePosted']`
           - ValidThrough: `outputs('JobJson')?['validThrough']`
           - LastModified: `outputs('Lastmod')`
           - Status: Open

### Close jobs that have come down

5. **Select** `Live keys` from `outputs('Sitemap_urls')`. Map (text mode):
   `first(skip(reverse(split(xpath(item(), 'string(//*[local-name()="loc"])'), '/')), 1))`
6. **Filter array** `Gone`: from `body('Get_open_jobs')?['value']`, where
   `contains(body('Live_keys'), item()?['JobKey'])` is equal to `false`.
7. **Apply to each** over `body('Gone')`: **Update item**, Status = Closed.

The first run reads all ~235 job pages and takes a while. After that, a run
usually opens only a handful.

## 2. Get jobs

```
When an HTTP request is received → Get items → Select → Response
```

1. **When an HTTP request is received.** No schema needed (the worker always
   sends `{}`). If there's a **Who can trigger the flow** setting, set it to
   **Anyone**.
2. **SharePoint: Get items** `Get jobs` from Jobs. Filter query
   `Status eq 'Open' and HideFromPosts eq 0`. Order by `DatePosted desc`.
   Top count 5000, Pagination on.
3. **Select** `Tool jobs` from `body('Get_jobs')?['value']`, with these keys
   (names must match exactly, the page reads them):

   | Key | Value |
   |---|---|
   | id | `item()?['Reference']` |
   | title | `item()?['Title']` |
   | url | `item()?['Url']` |
   | summary | `item()?['Summary']` |
   | location | `item()?['Location']` |
   | state | `item()?['State']` |
   | workType | `item()?['WorkType']` |
   | salary | `item()?['Salary']` |
   | datePosted | `item()?['DatePosted']` |
   | description | `item()?['Description']` |

4. **Response**: status 200, header `Content-Type` = `application/json`,
   body (expression):
   `addProperty(json('{}'), 'jobs', body('Tool_jobs'))`

The page keeps what it gets for an hour per browser tab, and has a
**Refresh** link to fetch again.

## 3. Write caption

```
When an HTTP request is received → Get items (1 job) → Compose "Prompt input" → Run a prompt → Response
```

### 3.1 Trigger

**When an HTTP request is received.** Generate the schema from this sample:

```json
{
  "jobId": "BH-40427",
  "platform": "linkedin",
  "angle": "growth",
  "name": "Sam Taylor",
  "role": "Senior Consultant",
  "notes": "immediate start"
}
```

**Who can trigger the flow**: **Anyone**. The worker has already checked
that `jobId` looks like a reference and that `platform` and `angle` are
from the known lists, and it cuts `name`, `role` and `notes` short.

### 3.2 Get the job

**SharePoint: Get items** `Get job` from Jobs. Filter query
`Reference eq '@{triggerBody()?['jobId']}'`, Top count 1.

### 3.3 Compose "Prompt input"

One block of text for the AI. In the expression editor:

```
concat(
 'PLATFORM: ', triggerBody()?['platform'], decodeUriComponent('%0A'),
 'ANGLE: ', triggerBody()?['angle'], decodeUriComponent('%0A'),
 'POSTED BY: ', if(empty(triggerBody()?['name']), 'the Fuse Recruitment company page (write as "we")', concat(triggerBody()?['name'], if(empty(triggerBody()?['role']), '', concat(', ', triggerBody()?['role'])), ' at Fuse Recruitment (write in first person and invite people to message them)')), decodeUriComponent('%0A'),
 'ALSO MENTION: ', if(empty(triggerBody()?['notes']), 'nothing extra', triggerBody()?['notes']), decodeUriComponent('%0A%0A'),
 'JOB TITLE: ', first(body('Get_job')?['value'])?['Title'], decodeUriComponent('%0A'),
 'LOCATION: ', first(body('Get_job')?['value'])?['Location'], decodeUriComponent('%0A'),
 'WORK TYPE: ', first(body('Get_job')?['value'])?['WorkType'], decodeUriComponent('%0A'),
 'JOB REFERENCE: ', triggerBody()?['jobId'], decodeUriComponent('%0A'),
 'LINK TO APPLY: ', first(body('Get_job')?['value'])?['Url'], decodeUriComponent('%0A'),
 'SUMMARY: ', first(body('Get_job')?['value'])?['Summary'], decodeUriComponent('%0A%0A'),
 'FULL JOB AD:', decodeUriComponent('%0A'), first(body('Get_job')?['value'])?['Description']
)
```

### 3.4 Run a prompt

Create a new AI Builder Prompt (AI Builder → Prompts), named
**Social post caption**, same model as the Automation Finder prompt, with a
single **Text input** variable. Set its body to the text below, with the
input variable where it says `[INPUT]`.

```
You write social media posts for consultants at Fuse Recruitment, an Australian recruitment agency, to promote one of their live jobs.

The request and the job are below.

[INPUT]

PLATFORM RULES
- linkedin: 80 to 150 words. Open with a strong first line that makes people stop scrolling. Short paragraphs. Finish with a clear call to action and the link to apply. Add 3 relevant hashtags on the last line.
- instagram: 50 to 100 words. Punchy first line. Links are not clickable on Instagram, so tell people to apply through the link in our bio or to search the job reference on fuserecruitment.com. Add 4 to 6 relevant hashtags on the last line.
- facebook: 60 to 120 words. Friendly and conversational. Include the link to apply. 2 or 3 relevant hashtags at most.

ANGLES
- straight: lead with the role, location and pay (if the ad gives it). Factual and easy to scan.
- growth: lead with what the role does for the candidate's career: skills, progression, where it can take them.
- culture: lead with what it is like to work there: the team, the environment, the day-to-day.
- urgent: lead with the fact that the role needs someone soon. Create urgency without sounding desperate.

FUSE STYLE RULES
- Write like a real person: clear, plain-spoken, engaging and friendly. Speak to one person ("you").
- Australian spelling. Sentence case. Short sentences.
- No emoji. No em dashes: use a full stop or a comma instead.
- Avoid corporate filler such as leverage, synergy, utilise, passionate, best-in-class, cutting-edge and game-changer.
- Digits for numbers ($90k, 3 roles, 6 weeks). Australian dollars without "AUD".
- Only use facts from the job details. Never invent pay, benefits, client names or numbers. Take pay from the full job ad if it is there; otherwise leave it out.
- Do not name the client company unless the job ad names it.

OUTPUT
Write 2 different versions. Put a line containing only --- between them. Output only the two posts: no headings, no labels, no notes before or after.
```

In the flow, point **Run a prompt** at this prompt and set its Text input
to `outputs('Prompt_input')`.

The same style rules are in the page's Copilot prompt (`PROMPT_TEMPLATE` in
`index.html`). If you change one, change the other.

### 3.5 Response

- **Status code**: 200
- **Headers**: `Content-Type` = `application/json`
- **Body** (expression), using the **Run a prompt** step's text output:
  `addProperty(json('{}'), 'reply', <Run a prompt text output>)`

The page splits `reply` on the `---` line and shows each draft with a Copy
button. If the AI forgets the `---`, the page shows it as one draft.

## 4. Wire it up

1. Save flows 2 and 3 and copy each trigger's **HTTP POST URL** (the one with
   `sig=...`).
2. Set them as the worker's `POWER_AUTOMATE_JOBS_URL` and
   `POWER_AUTOMATE_CAPTION_URL` secrets and deploy. See `worker/DEPLOY.md`.
3. Run flow 1 once, then open
   https://fuserecruitment.github.io/hub/social-posts/ and pick a job.

## Permissions

The SharePoint actions run as whoever owns each flow's SharePoint
connection, so that person needs access to the Marketing site. People using
the page don't: they only see what the flows send back.

## Rotating the signature later

Same as the other hub flows: see "Rotating the signature later" in
`../automation-finder/FLOW_SPEC.md`, then update the worker secret.
