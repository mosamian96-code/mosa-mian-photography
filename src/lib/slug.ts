// Letters that Unicode normalization doesn't split into a base letter plus an accent,
// so they need spelling out by hand. Without this, "Øresund" lost its first letter.
const SPECIAL_LETTERS: Record<string, string> = { ø: "o", æ: "ae", œ: "oe", ß: "ss", đ: "d", ł: "l", þ: "th", ð: "d" };

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    // Swedish and other accented letters keep their base letter ("Öland" -> "oland")
    // instead of being dropped as non-ASCII ("Öland" used to become "land").
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[øæœßđłþð]/g, (ch) => SPECIAL_LETTERS[ch])
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}
