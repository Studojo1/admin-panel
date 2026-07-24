/**
 * A teammate's own page — /b2b-gtm/team/:who (vivaan, me, jeremy, hegde, ayushi).
 *
 * It renders the exact same board component as /b2b-gtm; that component reads the
 * `:who` param via useParams() and opens straight onto that person's sheet, so
 * Vivaan lands on his own page and can add his companies from there. Keeping one
 * component means the two routes can never drift apart.
 */
export { meta, default } from "./b2b-gtm";
