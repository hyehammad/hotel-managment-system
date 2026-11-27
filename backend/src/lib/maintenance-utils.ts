const MAINTENANCE_STOP_WORDS = new Set([
  "a", "an", "the", "in", "on", "at", "to", "for", "of", "with", "is", "are", "was", "were",
  "it", "this", "that", "and", "or", "be", "been", "has", "have", "had", "do", "does", "did",
  "very", "too", "quite", "heavily", "badly", "extremely", "room", "issue", "problem",
  "needs", "need", "needed", "repair", "maintenance", "fix", "fixed",
]);

export function normalizeMaintenanceIssueText(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/\[maintenance\]/gi, "")
    .replace(/\[source:[^\]]+\]/gi, "")
    .replace(/\[severity:[^\]]+\]/gi, "")
    .replace(/\[escalation[^\]]*\]/gi, "")
    .replace(/\[approved[^\]]*\]/gi, "")
    .replace(/\[guest request\]/gi, "")
    .replace(/\|?\s*resolved:.*$/gi, "")
    .replace(/\(reported by[^)]*\)/gi, "")
    .replace(/\(authorized by[^)]*\)/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getSignificantKeywords(text: string): string[] {
  return normalizeMaintenanceIssueText(text)
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !MAINTENANCE_STOP_WORDS.has(w));
}

export function isSameMaintenanceIssue(newIssue: string, existingNote: string): boolean {
  const a = normalizeMaintenanceIssueText(newIssue);
  const b = normalizeMaintenanceIssueText(existingNote);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const wordsA = getSignificantKeywords(newIssue);
  const wordsB = getSignificantKeywords(existingNote);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const common = wordsA.filter(
    (w) => wordsB.includes(w) || wordsB.some((wb) => wb.startsWith(w) || w.startsWith(wb))
  );

  const overlapRatioA = common.length / wordsA.length;
  return common.length >= 2 || (wordsA.length === 1 && common.length === 1 && overlapRatioA >= 0.5);
}
