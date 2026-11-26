# Social post generator: SharePoint and Power Automate setup

One scheduled flow keeps a SharePoint **Jobs** list in step with fuserecruitment.com, then rebuilds the tool file with the latest jobs inside it. Staff only ever open `fuse-social-posts.html` from SharePoint.

```
fuserecruitment.com  ──(hourly flow)──►  Jobs list  ──(same flow)──►  fuse-social-posts.html  ◄── staff open this link
                                                       ▲
                                         _build/template.html (you replace this when the tool changes)
```

> These steps haven't been run in Fuse's tenant yet. Test the flow on a copy first, and check the expressions marked **(check)**.

## 1. Files in the "Social Post Generator" folder

| File | What it is |
|---|---|
| `fuse-social-posts.html` | The tool staff open. The flow overwrites it. Don't edit it by hand. |
| `_build/template.html` | The tool without data. Upload new versions here (same name, **Replace**). |

Share the link to `fuse-social-posts.html` once. Because the flow overwrites the same file, the link never changes.

## 2. The Jobs list

Create a list called **Jobs** on the same site, with these columns:

| Column | Type | Notes |
|---|---|---|
| Title | (built in) | Job title |
| JobKey | Single line of text | The ID at the end of the job link. Turn on **Enforce unique values** (this also indexes it). |
| Reference | Single line of text | Bullhorn reference, e.g. BH-40427 |
| Url | Single line of text | Link to the job ad (fine at 255 characters) |
| Summary | Multiple lines (plain text) | |
| Description | Multiple lines (plain text) | Full ad as plain text |
| Location | Single line of text | |
| State | Single line of text | |
| Country | Single line of text | |
| WorkType | Single line of text | Full time, Part time, Contract/temp, Graduate |
| Salary | Single line of text | Often blank: the website only sometimes includes it |
| DatePosted | Date only | |
| ValidThrough | Date only | |
| LastModified | Single line of text | Copied from the sitemap. The flow uses it to skip unchanged jobs. |
| Status | Choice: Open, Closed | Default Open |
| HideFromPosts | Yes/No | Default No. Tick to keep a job out of the tool. |

## 3. The flow: "Social posts: sync jobs and rebuild"

**Trigger:** Recurrence, every 1 hour (optionally only 7am to 7pm, Australia/Melbourne time). You can also click **Run** in Power Automate any time to rebuild straight away.

The flow uses the **HTTP** action, which needs Power Automate Premium. Your tt planner already uses Premium, so this should be covered.

### Part A: read what's live on the website

1. **HTTP**, name it `Get sitemap`: GET `https://www.fuserecruitment.com/wp-content/plugins/applyflow-cms-extension/jobs-sitemap.php`
2. **Compose**, name it `Sitemap urls`:
   `xpath(xml(body('Get_sitemap')), '//*[local-name()="url"]')`
3. **SharePoint: Get items** from Jobs, name it `Get open jobs`. Filter query `Status eq 'Open'`. Top count 5000, and turn on Pagination in Settings.

### Part B: add new jobs and update changed ones

