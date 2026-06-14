export function parseProductUrlList(value: string): string[] {
  return [...new Set(
    value
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean)
  )];
}
