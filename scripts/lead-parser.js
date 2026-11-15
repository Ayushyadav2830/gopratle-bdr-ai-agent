/**
 * GoPratle BDR Agent - Lead Parser & Normalization Logic
 * 
 * Provides parsing, normalization, ranking, and deduplication logic
 * compatible with Node.js and n8n Code nodes.
 */

const ROLE_PRIORITIES = [
  { priority: 1, category: 'Events', regex: /\b(head of events?|events? manager|events? lead|events? director|event operations?|experiential events?)\b/i },
  { priority: 2, category: 'Partnerships', regex: /\b(partnerships? manager|brand partnerships?|marketing partnerships?|head of partnerships?|alliances? manager)\b/i },
  { priority: 3, category: 'HR', regex: /\b(head of hr|hr lead|talent acquisition lead|people operations?|head of people|chief people officer)\b/i },
  { priority: 4, category: 'Founder', regex: /\b(co-founder|founder|chief executive officer|ceo|managing director)\b/i },
  { priority: 5, category: 'Operations/Marketing', regex: /\b(head of marketing|marketing director|vp marketing|chief marketing officer|operations? director|head of operations?)\b/i }
];

/**
 * Validates row input from Google Sheets or Webhook
 */
function validateInput(company, city) {
  const errors = [];
  const cleanCompany = (company || '').trim();
  const cleanCity = (city || '').trim();

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
 * Checks if a lead has already been processed or is currently in progress
 */
function checkDuplicate(company, city, existingRows = []) {
  const normCompany = (company || '').toLowerCase().trim();
  const normCity = (city || '').toLowerCase().trim();

  const match = existingRows.find(row => {
    const rowComp = (row.Company_Name || '').toLowerCase().trim();
    const rowCity = (row.City || '').toLowerCase().trim();
    const status = (row.Research_Status || '').toLowerCase().trim();

    return rowComp === normCompany && rowCity === normCity && 
      ['completed', 'processing', 'needs review'].includes(status);
  });

  return {
    isDuplicate: !!match,
    matchedRow: match || null
  };
}

/**
 * Extracts candidate decision makers and ranks them by role relevance
 */
function rankCandidateLeads(candidates = [], targetCompany = '', targetCity = '') {
  if (!candidates || candidates.length === 0) {
    return [];
  }

  const scored = candidates.map(candidate => {
    let rank = 99;
    let matchedCategory = 'Other';

    for (const rule of ROLE_PRIORITIES) {
      if (rule.regex.test(candidate.title || '') || rule.regex.test(candidate.snippet || '')) {
        rank = rule.priority;
        matchedCategory = rule.category;
        break;
      }
    }

    let locationScore = 0;
    if (targetCity) {
      const cityRegex = new RegExp(`\\b${targetCity}\\b`, 'i');
      if (cityRegex.test(candidate.snippet || '') || cityRegex.test(candidate.location || '')) {
        locationScore = 1;
      }
    }

    let companyScore = 0;
    if (targetCompany) {
      const compRegex = new RegExp(`\\b${targetCompany}\\b`, 'i');
      if (compRegex.test(candidate.snippet || '') || compRegex.test(candidate.title || '')) {
        companyScore = 1;
      }
    }

    return {
      ...candidate,
      priorityRank: rank,
      targetRole: matchedCategory,
      locationScore,
      companyScore,
      compositeScore: (100 - rank * 10) + (locationScore * 5) + (companyScore * 5)
    };
  });

  // Sort descending by composite score
  scored.sort((a, b) => b.compositeScore - a.compositeScore);
  return scored;
}

/**
 * Extracts public business email from search results using regex and domain matching
 */
function extractPublicBusinessEmail(searchResults = [], companyDomain = '') {
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const genericBlocked = ['abuse@', 'postmaster@', 'security@', 'privacy@', 'no-reply@', 'noreply@', 'support@example.com'];
  const candidates = [];

  for (const item of searchResults) {
    const text = `${item.title || ''} ${item.snippet || ''} ${item.content || ''}`;
    const matches = text.match(emailRegex);
    if (matches) {
      for (const email of matches) {
        const lower = email.toLowerCase();
        if (genericBlocked.some(b => lower.includes(b))) continue;
        
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

  // Prefer domain matched email if company domain provided
  if (companyDomain) {
    const cleanDomain = companyDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    const matched = candidates.find(c => c.email.endsWith(`@${cleanDomain}`));
    if (matched) return matched;
  }

  return candidates[0];
}

/**
 * Clean & normalize LinkedIn URL
 */
function extractLinkedInUrl(text = '', searchResults = []) {
  const linkedinRegex = /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|pub)\/[a-zA-Z0-9_-]+/i;
  
  // Search text first
  const match = text.match(linkedinRegex);
  if (match) return match[0];

  // Search urls in snippets
  for (const item of searchResults) {
    if (item.url && linkedinRegex.test(item.url)) {
      return item.url.match(linkedinRegex)[0];
    }
    const snippetMatch = (item.snippet || '').match(linkedinRegex);
    if (snippetMatch) return snippetMatch[0];
  }

  return '';
}

module.exports = {
  ROLE_PRIORITIES,
  validateInput,
  checkDuplicate,
  rankCandidateLeads,
  extractPublicBusinessEmail,
  extractLinkedInUrl
};
