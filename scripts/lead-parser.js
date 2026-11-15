/**
 * GoPratle BDR Agent - Lead Parser & Normalization Logic
 * 
 * Provides parsing, normalization, ranking, deduplication, and contact extraction
 * strictly adhering to GoPratle Build Spec rules (no hallucinated leads, no email guessing).
 */

const ROLE_PRIORITIES = [
  {
    priority: 1,
    category: 'Events',
    regex: /\b(head of events?|events? director|events? manager|events? lead|event operations?|experiential marketing|experiential events?|event marketing manager)\b/i
  },
  {
    priority: 2,
    category: 'Partnerships',
    regex: /\b(partnerships? manager|brand partnerships?|marketing partnerships?|head of partnerships?|alliances? manager|strategic partnerships?)\b/i
  },
  {
    priority: 3,
    category: 'HR',
    regex: /\b(head of hr|hr lead|hr director|talent acquisition lead|people operations?|head of people|chief people officer)\b/i
  },
  {
    priority: 4,
    category: 'Founder',
    regex: /\b(co-founder|founder|chief executive officer|ceo|managing director)\b/i
  },
  {
    priority: 5,
    category: 'Operations/Marketing',
    regex: /\b(head of marketing|marketing director|vp marketing|chief marketing officer|operations? director|head of operations?)\b/i
  }
];

/**
 * Normalizes strings by trimming, lowercasing, stripping punctuation, and collapsing multiple spaces.
 */
