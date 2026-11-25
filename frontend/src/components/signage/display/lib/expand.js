// Today takes both halves when it has more pages on this screen than the view allows (0 = off, else 2 to 4).
export function expandWanted(pageCount, expandPages) {
  return Number.isInteger(expandPages) && expandPages >= 2 && pageCount > expandPages
}

// While expanded, a split side narrower than half had more pages before than the half column has now.
// Estimate its own count (pages grow about inversely with the width) so it does not switch back and forth;
// a side at least half wide had at most as many pages, the shown count decides.
export function staysExpanded(pageCount, expandPages, ownFraction) {
  const estimate = ownFraction > 0 && ownFraction < 0.5 ? Math.ceil((pageCount * 0.5) / ownFraction) : pageCount
  return expandWanted(estimate, expandPages)
}
