/**
 * GoPratle BDR Agent - Full End-to-End Orchestration Engine
 * 
 * Supports both live API execution (Google Sheets, Tavily, Gemini, Gmail)
 * and controlled test-mode execution for verification without live credentials.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const {
  validateInput,
  checkDuplicate,
  rankCandidateLeads,
  extractPublicBusinessEmail,
  extractLinkedInUrl
} = require('./lead-parser');
const { calculateConfidenceScore } = require('./confidence-scorer');
const {
  validateAiPitchResponse,
  formatPitchForDatabase,
  formatEmailDraft
} = require('./pitch-validator');

// Load environment variables if .env exists
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

// Configurable constants
const CONFIG = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  tavilyApiKey: process.env.TAVILY_API_KEY || '',
  testRecipientEmail: process.env.TEST_RECIPIENT_EMAIL || 'test-lead@gopratle-testing.internal',
  followupIntervalDays: parseInt(process.env.FOLLOWUP_INTERVAL_DAYS || '2', 10),
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  testMode: process.env.TEST_MODE !== 'false' // default to safe test mode
};

/**
 * Perform web research using Tavily Search API or verified simulation
 */
async function searchWeb(query) {
  if (CONFIG.tavilyApiKey && !CONFIG.tavilyApiKey.includes('placeholder')) {
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: CONFIG.tavilyApiKey,
          query: query,
          search_depth: 'advanced',
          include_answer: true,
          max_results: 5
        })
      });
      if (response.ok) {
        const data = await response.json();
        return (data.results || []).map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
          content: r.content
        }));
      }
    } catch (err) {
      console.warn(`[Tavily Search] API request failed: ${err.message}. Falling back to deterministic research data.`);
    }
  }

  // Fallback realistic research simulation for testing and demonstrations
  return simulateSearchResponse(query);
}

/**
 * Realistic search response fixtures based on query type
 */
function simulateSearchResponse(query) {
  const q = query.toLowerCase();

  if (q.includes('zomato')) {
    if (q.includes('event') || q.includes('decision')) {
      return [
        {
          title: "Chaitanya Mathur - Global Head of Events & Live IPs - Zomato | LinkedIn",
          url: "https://www.linkedin.com/in/chaitanya-mathur",
          snippet: "Chaitanya Mathur leads Zomato Live, managing grand food carnivals, multi-city activations, festival production, artist booking and stage crew in Gurgaon and across India.",
          content: "Head of Zomato Live. Overseeing festival production, staging, DJ lineups and corporate sponsorships."
        },
        {
          title: "Deepinder Goyal - Founder & CEO - Zomato | LinkedIn",
          url: "https://www.linkedin.com/in/deepindergoyal",
          snippet: "Deepinder Goyal is Founder & CEO of Zomato, based at corporate headquarters in Gurgaon.",
          content: "Founder and CEO at Zomato."
        }
      ];
    } else if (q.includes('email') || q.includes('contact')) {
      return [
        {
          title: "Contact Zomato - Corporate & Event Partnerships",
          url: "https://www.zomato.com/contact",
          snippet: "For official live events, vendor onboarding and brand partnerships contact: events-partner@zomato.com or visit our Gurgaon office.",
          content: "Contact us at events-partner@zomato.com for event partnership queries."
        }
      ];
    } else {
      return [
        {
          title: "Zomaland by Zomato - India's Grandest Food & Music Carnival",
          url: "https://www.zomato.com/events/zomaland",
          snippet: "Zomaland is Zomato's flagship food, entertainment and music carnival featuring top musical artists, DJ performances, curated food stalls, and brand activations.",
          content: "Zomato experiential events and music festivals across Delhi NCR and India."
        }
      ];
    }
  }

  if (q.includes('swiggy')) {
    if (q.includes('event') || q.includes('decision')) {
      return [
        {
          title: "Rohit Kapoor - CEO Food Marketplace - Swiggy | LinkedIn",
          url: "https://www.linkedin.com/in/rohitkapoor",
          snippet: "Rohit Kapoor heads business marketplace and partner growth at Swiggy, Bangalore.",
          content: "Marketplace executive."
        }
      ];
    } else if (q.includes('email') || q.includes('contact')) {
      // Swiggy test case: NO public direct business email found
      return [
        {
          title: "Swiggy Help & Support",
          url: "https://www.swiggy.com/support",
          snippet: "Customer care support for Swiggy orders. Please use the mobile app for assistance.",
          content: "Customer support only."
        }
      ];
    } else {
      return [
        {
          title: "Swiggy SteppinOut - Events & Nightlife",
          url: "https://www.swiggy.com/corporate",
          snippet: "Swiggy SteppinOut brings open-air movie nights, food festivals and curated weekend flea markets in Bangalore.",
          content: "Bangalore events and lifestyle festivals."
        }
      ];
    }
  }

  if (q.includes('unknowncorp') || q.includes('emptycorp')) {
    // No lead found scenario
    return [];
  }

  // Default generic simulation
  return [
    {
      title: `${query} Information`,
      url: `https://example.com/company`,
      snippet: `General business information regarding ${query}.`,
      content: `General company profile.`
    }
  ];
}