function normalizeString(str) {
  if (!str) return '';
  return str
    .toString()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes company name for duplicate detection by stripping common legal suffixes.
 */
function normalizeCompany(name) {
  let norm = normalizeString(name);
  norm = norm.replace(/\b(pvt|private|ltd|limited|inc|incorporated|llc|corp|corporation|co)\b/g, '').replace(/\s+/g, ' ').trim();
  return norm;
}

/**
 * Normalizes city name, including common regional aliases (e.g. Gurgaon / Gurugram, Bangalore / Bengaluru)
 */
function normalizeCity(city) {
  let norm = normalizeString(city);
  if (norm === 'gurugram') norm = 'gurgaon';
  if (norm === 'bengaluru') norm = 'bangalore';
  if (norm === 'bombay') norm = 'mumbai';
  return norm;
}

/**
 * Validates row input from Google Sheets or Webhook
 */
function validateInput(company, city) {
  const errors = [];
  const cleanCompany = (company || '').toString().trim();
  const cleanCity = (city || '').toString().trim();

  if (!cleanCompany) {
    errors.push('Company_Name is required');
  }
  if (!cleanCity) {
    errors.push('City is required');
  }

  return {
    isValid: errors.length === 0,
    company: cleanCompany,
    city: cleanCity,
    errors
  };
}

/**
 * Robust duplicate check across all existing spreadsheet rows.
 * Detects duplicates even if capitalization, spacing, punctuation, or legal suffixes differ.
 */
function checkDuplicate(company, city, existingRows = []) {
  const normTargetCompany = normalizeCompany(company);
  const normTargetCity = normalizeCity(city);

  if (!normTargetCompany || !normTargetCity) {
    return { isDuplicate: false, matchedRow: null };
  }

  const match = existingRows.find(row => {
    const rowComp = normalizeCompany(row.Company_Name);
    const rowCity = normalizeCity(row.City);

    const isMatch = rowComp === normTargetCompany && rowCity === normTargetCity;
    if (!isMatch) return false;

    const researchStatus = (row.Research_Status || '').toLowerCase().trim();
    const outreachStatus = (row.Outreach_Status || '').toLowerCase().trim();

    // Consider duplicate if already processed, in-flight, or has an outreach record
    return ['completed', 'processing', 'needs review', 'duplicate'].includes(researchStatus) ||
           ['draft created', 'sent (test)', 'sent', 'pending approval'].includes(outreachStatus);
  });

  return {
    isDuplicate: Boolean(match),
    matchedRow: match || null,
    reason: match ? `Duplicate: '${company}' in '${city}' already exists (Status: ${match.Research_Status || match.Outreach_Status})` : null
  };
}

/**
 * Extracts candidate decision-makers and ranks them by role relevance.
 * Enforces role hierarchy: Events > Partnerships > HR > Founder.
 * If candidates array is empty or no match, returns empty list (No fake leads).
 */
function rankCandidateLeads(candidates = [], targetCompany = '', targetCity = '') {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const normCompany = normalizeString(targetCompany);
  const normCity = normalizeString(targetCity);

  const scored = [];

  for (const candidate of candidates) {
    if (!candidate || (!candidate.name && !candidate.title && !candidate.snippet)) continue;

    let rank = 99;
    let matchedCategory = 'Other';

    const textToMatch = `${candidate.title || ''} ${candidate.snippet || ''} ${candidate.content || ''}`;

    for (const rule of ROLE_PRIORITIES) {
      if (rule.regex.test(candidate.title || '') || rule.regex.test(candidate.snippet || '')) {
        rank = rule.priority;
        matchedCategory = rule.category;
        break;
      }
    }

    // Skip candidates with completely irrelevant roles if rank is 99 and title is not founder/exec
    if (rank === 99 && !/\b(manager|head|director|lead|officer|founder)\b/i.test(textToMatch)) {
      continue;
    }

    let locationScore = 0;
    if (normCity) {
      const cityRegex = new RegExp(`\\b${normCity}\\b`, 'i');
      if (cityRegex.test(candidate.snippet || '') || cityRegex.test(candidate.location || '') || cityRegex.test(candidate.title || '')) {
        locationScore = 1;
      }
    }

    let companyScore = 0;
    if (normCompany) {
      const compRegex = new RegExp(`\\b${normCompany}\\b`, 'i');
      if (compRegex.test(candidate.snippet || '') || compRegex.test(candidate.title || '') || compRegex.test(candidate.url || '')) {
        companyScore = 1;
      }
    }

    // Check for stale indicators (e.g. "former", "previously at", "ex-")
    const isFormer = /\b(former|ex-|previously at)\b/i.test(candidate.snippet || '');

    scored.push({
      ...candidate,
      priorityRank: rank,
      targetRole: matchedCategory,
      locationScore,
      companyScore,
      isFormer,
      compositeScore: (100 - rank * 10) + (locationScore * 10) + (companyScore * 15) - (isFormer ? 40 : 0)
    });
  }

  // Sort descending by composite score
  scored.sort((a, b) => b.compositeScore - a.compositeScore);
  return scored;
}

/**
 * Extracts public business email from search results using regex and domain matching.
 * Never guesses syntax. If not explicitly found in reliable public source, returns 'Not Found'.
 */
function extractPublicBusinessEmail(searchResults = [], companyDomain = '') {
  if (!Array.isArray(searchResults) || searchResults.length === 0) {
    return { email: 'Not Found', sourceUrl: '' };
  }

  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const genericBlocked = [
    'abuse@', 'postmaster@', 'security@', 'privacy@', 'no-reply@', 'noreply@',
    'support@example.com', 'user@domain.com', 'name@email.com', 'email@example.com'
  ];

  const candidates = [];

  for (const item of searchResults) {
    const text = `${item.title || ''} ${item.snippet || ''} ${item.content || ''}`;
    const matches = text.match(emailRegex);
    if (matches) {
      for (const email of matches) {
        const lower = email.toLowerCase();
        if (genericBlocked.some(b => lower.includes(b))) continue;

        // Skip image or binary extensions falsely matched as domains
        if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(lower)) continue;

        candidates.push({
          email: lower,
          sourceUrl: item.url || ''
        });
      }
    }
  }

  if (candidates.length === 0) {
    return { email: 'Not Found', sourceUrl: '' };
  }

  // If company domain is provided, prioritize domain-matched email
  if (companyDomain) {
    const cleanDomain = companyDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    const matched = candidates.find(c => c.email.endsWith(`@${cleanDomain}`));
    if (matched) return matched;
  }

  return candidates[0];
}

/**
 * Clean & normalize LinkedIn URL from search results
 */
function extractLinkedInUrl(text = '', searchResults = []) {
  const linkedinRegex = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[a-zA-Z0-9_-]+/i;

  if (text) {
    const match = text.match(linkedinRegex);
    if (match) return match[0];
  }

  if (Array.isArray(searchResults)) {
    for (const item of searchResults) {
      if (item.url && linkedinRegex.test(item.url)) {
        return item.url.match(linkedinRegex)[0];
      }
      const snippetMatch = (item.snippet || '').match(linkedinRegex);
      if (snippetMatch) return snippetMatch[0];
    }
  }

  return '';
}

module.exports = {
  ROLE_PRIORITIES,
  normalizeString,
  validateInput,
  checkDuplicate,
  rankCandidateLeads,
  extractPublicBusinessEmail,
  extractLinkedInUrl
};