4. **Apply to each** over `outputs('Sitemap_urls')`. In Settings, set Concurrency to 4. Inside it:
   1. **Compose** `Loc`: `xpath(item(), 'string(//*[local-name()="loc"])')`
   2. **Compose** `Lastmod`: `xpath(item(), 'string(//*[local-name()="lastmod"])')`
   3. **Compose** `Key` (the ID at the end of the link, which ends in `/`): `first(skip(reverse(split(outputs('Loc'), '/')), 1))`
   4. **Filter array** `Existing`: from `body('Get_open_jobs')?['value']`, where `item()?['JobKey']` equals `outputs('Key')`.
   5. **Condition:** `length(body('Existing'))` is 0, **or** `first(body('Existing'))?['LastModified']` is not equal to `outputs('Lastmod')`.
      - **If yes:**
        1. **HTTP** `Get job page`: GET `outputs('Loc')`
        2. **Compose** `JobJson`:
           `json(first(split(last(split(body('Get_job_page'), 'application/ld+json">')), '</script>')))` **(check)**: match the exact text of the `<script ... ld+json">` tag on the page.
        3. **Compose** `MetaDescription`:
           `first(split(last(split(body('Get_job_page'), '<meta name="description" content="')), '"'))`
        4. **Content Conversion: Html to text** with `outputs('JobJson')?['description']`
        5. If `Existing` was empty, use **SharePoint: Create item**. Otherwise use **Update item** with ID `first(body('Existing'))?['ID']`. Fill in:
           - Title: `outputs('JobJson')?['title']`
           - JobKey: `outputs('Key')`
           - Reference: `outputs('JobJson')?['identifier']?['value']`
           - Url: `outputs('Loc')`
           - Summary: `outputs('MetaDescription')` (it ends with ". BH-xxxxx", which the tool removes)
           - Description: the Html to text output
           - Location: `outputs('JobJson')?['jobLocation']?['address']?['addressLocality']`
           - State: `...?['addressRegion']`, Country: `...?['addressCountry']`
           - WorkType: `outputs('JobJson')?['employmentType']` (FULL_TIME, PART_TIME and so on, which the tool turns into friendly names)
           - DatePosted: `outputs('JobJson')?['datePosted']`
           - ValidThrough: `outputs('JobJson')?['validThrough']`
           - LastModified: `outputs('Lastmod')`
           - Status: Open

### Part C: close jobs that have come down

5. **Select** `Live keys` from `outputs('Sitemap_urls')`. Map (text mode): `first(skip(reverse(split(xpath(item(), 'string(//*[local-name()="loc"])'), '/')), 1))`
6. **Filter array** `Gone`: from `body('Get_open_jobs')?['value']`, where `contains(body('Live_keys'), item()?['JobKey'])` is false.
7. **Apply to each** over `body('Gone')`: **Update item**, Status = Closed.

### Part D: rebuild the tool file

8. **SharePoint: Get items** `Get jobs for tool`. Filter query `Status eq 'Open' and HideFromPosts eq 0`, order by `DatePosted desc`, Top count 5000, Pagination on.
9. **Select** `Tool jobs`, mapping each item to these keys (the names must match exactly):

   | Key | Value |
   |---|---|
   | id | `item()?['Reference']` |
   | title | `item()?['Title']` |
   | url | `item()?['Url']` |
   | summary | `item()?['Summary']` |
   | location | `item()?['Location']` |
   | state | `item()?['State']` |
   | country | `item()?['Country']` |
   | workType | `item()?['WorkType']` |
   | salary | `item()?['Salary']` |
   | datePosted | `item()?['DatePosted']` |
   | description | `item()?['Description']` |

10. **Compose** `Data`:
    `replace(string(json(concat('{"generatedAt":"', utcNow(), '","jobs":', string(body('Tool_jobs')), '}'))), '</', '<\/')`
11. **SharePoint: Get file content using path** `Get template`: `/<library>/Marketing/Social Post Generator/_build/template.html`
12. **Compose** `Tool html`:
    `replace(base64ToString(body('Get_template')?['$content']), '__FUSE_DATA__', outputs('Data'))` **(check)**: if the template comes back as plain text rather than base64, use `replace(string(body('Get_template')), ...)` instead.
13. **SharePoint: Update file** for `fuse-social-posts.html`, with file content `outputs('Tool_html')`. If the action asks for a file identifier, use **Get file metadata using path** first.

## 4. Updating the tool

1. I send you a new `template.html`.
2. Upload it to `_build/` with the same name and choose **Replace**.
3. Run the flow, or wait for the next hourly run. Staff see the new version the next time they open the link.

## 5. Checks after the first run

- The Jobs list has about the same number of Open items as the website's job count.
- Opening `fuse-social-posts.html` from SharePoint shows "Jobs updated" with a recent time in the header.
- Taking a job down on the website changes its list item to Closed after the next run.
