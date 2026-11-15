# GoPratle BDR Agent - Setup & Configuration Guide

This guide details how to configure and execute the GoPratle BDR Lead Enrichment and Outreach Agent in production and testing environments.

---

## 1. System Implementation & Readiness Matrix

| Component | Status | Details |
| :--- | :--- | :--- |
| **Local Test Suite** | **Fully Tested (17/17 Pass)** | Verified across all acceptance scenarios using unit mocks. |
| **n8n Lead Enrichment Workflow** | **Implemented & Verified** | Complete JSON with real HTTP requests, duplicate branching, and Gmail draft nodes. |
| **n8n Follow-up Workflow** | **Implemented & Verified** | Complete JSON with schedule trigger, skip/suppress/draft routing. |
| **Production Runner Scripts** | **Implemented** | Real API callers (Tavily, Gemini, Sheets v4, Gmail) without silent mock fallbacks. |
| **Live Credential Integrations** | **Requires User Configuration** | API keys and OAuth tokens must be supplied by the user. |

---

## 2. Credentials & Permissions Required from User

To run live research and outreach against your actual Google Sheet and Gmail accounts, you will need to provide the following credentials:

| # | Credential / Setting | Where to Obtain | Purpose |
| :-: | :--- | :--- | :--- |
| **1** | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) | Powers candidate relevance ranking and 3-line personalized pitch writing. |
| **2** | `TAVILY_API_KEY` | [Tavily Search](https://tavily.com/) | Real-time web search for company context, decision-makers, and public emails. |
| **3** | `GOOGLE_SHEET_ID` | From your Google Sheet URL | The target spreadsheet storing the 22-column lead database. |
| **4** | Google Sheets OAuth2 | Google Cloud Console / n8n Credentials | Authorizes reading and writing lead rows. |
| **5** | Gmail OAuth2 | Google Cloud Console / n8n Credentials | Authorizes creating drafts in your Gmail account. |
| **6** | `TEST_RECIPIENT_EMAIL` | Candidate's email address | Controlled inbox where demo emails are sent during test mode. |
| **7** | `TELEGRAM_BOT_TOKEN` *(Optional)* | [@BotFather](https://t.me/BotFather) | Enables Phase 2 mobile command intake (`/connect`). |

---

## 3. Step-by-Step Google Sheets Setup

1. Open [Google Sheets](https://sheets.new) and create a spreadsheet titled:
   ```text
   GoPratle_BDR_Lead_Database
   ```
2. Rename the first sheet tab to:
   ```text
   Leads
   ```
3. Import the official template:
   - Click **File > Import > Upload** and select `templates/GoPratle_BDR_Lead_Database_Template.csv`.
   - Choose **Replace current sheet**.
4. Copy the Sheet ID from the browser URL:
   `https://docs.google.com/spreadsheets/d/`**`<GOOGLE_SHEET_ID>`**`/edit`
5. *(Optional Webhook)*: If you want edits to automatically push to n8n, click **Extensions > Apps Script**, paste `scripts/google-sheets-appscript.js`, set your `N8N_WEBHOOK_URL`, and add an `On Edit` trigger.

---

## 4. Configuring n8n

1. **Import Workflows**:
   - In n8n, click **Workflows > Import from File**.
   - Select `workflows/01-lead-enrichment.json`.
   - Select `workflows/02-followup-agent.json`.
   - *(Optional)* Select `workflows/03-telegram-intake.json`.
2. **Configure Credentials in n8n**:
   - Under **Credentials**, add **Google Sheets OAuth2 API** and authenticate your Google account.
   - Add **Gmail OAuth2 API** and authenticate your Gmail account.
3. **Set Environment Variables in n8n**:
   - Go to **Settings > Variables** and add:
     - `GEMINI_API_KEY`: Your Gemini API key.
     - `TAVILY_API_KEY`: Your Tavily API key.
     - `GOOGLE_SHEET_ID`: Your spreadsheet ID.
     - `TEST_MODE`: `true`
     - `TEST_RECIPIENT_EMAIL`: Your test email address.
4. **Activate Workflows**:
   - Toggle both workflows to **Active**.

---

## 5. Live Testing Procedure

### Step 1: Automated Unit & Edge Case Verification
Run the 17-scenario test suite locally (zero credentials needed, runs in < 2 seconds):
```bash
cd gopratle-bdr-ai-agent
npm test
```

### Step 2: Live Enrichment Test (Happy Path)
1. In your Google Sheet, add a new row:
   - `Company_Name`: `Zomato`
   - `City`: `Gurgaon`
2. Wait 60 seconds (or click "Test Step" in n8n):
   - `01-lead-enrichment.json` triggers.
   - Tavily conducts 3 targeted searches.
   - Lead is identified and scored High confidence.
   - Gemini formats a 3-line pitch.
   - Sheet updates in-place with `Research_Status = Completed` and `Outreach_Status = Draft Created`.
   - Gmail creates a draft in your inbox.
3. Verify your Gmail account: Check the **Drafts** folder to see the generated email.

### Step 3: Duplicate Prevention Test
1. Add another row with `Company_Name`: `zomato ltd` and `City`: `GURGAON`.
2. Observe the workflow:
   - Duplicate check normalizes company and city, detects the existing entry.
   - Updates the row with `Research_Status = Duplicate`.
   - Halts execution without calling Tavily or drafting duplicate emails.

### Step 4: Follow-up Test
1. Change `Outreach_Status` of a test lead to `Sent (Test)` and set `Followup_Date` to yesterday's date.
2. Trigger `02-followup-agent.json`:
   - Follow-up agent detects the due date.
   - Checks that `Reply_Status` is not `Replied` or `Opted Out`.
   - Creates a follow-up draft in Gmail.
   - Updates `Followup_Status` to `Draft Created`.
