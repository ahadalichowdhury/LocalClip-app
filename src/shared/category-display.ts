/** UI label for a stored category (maps legacy names). */
export function categoryDisplayLabel(category: string | undefined): string {
  if (!category) return 'Uncategorized';
  if (category.toLowerCase() === 'phone numbers') return 'Numbers';
  return category;
}

/** Whether an entry belongs to the filter chip (chip uses display labels). */
export function entryMatchesCategoryChip(
  entryCategory: string | undefined,
  chipLabel: string
): boolean {
  return categoryDisplayLabel(entryCategory) === chipLabel;
}
