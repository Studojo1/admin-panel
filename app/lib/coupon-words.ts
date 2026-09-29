// Banned-words check for coupon codes (audit OP-N13).
//
// A live 20%-off code mocked a named person's sexuality
// (ARYANSHISGAYASF206769420). Coupon codes end up on receipts, in admin
// exports and in screenshots, so a code that insults anyone, or reads as a
// sex/drug joke, must be refused at creation. Codes have no word boundaries,
// so we match substrings, after folding common digit/symbol swaps (G4Y -> GAY).
// Words that are common inside innocent codes (ASS in CLASS, KILL in SKILL, DIE in
// STUDIES) are deliberately left out; a human still reviews every new code.
// Shared by the coupons page (instant feedback) and /api/coupons (enforced).

const BANNED = [
  // sexuality / gender used as an insult
  "GAY", "LESBO", "LESBIAN", "HOMO", "FAG", "DYKE", "TRANNY", "SHEMALE", "QUEER", "CHAKKA", "HIJRA",
  // sexual
  "SEX", "PORN", "NUDE", "BOOB", "TITS", "PUSSY", "DICK", "COCK", "PENIS", "VAGINA", "HORNY",
  "SLUT", "WHORE", "RAPE", "RAPIST", "DILDO", "ORGY", "MILF", "BLOWJOB", "NSFW",
  // profanity
  "FUCK", "FUK", "FCK", "SHIT", "BITCH", "CUNT", "BASTARD", "ASSHOLE", "JACKASS", "WANK", "TWAT", "PRICK",
  // Hindi / Hinglish profanity
  "CHUTIYA", "CHUTIA", "MADARCHOD", "BHENCHOD", "BEHENCHOD", "BENCHOD", "GAAND", "GANDU", "LODA",
  "LAUDA", "LUND", "RANDI", "HARAMI", "HARAMKHOR", "KAMINA", "BHOSDI", "BHOSDA", "KUTTA",
  // slurs and hate
  "NIGG", "RETARD", "SPASTIC", "NAZI", "HITLER", "KKK", "JIHAD", "PAKI", "CHINK",
  "KATUA", "MULLA", "SULLA", "BHANGI", "CHAMAR",
  // drugs / violence jokes
  "WEED", "STONER", "COCAINE", "SUICIDE", "MURDER",
];

// Joke numbers only count on the raw code; folding would turn them into letters.
const BANNED_NUMBERS = ["69", "420"];

const FOLD: Record<string, string> = {
  "0": "O", "1": "I", "3": "E", "4": "A", "5": "S", "7": "T", "8": "B", "@": "A", "$": "S", "!": "I",
};

/** The first banned word found in `text`, or null when it is clean. */
export function bannedCouponWord(text: string | null | undefined): string | null {
  const raw = String(text ?? "").toUpperCase();
  const plain = raw.replace(/[^A-Z0-9]/g, "");
  const folded = raw.split("").map((ch) => FOLD[ch] ?? ch).join("").replace(/[^A-Z]/g, "");
  for (const w of BANNED) {
    if (plain.includes(w) || folded.includes(w)) return w;
  }
  for (const n of BANNED_NUMBERS) {
    if (plain.includes(n)) return n;
  }
  return null;
}
