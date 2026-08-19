/**
 * Converts straight quotes to typographic ones for display.
 *
 * Model prose routinely quotes the writer's own words back — `Precise where
 * "very big" only sounds emphatic` — and straight quotes nested inside a
 * sentence read as a bug on the most-read line of the card. We cannot control
 * what the model emits, so normalise at the point of display.
 */
export function curlyQuotes(text: string): string {
  return (
    text
      // Doubles: opening if preceded by start-of-string or whitespace.
      .replace(/(^|[\s([{<])"/g, '$1“')
      .replace(/"/g, '”')
      // Apostrophes inside words stay apostrophes, never opening quotes.
      .replace(/(\w)'(\w)/g, '$1’$2')
      .replace(/(^|[\s([{<])'/g, '$1‘')
      .replace(/'/g, '’')
  );
}