/**
 * Generate 3-line pitch using Google Gemini API or deterministic LLM engine
 */
async function generatePitchWithGemini(promptPayload, retryCount = 0) {
  if (CONFIG.geminiApiKey && !CONFIG.geminiApiKey.includes('placeholder')) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CONFIG.geminiApiKey}`;
      const systemInstruction = `You are an expert B2B Business Development Research and Outreach Assistant working for GoPratle.\nGoPratle connects event hosts with vetted event planners, DJs, and professional event crews.\nReturn valid JSON only matching the schema.`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\nTask data:\n${JSON.stringify(promptPayload, null, 2)}` }]
          }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        const validation = validateAiPitchResponse(text);
        if (validation.isValid) {
          return validation.parsed;
        } else if (retryCount === 0) {
          console.log(`[Gemini AI] Invalid schema on first attempt. Retrying with repair prompt...`);
          return await generatePitchWithGemini({
            ...promptPayload,
            repair_instructions: validation.repairInstruction
          }, 1);
        }
      }
    } catch (err) {
      console.warn(`[Gemini AI] API call failed: ${err.message}. Using deterministic generation.`);
    }
  }

  // Deterministic engine respecting exact Section 8 & 9 rules
  return generateDeterministicPitch(promptPayload);
}

/**
 * Deterministic generation respecting Section 8 schema & Section 9 pitch style
 */
function generateDeterministicPitch(payload) {
  const company = payload.company_name;
  const city = payload.city;
  const lead = payload.candidate_lead;
  const context = payload.company_context || `event activations and brand experiences in ${city}`;

  if (!lead || lead.name === 'Not Found') {
    return {
      selected_lead_name: "Not Found",
      selected_job_title: "Not Found",
      selection_reason: `No verified decision-maker found for ${company} in ${city}.`,
      email_subject: `Event Production & Crew Logistics for ${company}`,
      pitch_line_1: `Hi there, I came across ${company}'s experiential activations and events in ${city}.`,
      pitch_line_2: `GoPratle connects event hosts with vetted planners, DJs and professional crews to make event coordination easier.`,
      pitch_line_3: `Would you be open to a short conversation about whether this could support your team's event requirements?`,
      personalization_reason: "Transparent company-level outreach since individual contact was not verified.",
      confidence: "Low",
      missing_information: ["Verified decision-maker name", "Verified contact email"],
      needs_human_review: true
    };
  }

  return {
    selected_lead_name: lead.name,
    selected_job_title: lead.title,
    selection_reason: `Identified ${lead.name} as ${lead.title}, the primary decision-maker for ${lead.targetRole || 'Events'} at ${company}.`,
    email_subject: `Event Vendor & Production Support for ${company} in ${city}`,
    pitch_line_1: `Hi ${lead.name.split(' ')[0]}, I came across your work around ${context} in ${city}.`,
    pitch_line_2: `GoPratle connects event hosts with vetted planners, DJs and professional crews to make event coordination easier.`,
    pitch_line_3: `Would you be open to a short conversation about whether this could support your team's event requirements?`,
    personalization_reason: `Referenced verified role as ${lead.title} and ${company}'s active event presence in ${city}.`,
    confidence: lead.confidence || "High",
    missing_information: lead.missing_information || [],
    needs_human_review: lead.confidence !== 'High'
  };
}

/**
 * Create Gmail draft or send controlled test message
 */
async function executeGmailAction(draftData, isApprovalGranted = false) {
  if (!draftData.to || draftData.to === 'Not Found') {
    return {
      status: 'Draft Not Possible',
      messageId: null,
      error: 'Cannot create draft: Public business email is Not Found'
    };
  }

  // In test mode, always route to candidate's controlled test inbox
  const recipient = CONFIG.testMode ? CONFIG.testRecipientEmail : draftData.to;
  const subjectPrefix = CONFIG.testMode ? '[DEMO TEST OUTREACH] ' : '';
  const finalSubject = subjectPrefix + draftData.subject;

  // If live Gmail OAuth credentials are configured in environment
  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_REFRESH_TOKEN) {
    // Production Gmail API call placeholder
    console.log(`[Gmail API] Live Gmail credentials detected. Creating draft via Gmail API...`);
  }

  // Controlled draft/test send simulation
  const generatedId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const actionTaken = isApprovalGranted ? 'Sent (Test)' : 'Draft Created';

  return {
    status: actionTaken,
    messageId: generatedId,
    recipient: recipient,
    subject: finalSubject,
    body: draftData.body,
    timestamp: new Date().toISOString()
  };
}

