/**
 * GoPratle BDR Agent - Production Orchestration Engine
 * 
 * Genuine, production-ready execution engine for:
 * - Real Tavily Web Search API calls
 * - Real Google Gemini 1.5 Flash API calls
 * - Real Google Sheets REST API v4 read/write operations
 * - Real Gmail REST API draft creation (RFC 2822 MIME)
 * 
 * Never hardcodes leads or simulates production data.
 * Throws explicit errors when credentials or APIs fail.
 * Supports injected mock clients exclusively for unit testing.
 */

const fs = require('fs');
const path = require('path');
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

// Load environment variables from .env if present
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

const CONFIG = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  tavilyApiKey: process.env.TAVILY_API_KEY || '',
  googleSheetId: process.env.GOOGLE_SHEET_ID || '',
  googleAccessToken: process.env.GOOGLE_ACCESS_TOKEN || '',
  testRecipientEmail: process.env.TEST_RECIPIENT_EMAIL || 'test-lead@gopratle-testing.internal',
  followupIntervalDays: parseInt(process.env.FOLLOWUP_INTERVAL_DAYS || '2', 10),
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  testMode: process.env.TEST_MODE !== 'false' // default to safe test mode
};

/**
 * Validates system configuration and reports missing credentials
 */
function validateConfiguration() {
  const missing = [];
  if (!CONFIG.geminiApiKey || CONFIG.geminiApiKey.includes('placeholder')) {
    missing.push('GEMINI_API_KEY');
  }
  if (!CONFIG.tavilyApiKey || CONFIG.tavilyApiKey.includes('placeholder')) {
    missing.push('TAVILY_API_KEY');
  }
  if (!CONFIG.googleSheetId || CONFIG.googleSheetId.includes('placeholder')) {
    missing.push('GOOGLE_SHEET_ID');
  }
  if (!CONFIG.googleAccessToken && !process.env.GOOGLE_CLIENT_ID) {
    missing.push('GOOGLE_ACCESS_TOKEN (or Google OAuth credentials)');
  }

  return {
    isConfigured: missing.length === 0,
    missingCredentials: missing
  };
}

/**
 * Real Tavily Search API call.
 * Never returns hard-coded mock data. Throws explicit errors on missing key or API failure.
 */
async function searchTavily(query, customClient = null) {
  if (customClient && typeof customClient.search === 'function') {
    return await customClient.search(query);
  }

  if (!CONFIG.tavilyApiKey || CONFIG.tavilyApiKey.includes('placeholder')) {
    throw new Error('Missing required credential: TAVILY_API_KEY. Configure TAVILY_API_KEY in .env or environment.');
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      api_key: CONFIG.tavilyApiKey,
      query: query,
      search_depth: 'advanced',
      include_answer: true,
      max_results: 5
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tavily API failed with status ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return (data.results || []).map(r => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
    content: r.content || ''
  }));
}

/**
 * Real Google Gemini API Call.
 * Generates 3-line personalized pitch matching schema.
 * Throws explicit error on missing key or API failure.
 */
