// Today takes both halves when it has more pages on this screen than the view allows (0 = off, else 2 to 4).
export function expandWanted(pageCount, expandPages) {
  return Number.isInteger(expandPages) && expandPages >= 2 && pageCount > expandPages
}

// While expanded, a split side narrower than half had more pages before than the half column has now.
// Estimate its own count so it does not switch back and forth: pages grow at least inversely with the width,
// and `observedRatio` (pages before / pages in the first expanded count) catches rows that wrap more than
// that. A side at least half wide had at most as many pages: the shown count decides.
export function staysExpanded(pageCount, expandPages, ownFraction, observedRatio = 1) {
  const byWidth = ownFraction > 0 && ownFraction < 0.5 ? 0.5 / ownFraction : 1
  const factor = Math.max(byWidth, observedRatio > 1 ? observedRatio : 1)
  return expandWanted(Math.ceil(pageCount * factor), expandPages)
}
