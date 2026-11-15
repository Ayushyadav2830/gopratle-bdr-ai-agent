/**
 * GoPratle BDR Agent - Evidence-Based Lead Confidence Scoring
 * 
 * Implements strict rules from Build Spec Section 7:
 * - High: Relevant role & city/company connection verified with source; contact detail supported if present.
 * - Medium: Relevant person found, but one key detail (city or email) missing/unverified.
 * - Low: Weak match, ambiguous role, stale result, or insufficient evidence.
 */

function calculateConfidenceScore(leadData = {}) {
  const reasons = [];
  let score = 'Low';

  const hasName = leadData.lead_name && leadData.lead_name !== 'Not Found';
  const hasTitle = leadData.job_title && leadData.job_title !== 'Not Found';
  const hasSource = Boolean(leadData.contact_source || leadData.source_url);
  const hasEmail = leadData.public_email && leadData.public_email !== 'Not Found';
  const hasLinkedIn = Boolean(leadData.linkedin_url);
  const isCityRelevant = Boolean(leadData.city_verified || (leadData.location_score && leadData.location_score > 0));
  const isTargetRole = ['Events', 'Partnerships', 'HR', 'Founder'].includes(leadData.target_role);
  const isFormer = Boolean(leadData.isFormer);

  // Stale profile or missing core facts must immediately result in Low confidence
  if (!hasName || !hasTitle || !hasSource || isFormer) {
    score = 'Low';
    if (isFormer) {
      reasons.push('Candidate appears to be a former employee or stale profile');
    } else {
      reasons.push('Insufficient evidence: missing person name, title, or supporting source URL');
    }
    return {
      confidence: score,
      reason: reasons.join('; '),
      eligibleForDraft: false,
      eligibleForApproval: false
    };
  }

  // Evaluate High vs Medium
  if (isTargetRole && isCityRelevant && (hasEmail || hasLinkedIn)) {
    score = 'High';
    reasons.push(`Verified ${leadData.target_role} role at target company`);
    reasons.push('Location connection confirmed');
    if (hasEmail) reasons.push('Public business email verified by source');
    else if (hasLinkedIn) reasons.push('Public professional profile verified');
  } else if (hasName && hasTitle) {
    score = 'Medium';
    if (!isCityRelevant) reasons.push('City connection not independently verified');
    if (!hasEmail) reasons.push('Direct public business email not found in verified sources');
    if (!isTargetRole) reasons.push(`Role (${leadData.target_role || 'General'}) is outside top priority tiers`);
  } else {
    score = 'Low';
    reasons.push('Weak candidate match or ambiguous role');
  }

  return {
    confidence: score,
    reason: reasons.join('; '),
    eligibleForDraft: (score === 'High' || score === 'Medium') && hasEmail,
    eligibleForApproval: score === 'High' && hasEmail
  };
}

module.exports = {
  calculateConfidenceScore
};