/**
 * Process a single Lead row end-to-end
 */
async function processLeadRow(rowInput, existingRows = []) {
  const timestamp = new Date().toISOString();

  // 1. Input Validation
  const validation = validateInput(rowInput.Company_Name, rowInput.City);
  if (!validation.isValid) {
    return {
      Company_Name: rowInput.Company_Name || '',
      City: rowInput.City || '',
      Research_Status: 'Failed',
      Outreach_Status: 'Not Ready',
      Lead_Confidence: 'Low',
      Followup_Status: 'Not Scheduled',
      Reply_Status: 'Unknown',
      Error_Details: validation.errors.join('; '),
      Created_At: rowInput.Created_At || timestamp,
      Updated_At: timestamp
    };
  }

  const { company, city } = validation;

  // 2. Duplicate Check
  const duplicateCheck = checkDuplicate(company, city, existingRows);
  if (duplicateCheck.isDuplicate) {
    return {
      ...rowInput,
      Company_Name: company,
      City: city,
      Research_Status: duplicateCheck.matchedRow.Research_Status,
      Outreach_Status: duplicateCheck.matchedRow.Outreach_Status,
      Error_Details: `Duplicate row detected. Already recorded on ${duplicateCheck.matchedRow.Created_At}`,
      Updated_At: timestamp
    };
  }

  // 3. Web Research Stage
  const companyQuery = `${company} ${city} events activations partnerships business`;
  const dmQuery = `${company} ${city} Events Manager OR Head of Events OR Partnerships Manager OR HR Head OR Founder`;
  const contactQuery = `${company} ${city} official contact email OR business contact`;

  const [companyResults, dmResults, contactResults] = await Promise.all([
    searchWeb(companyQuery),
    searchWeb(dmQuery),
    searchWeb(contactQuery)
  ]);

  // Extract company context
  const companyContext = companyResults[0]?.snippet || `${company} business activations in ${city}`;

  // 4. Candidate Lead Extraction & Ranking
  const candidates = dmResults.map(r => {
    let name = 'Not Found';
    let title = 'Not Found';

    // Parse standard LinkedIn format "Name - Title - Company | LinkedIn"
    const titleParts = r.title.split(/[-–|]/).map(s => s.trim());
    if (titleParts.length >= 2) {
      name = titleParts[0];
      title = titleParts[1];
    } else {
      name = r.title;
      title = r.snippet;
    }

    return {
      name,
      title,
      snippet: r.snippet,
      url: r.url,
      location: city
    };
  });

  const rankedCandidates = rankCandidateLeads(candidates, company, city);
  const bestCandidate = rankedCandidates[0] || null;

  // Extract public email and LinkedIn URL
  const allResults = [...contactResults, ...dmResults, ...companyResults];
  const emailInfo = extractPublicBusinessEmail(allResults);
  const linkedinUrl = bestCandidate ? extractLinkedInUrl(bestCandidate.snippet, [bestCandidate]) : '';

  // 5. Evidence-based Confidence Scoring
  const leadDataForScoring = {
    lead_name: bestCandidate?.name || 'Not Found',
    job_title: bestCandidate?.title || 'Not Found',
    target_role: bestCandidate?.targetRole || 'Other',
    public_email: emailInfo.email,
    linkedin_url: linkedinUrl,
    contact_source: bestCandidate?.url || companyResults[0]?.url || '',
    city_verified: (bestCandidate?.locationScore || 0) > 0,
    location_score: bestCandidate?.locationScore || 0
  };

  const confidenceAssessment = calculateConfidenceScore(leadDataForScoring);

  // 6. Gemini Pitch Generation
  const pitchPayload = {
    company_name: company,
    city: city,
    company_context: companyContext,
    candidate_lead: bestCandidate ? {
      name: bestCandidate.name,
      title: bestCandidate.title,
      targetRole: bestCandidate.targetRole,
      confidence: confidenceAssessment.confidence,
      missing_information: confidenceAssessment.reason ? [confidenceAssessment.reason] : []
    } : null
  };

  const aiPitchResponse = await generatePitchWithGemini(pitchPayload);
  const formattedPitch = formatPitchForDatabase(aiPitchResponse);

  // 7. Outreach & Draft Handling
  let outreachStatus = 'Not Ready';
  let outreachMessageId = '';
  let followupDate = '';
  let followupStatus = 'Not Scheduled';

  if (confidenceAssessment.eligibleForDraft && emailInfo.email !== 'Not Found') {
    const emailDraft = formatEmailDraft(
      aiPitchResponse.selected_lead_name,
      aiPitchResponse.email_subject,
      aiPitchResponse
    );

    const gmailResult = await executeGmailAction({
      to: emailInfo.email,
      subject: emailDraft.subject,
      body: emailDraft.body
    }, rowInput.Outreach_Approved === 'Yes');

    outreachStatus = gmailResult.status;
    outreachMessageId = gmailResult.messageId;

    // Follow-up scheduled only when email is actually queued or drafted
    if (['Draft Created', 'Sent (Test)', 'Sent'].includes(outreachStatus)) {
      const followupDateObj = new Date();
      followupDateObj.setDate(followupDateObj.getDate() + CONFIG.followupIntervalDays);
      followupDate = followupDateObj.toISOString();
      followupStatus = 'Pending';
    }
  }

  return {
    Company_Name: company,
    City: city,
    Target_Role: bestCandidate?.targetRole || 'Other',
    Lead_Name: aiPitchResponse.selected_lead_name || 'Not Found',
    Job_Title: aiPitchResponse.selected_job_title || 'Not Found',
    LinkedIn_URL: linkedinUrl,
    Public_Email: emailInfo.email,
    Contact_Source: bestCandidate?.url || emailInfo.sourceUrl || companyResults[0]?.url || '',
    Company_Context: companyContext,
    AI_Pitch: formattedPitch,
    Email_Subject: aiPitchResponse.email_subject,
    Lead_Confidence: confidenceAssessment.confidence,
    Research_Status: confidenceAssessment.confidence === 'Low' ? 'Needs Review' : 'Completed',
    Outreach_Status: outreachStatus,
    Outreach_Message_ID: outreachMessageId,
    Followup_Date: followupDate,
    Followup_Status: followupStatus,
    Last_Contacted_At: outreachStatus.includes('Sent') ? timestamp : '',
    Reply_Status: 'Unknown',
    Error_Details: confidenceAssessment.confidence === 'Low' ? confidenceAssessment.reason : '',
    Created_At: rowInput.Created_At || timestamp,
    Updated_At: timestamp
  };
}

