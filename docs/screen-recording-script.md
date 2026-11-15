# GoPratle BDR Agent - 3-5 Minute Screen Recording Script

This script provides an exact, timestamped walk-through for recording your candidate submission video using OBS Studio or any screen recorder.

---

## Video Overview
- **Duration**: ~4 minutes (within the 3–5 min window)
- **Goal**: Demonstrate a successful, fully working end-to-end execution of lead intake, web research, Gemini AI pitch generation, Google Sheets update, Gmail draft creation, and follow-up scheduling.
- **Recording Checklist**:
  - [ ] Google Sheet tab open (`GoPratle_BDR_Lead_Database`)
  - [ ] n8n canvas or terminal runner open
  - [ ] Gmail web interface open (Drafts folder)
  - [ ] GitHub repository directory open in VS Code

---

## Detailed Scene-by-Scene Script

### Scene 1: Introduction & Architecture (0:00 – 0:25)
- **On Screen**: Architecture diagram in `docs/architecture.md` or README.
- **Spoken Narration**:
  > *"Hello! Today I'm presenting the GoPratle BDR Lead Enrichment and Outreach Agent. GoPratle connects event hosts with vetted event planners, DJs, and professional crews. This system automates lead intake from Google Sheets or Telegram, performs multi-query web research via Tavily, extracts and ranks decision-makers with strict evidence requirements, writes a personalized three-line pitch using Google Gemini 1.5, creates an approval-gated Gmail draft, and manages follow-up scheduling without duplicate messages or hallucinations. Let's see it in action."*

---

### Scene 2: Lead Intake Trigger (0:25 – 0:55)
- **On Screen**: Google Sheet `GoPratle_BDR_Lead_Database` (tab `Leads`).
- **Action**: Add a new row:
  - `Company_Name`: `Zomato`
  - `City`: `Gurgaon`
- **Spoken Narration**:
  > *"Here is our Google Sheet database containing the 22 required tracking fields. I'm adding a new row with Company 'Zomato' and City 'Gurgaon'. As soon as the row is added, our intake trigger detects it, validates that both company and city are present, and checks for existing duplicates."*

---

### Scene 3: Workflow Execution & AI Reasoning (0:55 – 1:55)
- **On Screen**: n8n Workflow Canvas (`01 - Lead Enrichment`) showing node executions, or terminal runner `npm start`.
- **Action**: Highlight the node progression:
  1. Input Validation passes.
  2. Multi-query Tavily research runs: company context, event decision-makers, and public contact details.
  3. Lead Parser filters candidates prioritizing Events > Partnerships > HR > Founders.
  4. Google Gemini generates a concise, 3-line pitch strictly following our schema.
- **Spoken Narration**:
  > *"The workflow executes in real-time. Notice how it runs targeted searches rather than broad queries. In the decision-maker search, it discovers Chaitanya Mathur, Global Head of Events and Live IPs at Zomato. Because his role directly controls festival production and DJ/crew bookings, our parser gives him top priority. Gemini then synthesizes this verified evidence into exactly three personalized lines with zero fabricated claims."*

---

### Scene 4: Google Sheet Update (1:55 – 2:40)
- **On Screen**: Switch back to the Google Sheet.
- **Action**: Highlight the updated row:
  - `Lead_Name`: `Chaitanya Mathur`
  - `Job_Title`: `Global Head - Zomato Live & Events`
  - `Target_Role`: `Events`
  - `Public_Email`: `events-partner@zomato.com`
  - `Contact_Source`: Public LinkedIn & corporate contact URLs
  - `AI_Pitch`: 3 lines displayed cleanly
  - `Lead_Confidence`: `High`
  - `Research_Status`: `Completed`
  - `Outreach_Status`: `Draft Created`
- **Spoken Narration**:
  > *"Looking back at our Google Sheet, the original row has been updated cleanly in-place without creating duplicate rows. We see the lead name, role, verified public contact, source URL, and High confidence rating. The AI pitch contains strictly three lines: acknowledging Zomato's live festival work in Gurgaon, stating GoPratle's value proposition, and ending with a soft call-to-action."*

---

### Scene 5: Gmail Draft & Approval Gate (2:40 – 3:25)
- **On Screen**: Gmail web client in the **Drafts** folder.
- **Action**: Click and open the generated draft.
- **Spoken Narration**:
  > *"Because our system enforces a strict human-in-the-loop safety gate, it does not send cold outreach automatically. Instead, it creates a Gmail draft. Here is the draft: addressed to our verified business contact, with the personalized subject line, clean greeting, and the three-line pitch. In demo mode, it safely routes to our controlled test inbox."*

---

### Scene 6: Follow-up Scheduling & Suppression (3:25 – 4:05)
- **On Screen**: `workflows/02-followup-agent.json` in n8n or terminal showing test cases 9 & 10.
- **Action**: Point out `Followup_Date` (set to +2 days) and `Followup_Status = Pending`.
- **Spoken Narration**:
  > *"Our second workflow handles follow-up automation. It checks for due rows on a 15-minute schedule. Crucially, it verifies that the initial message was actually sent—not just drafted—and checks if the prospect has replied or opted out. If they replied or opted out, the follow-up is automatically suppressed to maintain 100% compliance."*

---

### Scene 7: Repository, JSON Workflows & Conclusion (4:05 – 4:35)
- **On Screen**: VS Code showing `gopratle-bdr-ai-agent/` repository structure.
- **Action**: Show `workflows/`, `prompts/`, `scripts/`, `docs/`, and run `npm test` showing 10/10 PASS.
- **Spoken Narration**:
  > *"All source files are neatly organized in our GitHub repository: including the production n8n JSON workflows, prompts, parser scripts, architecture documentation, setup guide, and a test suite covering all 10 acceptance criteria with 100% pass rate. Thank you!"*
