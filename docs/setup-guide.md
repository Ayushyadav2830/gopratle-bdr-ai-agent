# GoPratle BDR Agent - Setup & Configuration Guide

This guide walks you through setting up the complete GoPratle BDR Lead Enrichment and Outreach system using n8n or the local runner.

---

## 1. Prerequisites

- **Node.js**: v18.0.0 or higher
- **n8n**: Cloud account (https://n8n.io) or self-hosted n8n
- **Google Cloud Platform**: GCP project with Google Sheets API and Gmail API enabled
- **Google Gemini API Key**: From Google AI Studio (https://aistudio.google.com/)
- **Tavily API Key**: From Tavily Search (https://tavily.com/)
- **Telegram Bot Token** *(Optional)*: From @BotFather on Telegram

---

## 2. Google Sheets Setup

1. Open [Google Sheets](https://sheets.new) and create a spreadsheet named:
   ```text
   GoPratle_BDR_Lead_Database
   ```
2. Rename the first tab to:
   ```text
   Leads
   ```
3. Import or copy the template from `templates/GoPratle_BDR_Lead_Database_Template.csv`:
   - Click **File > Import > Upload** and select `templates/GoPratle_BDR_Lead_Database_Template.csv`.
   - Choose **Replace current sheet**.
4. The sheet will contain the 22 required columns:
   `Company_Name`, `City`, `Target_Role`, `Lead_Name`, `Job_Title`, `LinkedIn_URL`, `Public_Email`, `Contact_Source`, `Company_Context`, `AI_Pitch`, `Email_Subject`, `Lead_Confidence`, `Research_Status`, `Outreach_Status`, `Outreach_Message_ID`, `Followup_Date`, `Followup_Status`, `Last_Contacted_At`, `Reply_Status`, `Error_Details`, `Created_At`, `Updated_At`.
5. *(Optional Webhook Sync)*: Open **Extensions > Apps Script**, paste `scripts/google-sheets-appscript.js`, set your n8n webhook URL, and save.

---

## 3. API Keys & Credentials

### A. Google Gemini API
1. Visit https://aistudio.google.com/app/apikey
2. Click **Create API key** and copy your key.
3. Add to your `.env` or n8n Environment Variables as `GEMINI_API_KEY`.

### B. Tavily Search API
1. Visit https://tavily.com/
2. Register and obtain your free API key.
3. Add to `.env` or n8n Environment Variables as `TAVILY_API_KEY`.

### C. Google Sheets & Gmail OAuth in n8n
1. In n8n, navigate to **Credentials > New Credential**.
2. Select **Google Sheets OAuth2 API**:
   - Follow n8n's guided Google Cloud OAuth setup.
   - Required scopes: `https://www.googleapis.com/auth/spreadsheets`.
3. Select **Gmail OAuth2 API**:
   - Required scopes: `https://www.googleapis.com/auth/gmail.compose` and `https://www.googleapis.com/auth/gmail.modify`.

---

## 4. Importing Workflows into n8n

1. Log into your n8n instance.
2. In the left sidebar, click **Workflows > Add Workflow**.
3. Click the top-right **Options menu (⋮) > Import from File**:
   - Import `workflows/01-lead-enrichment.json`
   - Import `workflows/02-followup-agent.json`
   - *(Optional)* Import `workflows/03-telegram-intake.json`
4. In each imported workflow:
   - Select your configured Google Sheets and Gmail credentials on the corresponding nodes.
   - Verify the `documentId` points to your `GoPratle_BDR_Lead_Database`.
   - Set the workflow to **Active**.

---

## 5. Local Execution & Automated Testing

You can run and test the complete system locally without n8n:

1. Clone or navigate to the repository:
   ```bash
   cd gopratle-bdr-ai-agent
   ```
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Run the automated acceptance test suite (tests all 10 scenarios):
   ```bash
   npm test
   ```
   Or:
   ```bash
   node scripts/run-tests.js
   ```

---

## 6. Safety & Test Mode Settings

- By default, `TEST_MODE=true` is enabled.
- All outreach drafts and test messages are addressed to `TEST_RECIPIENT_EMAIL` (your controlled candidate inbox).
- Real prospects will **never** receive unapproved emails.
- To promote a lead to real outreach, human approval is strictly required (`Outreach_Approved = Yes`).