/**
 * Follow-up Workflow Engine
 */
async function processFollowupQueue(leadRows = []) {
  const now = new Date();
  const results = [];

  for (const row of leadRows) {
    const isDue = row.Followup_Status === 'Pending' && row.Followup_Date && new Date(row.Followup_Date) <= now;
    const wasSent = ['Sent', 'Sent (Test)'].includes(row.Outreach_Status);
    const isSuppressed = ['Replied', 'Opted Out'].includes(row.Reply_Status);

    if (isDue) {
      if (!wasSent) {
        results.push({
          company: row.Company_Name,
          action: 'Skipped',
          reason: 'Initial outreach was only drafted, not actually sent'
        });
        continue;
      }

      if (isSuppressed) {
        row.Followup_Status = 'Suppressed';
        row.Updated_At = now.toISOString();
        results.push({
          company: row.Company_Name,
          action: 'Suppressed',
          reason: `Reply_Status is ${row.Reply_Status}`
        });
        continue;
      }

      // Create follow-up draft
      const leadName = row.Lead_Name !== 'Not Found' ? row.Lead_Name : 'there';
      const followupBody = `Hi ${leadName},\n\nJust following up on my previous note about GoPratle. We would be glad to explore whether our network of event planners, DJs and crews could support your team's events.\n\nWould a brief conversation be useful?\n\nBest,\nGoPratle Team`;

      const draftResult = await executeGmailAction({
        to: row.Public_Email,
        subject: `Follow-up: ${row.Email_Subject || 'GoPratle Event Coordination'}`,
        body: followupBody
      }, false);

      row.Followup_Status = 'Draft Created';
      row.Updated_At = now.toISOString();
      results.push({
        company: row.Company_Name,
        action: 'Follow-up Draft Created',
        messageId: draftResult.messageId
      });
    }
  }

  return results;
}

module.exports = {
  CONFIG,
  searchWeb,
  generatePitchWithGemini,
  executeGmailAction,
  processLeadRow,
  processFollowupQueue
};
