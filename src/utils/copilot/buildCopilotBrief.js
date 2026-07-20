/**
 * BRIEF 30s — only fill slots with real data (no invented phones/names beyond role hint or employee from invoices).
 */
export function buildCopilotBrief(alerts = [], opportunities = []) {
  const topAlert = alerts[0] ?? null
  const topOpp = opportunities[0] ?? null

  const brief = {
    firstTask: topAlert
      ? { text: topAlert.title, alertId: topAlert.id }
      : null,
    firstCall: null,
    firstBranch: null,
    firstOpportunity: topOpp
      ? { text: topOpp.title, opportunityId: topOpp.id }
      : null,
  }

  if (topAlert?.callHint) {
    brief.firstCall = { text: topAlert.callHint, alertId: topAlert.id }
  } else if (topOpp?.callHint) {
    brief.firstCall = { text: topOpp.callHint, opportunityId: topOpp.id }
  }

  if (topAlert?.branchName) {
    brief.firstBranch = {
      text: topAlert.branchName,
      branchId: topAlert.branchId || '',
      alertId: topAlert.id,
    }
  } else if (topOpp?.branchName) {
    brief.firstBranch = {
      text: topOpp.branchName,
      branchId: topOpp.branchId || '',
      opportunityId: topOpp.id,
    }
  }

  return brief
}