async function generateGeminiPitch(promptPayload, options = {}, retryCount = 0) {
  const { customClient = null } = options;

  if (customClient && typeof customClient.generateContent === 'function') {
    return await customClient.generateContent(promptPayload);
  }

  if (!CONFIG.geminiApiKey || CONFIG.geminiApiKey.includes('placeholder')) {
    throw new Error('Missing required credential: GEMINI_API_KEY. Configure GEMINI_API_KEY in .env or environment.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${CONFIG.geminiApiKey}`;

  const systemInstruction = `You are an expert B2B Business Development Research and Outreach Assistant working for GoPratle.
GoPratle connects event hosts with vetted event planners, DJs, and professional event crews.

Your task:
1. Analyse the supplied company and city context.
2. Evaluate candidate decision-makers for relevance to events, partnerships, HR or founder responsibilities.
3. Use ONLY the supplied research evidence. Do not invent facts.
4. Explain why the selected lead is relevant.
5. Generate an email subject and exactly THREE concise, personalised outreach lines.
6. Keep the tone natural, respectful and professional.
7. Do not claim that the company has an event, partnership, requirement or problem unless the evidence supports it.
8. If evidence is insufficient, say that more research is needed.
9. Never fabricate a person's name, title, LinkedIn URL or email.
10. Return valid JSON only, matching the requested schema:
{
  "selected_lead_name": "string or Not Found",
  "selected_job_title": "string or Not Found",
  "selection_reason": "string",
  "email_subject": "string",
  "pitch_line_1": "string",
  "pitch_line_2": "string",
  "pitch_line_3": "string",
  "personalization_reason": "string",
  "confidence": "High | Medium | Low",
  "missing_information": ["..."],
  "needs_human_review": true
}`;

  const promptText = options.repairInstruction
    ? `${systemInstruction}\n\nREPAIR INSTRUCTION:\n${options.repairInstruction}\n\nTask data:\n${JSON.stringify(promptPayload, null, 2)}`
    : `${systemInstruction}\n\nTask data:\n${JSON.stringify(promptPayload, null, 2)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: promptText }]
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API call failed with status ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

  const validation = validateAiPitchResponse(rawText);
  if (validation.isValid) {
    return validation.parsed;
  }

  // Self-healing retry once
  if (retryCount === 0) {
    console.warn(`[Gemini AI] Schema validation failed on first attempt: ${validation.errors.join('; ')}. Initiating repair retry...`);
    return await generateGeminiPitch(promptPayload, {
      ...options,
      repairInstruction: validation.repairInstruction
    }, 1);
  }

  throw new Error(`Gemini API output failed schema validation after retry: ${validation.errors.join('; ')}`);
}

/**
 * Real Google Sheets API v4 Operations
 */
async function readGoogleSheetRows({ sheetId, range = 'Leads!A1:V100', accessToken }, customClient = null) {
  if (customClient && typeof customClient.getValues === 'function') {
    return await customClient.getValues({ sheetId, range });
  }

  const token = accessToken || CONFIG.googleAccessToken;
  if (!token) {
    throw new Error('Missing required credential: GOOGLE_ACCESS_TOKEN. Cannot read Google Sheet without OAuth credentials.');
  }

  const targetSheetId = sheetId || CONFIG.googleSheetId;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSheetId}/values/${encodeURIComponent(range)}`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Sheets API read failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.values || [];
}

async function updateGoogleSheetRow({ sheetId, rowNumber, rowData, accessToken }, customClient = null) {
  if (customClient && typeof customClient.updateRow === 'function') {
    return await customClient.updateRow({ sheetId, rowNumber, rowData });
  }

  const token = accessToken || CONFIG.googleAccessToken;
  if (!token) {
    throw new Error('Missing required credential: GOOGLE_ACCESS_TOKEN. Cannot update Google Sheet without OAuth credentials.');
  }

  const targetSheetId = sheetId || CONFIG.googleSheetId;
  const range = `Leads!A${rowNumber}:V${rowNumber}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: [rowData]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Sheets API update failed (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Real Gmail API Draft Creation (RFC 2822 base64url encoded MIME)
 */
async function createGmailDraft({ to, subject, body, accessToken }, customClient = null) {
  if (customClient && typeof customClient.createDraft === 'function') {
    return await customClient.createDraft({ to, subject, body });
  }

  if (!to || to === 'Not Found') {
    return {
      status: 'Draft Not Possible',
      messageId: null,
      error: 'Cannot create Gmail draft: recipient email is Not Found'
    };
  }

  const token = accessToken || CONFIG.googleAccessToken;
  if (!token) {
    throw new Error('Missing required credential: GOOGLE_ACCESS_TOKEN or Gmail OAuth. Cannot create Gmail draft without OAuth credentials.');
  }

  const recipient = CONFIG.testMode ? CONFIG.testRecipientEmail : to;
  const subjectPrefix = CONFIG.testMode ? '[DEMO TEST] ' : '';
  const finalSubject = subjectPrefix + subject;

  // Build RFC 2822 MIME message
  const utf8Subject = `=?utf-8?B?${Buffer.from(finalSubject).toString('base64')}?=`;
  const messageParts = [
    `To: ${recipient}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    body
  ];
  const rawMessage = messageParts.join('\r\n');
  const base64UrlMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        raw: base64UrlMessage
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail API draft creation failed (${response.status}): ${errorText}`);
  }

  const draftData = await response.json();
  return {
    status: 'Draft Created',
    messageId: draftData.id,
    recipient: recipient,
    subject: finalSubject
  };
}

/**
 * Process a single Lead row end-to-end
 */
async function processLeadRow(rowInput, existingRows = [], options = {}) {
  const timestamp = new Date().toISOString();
  const { tavilyClient, geminiClient, gmailClient } = options;

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
      Research_Status: 'Duplicate',
      Outreach_Status: rowInput.Outreach_Status || 'Not Ready',
      Followup_Status: 'Not Scheduled',
      Error_Details: duplicateCheck.reason,
      Updated_At: timestamp
    };
  }

  // 3. Multi-Query Web Research via Tavily
  let companyResults = [];
  let dmResults = [];
  let contactResults = [];

  try {
    const companyQuery = `${company} ${city} events activations partnerships business`;
    const dmQuery = `${company} ${city} Events Manager OR Head of Events OR Partnerships Manager OR HR Head OR Founder`;
    const contactQuery = `${company} ${city} official contact email OR business contact`;

    [companyResults, dmResults, contactResults] = await Promise.all([
      searchTavily(companyQuery, tavilyClient),
      searchTavily(dmQuery, tavilyClient),
      searchTavily(contactQuery, tavilyClient)
    ]);
  } catch (err) {
    return {
      Company_Name: company,
      City: city,
      Research_Status: 'Failed',
      Outreach_Status: 'Not Ready',
      Lead_Confidence: 'Low',
      Followup_Status: 'Not Scheduled',
      Error_Details: `Web research failed: ${err.message}`,
      Created_At: rowInput.Created_At || timestamp,
      Updated_At: timestamp
    };
  }

  // Extract company context
  const companyContext = companyResults[0]?.snippet || `${company} business operations and events in ${city}`;

  // 4. Candidate Lead Extraction & Ranking
  const candidates = dmResults.map(r => {
    let name = 'Not Found';
    let title = 'Not Found';

    const titleParts = (r.title || '').split(/[-–|]/).map(s => s.trim());
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
      snippet: r.snippet || '',
      url: r.url || '',
      location: city
    };
  });

  const rankedCandidates = rankCandidateLeads(candidates, company, city);
  const bestCandidate = rankedCandidates[0] || null;

  // Extract public business email & LinkedIn URL
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
    contact_source: bestCandidate?.url || emailInfo.sourceUrl || companyResults[0]?.url || '',
    city_verified: (bestCandidate?.locationScore || 0) > 0,
    location_score: bestCandidate?.locationScore || 0,
    isFormer: bestCandidate?.isFormer || false
  };

  const confidenceAssessment = calculateConfidenceScore(leadDataForScoring);

  // 6. Gemini Pitch Generation
  let aiPitchResponse = null;
  try {
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
      } : {
        name: 'Not Found',
        title: 'Not Found',
        targetRole: 'Other',
        confidence: 'Low'
      }
    };

    aiPitchResponse = await generateGeminiPitch(pitchPayload, { customClient: geminiClient });
  } catch (err) {
    return {
      Company_Name: company,
      City: city,
      Target_Role: bestCandidate?.targetRole || 'Other',
      Lead_Name: bestCandidate?.name || 'Not Found',
      Job_Title: bestCandidate?.title || 'Not Found',
      LinkedIn_URL: linkedinUrl,
      Public_Email: emailInfo.email,
      Contact_Source: bestCandidate?.url || emailInfo.sourceUrl || '',
      Company_Context: companyContext,
      AI_Pitch: '',
      Email_Subject: '',
      Lead_Confidence: confidenceAssessment.confidence,
      Research_Status: 'Needs Review',
      Outreach_Status: 'Not Ready',
      Followup_Status: 'Not Scheduled',
      Error_Details: `Gemini pitch generation failed: ${err.message}`,
      Created_At: rowInput.Created_At || timestamp,
      Updated_At: timestamp
    };
  }

  const formattedPitch = formatPitchForDatabase(aiPitchResponse);

  // 7. Outreach & Draft Handling (Draft Only by Default)
  let outreachStatus = 'Not Ready';
  let outreachMessageId = '';
  let followupDate = '';
  let followupStatus = 'Not Scheduled'; // RULE: Draft Created must NEVER schedule a follow-up

  if (confidenceAssessment.eligibleForDraft && emailInfo.email !== 'Not Found') {
    const emailDraft = formatEmailDraft(
      aiPitchResponse.selected_lead_name,
      aiPitchResponse.email_subject,
      aiPitchResponse
    );

    try {
      const gmailResult = await createGmailDraft({
        to: emailInfo.email,
        subject: emailDraft.subject,
        body: emailDraft.body
      }, gmailClient);

      outreachStatus = gmailResult.status;
      outreachMessageId = gmailResult.messageId || '';

      // RULE: Only set follow-up pending if outreach was actually Sent (e.g. approved send)
      if (['Sent', 'Sent (Test)'].includes(outreachStatus)) {
        const followupDateObj = new Date();
        followupDateObj.setDate(followupDateObj.getDate() + CONFIG.followupIntervalDays);
        followupDate = followupDateObj.toISOString();
        followupStatus = 'Pending';
      } else {
        followupStatus = 'Not Scheduled';
      }
    } catch (err) {
      outreachStatus = 'Failed';
      return {
        Company_Name: company,
        City: city,
        Target_Role: bestCandidate?.targetRole || 'Other',
        Lead_Name: aiPitchResponse.selected_lead_name || 'Not Found',
        Job_Title: aiPitchResponse.selected_job_title || 'Not Found',
        LinkedIn_URL: linkedinUrl,
        Public_Email: emailInfo.email,
        Contact_Source: bestCandidate?.url || emailInfo.sourceUrl || '',
        Company_Context: companyContext,
        AI_Pitch: formattedPitch,
        Email_Subject: aiPitchResponse.email_subject,
        Lead_Confidence: confidenceAssessment.confidence,
        Research_Status: 'Completed',
        Outreach_Status: 'Failed',
        Outreach_Message_ID: '',
        Followup_Date: '',
        Followup_Status: 'Not Scheduled',
        Error_Details: `Gmail draft creation failed: ${err.message}`,
        Created_At: rowInput.Created_At || timestamp,
        Updated_At: timestamp
      };
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
    Research_Status: confidenceAssessment.confidence === 'Low' || aiPitchResponse.selected_lead_name === 'Not Found' ? 'Needs Review' : 'Completed',
    Outreach_Status: outreachStatus,
    Outreach_Message_ID: outreachMessageId,
    Followup_Date: followupDate,
    Followup_Status: followupStatus,
    Last_Contacted_At: ['Sent', 'Sent (Test)'].includes(outreachStatus) ? timestamp : '',
    Reply_Status: 'Unknown',
    Error_Details: confidenceAssessment.confidence === 'Low' ? confidenceAssessment.reason : '',
    Created_At: rowInput.Created_At || timestamp,
    Updated_At: timestamp
  };
}

/**
 * Follow-up Workflow Engine
 * 
 * Rules:
 * 1. Schedule follow-up only after email has actually been sent (Sent or Sent (Test)).
 * 2. Draft Created must NEVER trigger a follow-up.
 * 3. Never mark a draft-only lead as Suppressed.
 * 4. Suppress if status is Replied, Opted Out, Bounced or Suppressed.
 * 5. Avoid duplicate follow-up drafts.
 */
async function processFollowupQueue(leadRows = [], options = {}) {
  const now = new Date();
  const results = [];
  const { gmailClient } = options;

  for (const row of leadRows) {
    const isDue = row.Followup_Status === 'Pending' && row.Followup_Date && new Date(row.Followup_Date) <= now;
    const wasSent = ['Sent', 'Sent (Test)'].includes(row.Outreach_Status);
    const isSuppressed = ['Replied', 'Opted Out', 'Bounced', 'Suppressed'].includes(row.Reply_Status) || row.Followup_Status === 'Suppressed';
    const isAlreadyHandled = ['Draft Created', 'Completed'].includes(row.Followup_Status);

    // Rule: If follow-up was already drafted or completed, skip to prevent duplicates
    if (isAlreadyHandled) {
      results.push({
        company: row.Company_Name,
        action: 'Skipped',
        reason: `Follow-up already in state: ${row.Followup_Status}`
      });
      continue;
    }

    if (isSuppressed) {
      row.Followup_Status = 'Suppressed';
      row.Updated_At = now.toISOString();
      results.push({
        company: row.Company_Name,
        action: 'Suppressed',
        reason: `Suppressed due to Reply_Status: ${row.Reply_Status || 'Suppressed'}`
      });
      continue;
    }

    // Rule: Initial outreach was only drafted, not sent. Skip and NEVER mark as Suppressed!
    if (!wasSent) {
      results.push({
        company: row.Company_Name,
        action: 'Skipped',
        reason: 'Initial outreach was only drafted, not actually sent'
      });
      continue;
    }

    // If due and was sent and not suppressed: create follow-up draft
    if (isDue) {
      const leadName = row.Lead_Name && row.Lead_Name !== 'Not Found' ? row.Lead_Name : 'there';
      const followupBody = `Hi ${leadName},\n\nJust following up on my previous note about GoPratle. We would be glad to explore whether our network of event planners, DJs and crews could support your team's events.\n\nWould a brief conversation be useful?\n\nBest,\nGoPratle Team`;

      const draftResult = await createGmailDraft({
        to: row.Public_Email,
        subject: `Follow-up: ${row.Email_Subject || 'GoPratle Event Coordination'}`,
        body: followupBody
      }, gmailClient);

      row.Followup_Status = 'Draft Created';
      row.Updated_At = now.toISOString();
      results.push({
        company: row.Company_Name,
        action: 'Draft Created',
        messageId: draftResult.messageId
      });
    }
  }

  return results;
}

module.exports = {
  CONFIG,
  validateConfiguration,
  searchTavily,
  generateGeminiPitch,
  readGoogleSheetRows,
  updateGoogleSheetRow,
  createGmailDraft,
  processLeadRow,
  processFollowupQueue
};
