export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function includesSearchText(value: unknown, search: unknown): boolean {
  const normalizedSearch = normalizeSearchText(search);
  if (!normalizedSearch) return true;
  return normalizeSearchText(value).includes(normalizedSearch);
}

export function includesAnySearchText(values: unknown[], search: unknown): boolean {
  return values.some((value) => includesSearchText(value, search));
}
