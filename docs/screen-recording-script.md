# GoPratle BDR Agent - 3-5 Minute Screen Recording Script

This script provides an exact, timestamped guide for recording your candidate submission video using OBS Studio or any screen recorder.

---

## Video Specifications
- **Target Duration**: 3:30 to 4:30 minutes
- **Resolution**: 1080p (Full Screen)
- **Preparation Checklist**:
  - [ ] Google Sheet tab open (`GoPratle_BDR_Lead_Database`)
  - [ ] n8n canvas or VS Code runner open
  - [ ] Gmail web client open in Drafts folder
  - [ ] Terminal window open inside `gopratle-bdr-ai-agent` directory

---

## Scene-by-Scene Recording Plan

### Scene 1: Introduction & System Architecture (0:00 – 0:30)
- **Screen**: Display `docs/architecture.md` diagram.
- **Narration**:
  > *"Hello! Today I'm demonstrating the GoPratle BDR Lead Enrichment and Outreach Agent. GoPratle connects event hosts with vetted event planners, DJs, and event crews. This system automates lead intake from Google Sheets, performs multi-query web research using Tavily, extracts and ranks decision-makers by operational relevance, formats an evidence-backed three-line pitch using Google Gemini 1.5, creates approval-gated Gmail drafts, and manages follow-up tracking without duplicate messages or hallucinations. Let's see it in action."*

---

### Scene 2: Lead Intake & Google Sheet Trigger (0:30 – 1:00)
- **Screen**: Google Sheet `GoPratle_BDR_Lead_Database` (tab `Leads`).
- **Action**: Add a new row:
  - `Company_Name`: `Zomato`
  - `City`: `Gurgaon`
- **Narration**:
  > *"Here is our Google Sheet lead database containing the 22 required tracking fields. I'm adding 'Zomato' in 'Gurgaon'. As soon as the row is added, our trigger detects it. It first validates that both Company and City are present, then executes a cross-sheet duplicate check that normalizes whitespace, capitalization, and legal suffixes to ensure duplicate rows are never re-processed."*

---

### Scene 3: Workflow Execution & Multi-Query Research (1:00 – 2:00)
- **Screen**: n8n Workflow Canvas (`01 - Lead Enrichment`) or terminal output.
- **Action**: Walk through the node execution:
  1. Input validation & duplicate check pass.
  2. Tavily executes three targeted searches: Company Context, Decision Makers, and Public Contact.
  3. Lead parser evaluates candidates: prioritizing Events Manager over generic executives.
  4. Google Gemini generates a concise 3-line pitch strictly following our JSON schema.
- **Narration**:
  > *"The workflow runs three separate targeted queries. Notice how it discovers Chaitanya Mathur, Global Head of Events and Live IPs at Zomato. Because his role directly controls festival production and DJ/crew bookings, our parser gives him top priority. Gemini then synthesizes this verified evidence into exactly three personalized lines with zero fabricated claims."*

---

### Scene 4: Google Sheet In-Place Update (2:00 – 2:45)
- **Screen**: Switch back to Google Sheet.
- **Action**: Highlight the updated row:
  - `Lead_Name`: `Chaitanya Mathur`
  - `Job_Title`: `Global Head - Zomato Live & Events`
  - `Target_Role`: `Events`
  - `Public_Email`: `live-partnerships@zomato.com`
  - `AI_Pitch`: 3 concise, tailored lines
  - `Lead_Confidence`: `High`
  - `Research_Status`: `Completed`
  - `Outreach_Status`: `Draft Created`
  - `Followup_Status`: `Not Scheduled`
- **Narration**:
  > *"Looking back at our Google Sheet, the original row has been updated cleanly in-place without creating duplicate rows. We see the lead name, verified public contact, source URL, and High confidence score. Most importantly, Outreach_Status is 'Draft Created' and Followup_Status remains 'Not Scheduled', ensuring follow-ups are never triggered prematurely for un-sent drafts."*

---

### Scene 5: Gmail Draft & Safety Gate (2:45 – 3:30)
- **Screen**: Gmail web client in the **Drafts** folder.
- **Action**: Open the generated draft email.
- **Narration**:
  > *"Because our system enforces a strict human-in-the-loop safety gate, it never sends cold emails automatically. Instead, it creates a Gmail draft. Here is the draft: addressed to our verified business contact, with the personalized subject line, clean greeting, and the three-line pitch. In demo mode, it safely routes to our configured test inbox."*

---

### Scene 6: Follow-up Automation & Opt-Out Suppression (3:30 – 4:10)
- **Screen**: `workflows/02-followup-agent.json` in n8n or terminal showing test cases 13-17.
- **Action**: Explain the follow-up state machine:
  1. Only runs for leads where initial outreach was actually `Sent`.
  2. Draft-only rows are skipped and preserved.
  3. Prospects that replied or opted out are automatically marked `Suppressed`.
- **Narration**:
  > *"Our second workflow handles follow-ups. It checks for due rows on a schedule. Crucially, it verifies that the initial message was actually sent—not just drafted—and checks if the prospect has replied or opted out. If they replied or opted out, the follow-up is automatically suppressed."*

---

### Scene 7: 17/17 Automated Tests & Repository (4:10 – 4:40)
- **Screen**: Terminal executing `npm test`.
- **Action**: Show all 17 tests passing with zero failures.
- **Narration**:
  > *"All 17 acceptance scenarios—including missing input, no lead found, Tavily and Gemini error handling, duplicate prevention, and opt-out suppression—pass with a 100% success rate. The repository is completely documented and ready for deployment. Thank you!"*
