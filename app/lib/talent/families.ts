// TALENT-NET (12 Nov 2026, the owner: "need our mapping to be more accurate and on the top show a bar with total number
// of students, the graph should be like a neural network, where if i click then go deeper to see each student"). Every
// student gets one career family and one canonical role from a fixed taxonomy, a few secondary ones, and the reason in
// plain words ("Wanted role: Business Analyst"). Synonyms fold (SDE, software developer and programmer are one Software
// engineer; backend, frontend and full stack stay roles under Software engineering). Evidence is read in tiers and the
// first that says something decides (TALENT-NET-2, after the coordinator's prod dry run): their first wanted role, the
// roles they are open to, their title, headline and past roles, the course, then the skills. The old product's AI read
// of the resume never decides, it is a second fit. Anything they rule out never places them in that family; a student
// we cannot read goes to "Not enough data", never a guess. Then the network the page draws: families, roles, counts.
// The only import is a type, so node --test runs it as is (scripts/talent-families.test.mjs).
import type { Candidate } from "./model";

// ------------------------------------------------------------------- taxonomy

export type Fam =
  | "software" | "data" | "ai" | "product" | "design" | "marketing" | "content" | "sales" | "finance" | "consulting" | "ops" | "hr"
  | "core" | "science" | "legal" | "education" | "other" | "none";

/** One role: a slug, its label, and the phrases that mean it (commas between phrases; a plural of the last word counts too). */
type RoleDef = [slug: string, label: string, phrases: string];
interface FamDef { key: Fam; label: string; short: string; roles: RoleDef[] }

/**
 * The fixed taxonomy. Order inside a family does not matter: the longest phrase wins wherever it starts ("product
 * marketing manager" is Product marketing, not Product manager). A phrase sits in one role only (the tests check).
 */
export const TAXONOMY: FamDef[] = [
  {
    key: "software", label: "Software engineering", short: "Software", roles: [
      ["swe", "Software engineer", "software engineer, software engineering, software developer, software development, sde, sde 1, sde i, sde intern, swe, developer, programmer, coder, programming, coding, application developer, software, core java, product engineer, solution architect, software architect, enterprise architect, it engineer, computer engineer, salesforce developer, it services"],
      ["backend", "Backend developer", "backend, back end, backend developer, backend engineer, backend development, server side, node developer, node js developer, nodejs developer, java developer, python developer, django developer, golang developer, api developer, spring boot developer, php developer, net developer, dotnet developer"],
      ["frontend", "Frontend developer", "frontend, front end, frontend developer, frontend engineer, front end developer, frontend development, ui developer, react developer, react js developer, reactjs developer, angular developer, vue developer, javascript developer"],
      ["fullstack", "Full stack developer", "full stack, fullstack, full stack developer, full stack engineer, full stack development, mern, mern stack, mean stack, web developer, web development, website developer"],
      ["mobile", "Mobile developer", "mobile developer, mobile app developer, mobile application developer, app developer, app development, android, android developer, ios developer, flutter, flutter developer, react native, react native developer"],
      ["devops", "DevOps and cloud", "devops, dev ops, devops engineer, cloud engineer, cloud, cloud computing, site reliability, sre, cloud architect, aws engineer, platform engineer, infrastructure engineer, system administrator, sysadmin, network engineer, linux administrator"],
      ["qa", "QA and testing", "qa, qa engineer, qa analyst, quality assurance, quality assurance engineer, software tester, tester, test engineer, testing, software testing, automation testing, automation tester, manual testing, sdet"],
      ["security", "Cybersecurity", "cyber security, cybersecurity, security analyst, security engineer, information security, ethical hacker, ethical hacking, penetration tester, pentester, soc analyst, network security, infosec, vapt"],
      ["game", "Game developer", "game developer, game development, game designer, game design, unity developer, unreal developer, game programmer"],
      ["blockchain", "Blockchain and web3", "blockchain, blockchain developer, web3, web3 developer, solidity developer, smart contract"],
    ],
  },
  {
    key: "data", label: "Data & analytics", short: "Data & analytics", roles: [
      ["analyst", "Data analyst", "data analyst, data analytics, data analysis, analytics, data, mis, mis analyst, mis executive, reporting analyst, power bi developer, power bi analyst, tableau developer, bi analyst, bi developer, business intelligence, business intelligence analyst, data visualization, data visualisation, analytics engineer, analytics intern, a b testing"],
      ["ba", "Business analyst", "business analyst, business analytics, business analysis, functional analyst, it business analyst, business system analyst, business systems analyst, systems analyst"],
      ["scientist", "Data scientist", "data scientist, data science, decision scientist, statistician, statistical analyst, biostatistician"],
      ["engineer", "Data engineer", "data engineer, data engineering, big data, etl, etl developer, big data engineer, data architect, data pipeline, database administrator, dba, database developer, sql developer"],
    ],
  },
  {
    key: "ai", label: "AI & machine learning", short: "AI & ML", roles: [
      ["ml", "Machine learning engineer", "machine learning, machine learning engineer, ml engineer, ml, mlops, deep learning, deep learning engineer, computer vision, computer vision engineer, cv engineer, nlp, nlp engineer, natural language processing, ml developer"],
      ["ai", "AI engineer", "ai, ai engineer, ai developer, ai ml, aiml, ai ml engineer, artificial intelligence, generative ai, gen ai, genai, genai engineer, llm, llm engineer, prompt engineer, prompt engineering, ai agent, ai automation, conversational ai, chatbot developer, ai specialist, ai trainer"],
      ["research", "AI researcher", "ai researcher, ai research, ml researcher, machine learning researcher, research engineer"],
    ],
  },
  {
    key: "product", label: "Product", short: "Product", roles: [
      ["pm", "Product manager", "product manager, product management, apm, associate product manager, product owner, product, product lead, product associate, technical product manager, ai product manager, product development"],
      ["analyst", "Product analyst", "product analyst, product analytics"],
    ],
  },
  {
    key: "design", label: "Design", short: "Design", roles: [
      ["uiux", "UI/UX designer", "ui ux, ui ux designer, ui ux design, ux, ux designer, ux design, ui designer, ui design, ui, user experience, user experience designer, user interface designer, interaction designer, ux researcher, ux research, user research, ux writer, web designer, app designer"],
      ["graphic", "Graphic designer", "graphic designer, graphic design, graphics designer, visual designer, visual design, brand designer, communication designer, creative designer, illustrator, illustration, layout designer, packaging designer, print designer, logo designer"],
      ["industrial", "Industrial designer", "product designer, product design, industrial designer, industrial design, furniture designer, toy designer"],
      ["motion", "Animation and motion", "animator, animation, motion designer, motion graphics, motion graphic designer, 3d artist, 3d designer, 3d modeler, 3d modelling, vfx, vfx artist, concept artist, character designer, 2d animator, 3d animator, game artist"],
      ["fashion", "Fashion and textile", "fashion designer, fashion design, fashion, textile designer, textile design, apparel designer, jewellery designer, jewelry designer, stylist, fashion stylist, merchandiser, visual merchandiser, fashion merchandiser"],
      ["interior", "Interior and architecture", "interior designer, interior design, interior, architect, architectural designer, landscape architect, urban designer, urban planner, set designer, exhibition designer"],
      ["general", "Designer, general", "designer, design, design intern"],
    ],
  },
  {
    key: "marketing", label: "Marketing & growth", short: "Marketing", roles: [
      ["general", "Marketing, general", "marketing, marketing executive, marketing intern, marketing associate, marketing manager, marketing coordinator, marketing specialist, marketer, marketing strategy, marketing management, marketing consultant, fashion marketing"],
      ["digital", "Digital and performance", "digital marketing, digital marketer, digital marketing executive, performance marketing, performance marketer, paid marketing, paid ads, paid media, ppc, sem, search engine marketing, google ads, meta ads, facebook ads, media buyer, media buying, media planner, media planning, programmatic, email marketing, crm marketing, lifecycle marketing, marketing automation, affiliate marketing, ecommerce marketing, e commerce marketing, seo, seo executive, seo specialist, seo analyst, search engine optimization, search engine optimisation, aso"],
      ["social", "Social media", "social media, social media marketing, social media manager, social media executive, social media marketer, social media strategist, social media specialist, community manager, community management, influencer marketing, influencer manager, creator partnerships, smm"],
      ["growth", "Growth", "growth, growth marketing, growth marketer, growth hacker, growth hacking, growth manager, growth analyst, growth associate, user acquisition, retention marketing"],
      ["brand", "Brand", "brand, brand manager, brand management, brand marketing, brand strategist, brand strategy, brand associate, branding, brand executive"],
      ["pmm", "Product marketing", "product marketing, product marketing manager, product marketer, pmm, go to market, gtm"],
      ["research", "Market research", "market research, market research analyst, market researcher, marketing research, consumer insights, consumer research, insights analyst, marketing analyst, marketing analytics"],
      ["pr", "PR and communications", "public relations, pr, pr executive, corporate communications, corporate communication, marketing communication, marketing communications, communications manager, communication executive, communications executive, communications specialist, marcom, marcomm, media relations, comms"],
      ["events", "Events", "event management, event manager, event planner, event planning, event coordinator, event marketing, events executive, event executive, events intern, events management"],
    ],
  },
  {
    key: "content", label: "Content & media", short: "Content & media", roles: [
      ["writer", "Content writer", "content writer, content writing, writer, copywriter, copy writer, copywriting, content strategist, content strategy, content marketing, content marketer, content, content executive, content specialist, content developer, content manager, technical writer, technical writing, blogger, blog writer, ghostwriter, ghost writer, editor, editorial, proofreader, proofreading, script writer, scriptwriter, screenwriter, creative writer, creative writing, author, storytelling"],
      ["creator", "Video and creator", "video editor, video editing, video production, videographer, videography, video creator, content creator, content creation, creator, youtuber, youtube, influencer, photographer, photography, filmmaker, film maker, filmmaking, cinematographer, film editor, podcast, podcaster, podcast producer, reels, short form video, ugc creator, ugc"],
      ["journalist", "Journalist", "journalist, journalism, reporter, news, news anchor, anchor, correspondent, sub editor, news editor, broadcast journalist, rj, radio jockey"],
      ["media", "Media and entertainment", "media, entertainment, film, music, music producer, music production, production assistant, ott, television, tv, theatre, acting, actor"],
    ],
  },
  {
    key: "sales", label: "Sales & business development", short: "Sales & BD", roles: [
      ["bd", "Business development", "business development, business development executive, business development associate, business development manager, business development intern, bde, bda, bdm, bdr, biz dev, bizdev, partnerships, partnership, partnership manager, alliances, strategic partnerships"],
      ["sales", "Sales executive", "sales, sales executive, sales associate, sales intern, sales manager, sales representative, sales rep, inside sales, field sales, b2b sales, saas sales, enterprise sales, sdr, sales development representative, account executive, pre sales, presales, telesales, tele sales, telecaller, tele caller, retail sales, sales officer, sales trainee, lead generation, cold calling, academic counsellor, admission counsellor, admissions counsellor, sales consultant, sales coordinator, area sales manager, medical representative, medical rep"],
      ["account", "Customer success", "account manager, account management, key account manager, key account, customer success, customer success manager, customer success executive, client relations, client relationship, client relationship manager, client servicing, client service, client success, relationship manager, relationship executive, client partner, account coordinator"],
    ],
  },
  {
    key: "finance", label: "Finance & accounting", short: "Finance", roles: [
      ["general", "Finance, general", "finance, finance executive, finance intern, finance associate, finance manager, finance trainee, financial, corporate finance, treasury, finance and accounts, f and a"],
      ["analyst", "Financial analyst", "financial analyst, finance analyst, financial analysis, fp and a, fpa, financial planning analysis, financial modelling, financial modeling, valuation, valuation analyst, credit analyst, corporate finance analyst, cfa"],
      ["ib", "Investment banking, PE/VC", "investment banking, investment banker, investment banking analyst, ib, ib analyst, m and a, mergers acquisitions, merger acquisition, private equity, pe analyst, venture capital, vc, vc analyst, venture capital analyst, investment analyst, investment associate, capital markets, investment management, asset management, portfolio management, portfolio manager, fund management, hedge fund, family office"],
      ["research", "Equity research, trading", "equity research, equity research analyst, research analyst, equity analyst, stock market, stock trading, trader, trading, quant, quantitative analyst, quant analyst, quantitative finance, derivatives, technical analyst, securities"],
      ["accounts", "Accounting", "accountant, accounting, accounts, accounts executive, accounts intern, accounts assistant, account assistant, accounts payable, accounts receivable, bookkeeping, bookkeeper, tally, billing executive, accounting executive, general ledger, gl accountant, cost accountant"],
      ["audit", "Audit and tax", "audit, auditor, audit associate, audit assistant, audit intern, auditing, internal audit, statutory audit, external audit, assurance, tax, taxation, tax consultant, tax associate, tax analyst, direct tax, indirect tax, gst, income tax, transfer pricing, articleship, article assistant, articled assistant, ca, chartered accountant, ca articleship, cma, acca, cpa, forensic accounting"],
      ["banking", "Banking, insurance, risk", "banking, banker, bank, bank po, probationary officer, bank clerk, retail banking, corporate banking, loan officer, credit officer, credit manager, underwriter, underwriting, insurance, insurance advisor, actuarial, actuary, actuarial analyst, wealth management, wealth manager, financial advisor, financial adviser, financial planner, mutual fund, kyc, aml, kyc analyst, risk analyst, risk management, credit risk, market risk, operational risk, risk associate, fraud analyst"],
    ],
  },
  {
    key: "consulting", label: "Consulting & strategy", short: "Consulting", roles: [
      ["consultant", "Consultant", "consultant, consulting, management consultant, management consulting, strategy consultant, business consultant, associate consultant, consulting analyst, consulting intern, advisory, business advisory, risk advisory, deals advisory, transaction advisory, big 4, big four, mbb"],
      ["strategy", "Strategy", "strategy, strategy analyst, strategy associate, strategy intern, business strategy, corporate strategy, strategic, strategic planning, strategy operations, strategic initiatives, business planning"],
      ["foa", "Founder's office", "founders office, founder office, founders office associate, founder associate, founders associate, chief of staff, ceo office, ceos office, office ceo, foa"],
      ["entrepreneur", "Entrepreneur", "entrepreneur, entrepreneurship, founder, co founder, cofounder, startup founder, own business, business owner, intrapreneur"],
      ["erp", "ERP and tech consulting", "sap, sap consultant, sap fico, sap mm, sap sd, sap abap, sap hana, erp, erp consultant, oracle consultant, oracle fusion, salesforce, salesforce consultant, salesforce administrator, salesforce admin, crm consultant, servicenow, workday, it consultant, technology consultant, tech consultant, functional consultant, techno functional, digital transformation, implementation consultant, solution consultant, presales consultant"],
      ["esg", "Sustainability and ESG", "sustainability, esg, esg analyst, sustainability analyst, sustainability consultant, climate, climate tech, carbon, carbon accounting"],
      ["policy", "Policy and social impact", "policy, public policy, policy analyst, policy research, think tank, government relations, public affairs, development sector, social impact, ngo, nonprofit, non profit, csr, corporate social responsibility, social sector, social work, social worker, governance"],
    ],
  },
  {
    key: "ops", label: "Operations & supply chain", short: "Operations", roles: [
      ["ops", "Operations executive", "operations, operation, operations executive, operations associate, operations analyst, operations manager, operations intern, ops, business operations, bizops, biz ops, process associate, process executive, back office, back office executive, operations management, revops, revenue operations, sales operations, marketing operations, store operations, retail operations, store manager, retail, ecommerce operations, e commerce operations, catalog management, catalogue management, category management, category manager, category associate"],
      ["scm", "Supply chain and logistics", "supply chain, supply chain management, scm, logistics, logistic, logistics executive, logistics coordinator, procurement, purchase, purchasing, purchase executive, buyer, sourcing executive, strategic sourcing, vendor management, vendor development, inventory, inventory management, warehouse, warehousing, demand planning, demand planner, supply planning, import export, exim, export, import, shipping, freight, fleet, transportation, distribution, last mile"],
      ["project", "Project manager", "project manager, project management, project coordinator, project associate, project executive, project management intern, program manager, programme manager, program management, program coordinator, programme coordinator, pmo, scrum master, delivery manager, project lead"],
      ["support", "Customer support", "customer support, customer service, customer care, customer support executive, customer service executive, customer experience, cx, call center, call centre, bpo, voice process, non voice, non voice process, chat support, email support, technical support, tech support, it support, helpdesk, help desk, service desk, desktop support, content moderator, content moderation, trust safety"],
      ["admin", "Admin and coordination", "admin, administration, administrative, administrator, office administrator, office admin, office manager, office assistant, front office, front desk, receptionist, executive assistant, personal assistant, virtual assistant, data entry, data entry operator, documentation, coordinator, facility management, facilities"],
    ],
  },
  {
    key: "hr", label: "HR & people", short: "HR", roles: [
      ["hr", "HR generalist", "hr, human resource, human resources, hr executive, hr intern, hr generalist, hr associate, hr manager, hr business partner, hrbp, hr operations, people operations, people ops, people culture, people partner, employee engagement, employee relations, learning development, l d, training development, corporate trainer, soft skills trainer, payroll, compensation, compensation benefits, c b, hr analytics, hr analyst, hris, hr consultant, organisational development, organizational development"],
      ["recruiter", "Talent acquisition", "recruiter, recruitment, recruiting, talent acquisition, talent acquisition executive, technical recruiter, it recruiter, hr recruiter, recruitment executive, recruitment consultant, recruitment coordinator, headhunter, headhunting, talent sourcer, sourcer, hiring, staffing, campus hiring, campus recruitment"],
    ],
  },
  {
    key: "core", label: "Core engineering", short: "Core engineering", roles: [
      ["mech", "Mechanical engineer", "mechanical, mechanical engineer, mechanical engineering, mechanical design, design engineer, cad engineer, cad designer, cad, automobile, automobile engineer, automotive, automotive engineer, ev, electric vehicle, aerospace, aerospace engineer, aeronautical, aeronautical engineer, thermal engineer, hvac, hvac engineer, maintenance engineer, piping, piping engineer, tool design, product design engineer, r d engineer, marine engineer"],
      ["civil", "Civil engineer", "civil, civil engineer, civil engineering, structural engineer, structural engineering, structural design, site engineer, construction, construction management, construction engineer, quantity surveyor, quantity surveying, billing engineer, planning engineer, project engineer, highway engineer, geotechnical, surveyor, bim, bim engineer, bim modeler"],
      ["electrical", "Electrical engineer", "electrical, electrical engineer, electrical engineering, electrical design, power systems, power engineer, electrical maintenance, substation, solar, solar engineer, renewable energy, energy engineer, electrical electronics, eee"],
      ["electronics", "Electronics and embedded", "electronics, electronics engineer, electronics engineering, electronics communication, ece, embedded, embedded systems, embedded engineer, embedded software, embedded developer, firmware, firmware engineer, vlsi, vlsi engineer, vlsi design, asic, fpga, rtl design, design verification, verification engineer, physical design, analog design, chip design, semiconductor, hardware, hardware engineer, hardware design, pcb, pcb design, iot, iot engineer, internet things, telecom, telecommunication, rf engineer, signal processing, instrumentation, instrumentation engineer, electronics instrumentation, avionics"],
      ["robotics", "Robotics and automation", "robotics, robotics engineer, automation engineer, industrial automation, plc, plc programmer, scada, control systems, controls engineer, mechatronics, drone, uav"],
      ["chemical", "Chemical and process", "chemical, chemical engineer, chemical engineering, process engineer, process engineering, petroleum, petroleum engineer, oil gas, refinery, polymer, metallurgy, metallurgical, materials engineer, material science, materials science, mining, mining engineer"],
      ["production", "Production and quality", "production engineer, production, manufacturing, manufacturing engineer, quality engineer, quality control, qc, quality, quality inspector, lean manufacturing, six sigma, industrial engineer, industrial engineering, plant engineer, shop floor, maintenance"],
      ["general", "Core engineer, general", "core engineering, core engineer, core, graduate engineer trainee"],
    ],
  },
  {
    key: "science", label: "Science & healthcare", short: "Science & health", roles: [
      ["clinical", "Healthcare and clinical", "doctor, physician, medical, medical officer, mbbs, clinical, clinician, nurse, nursing, staff nurse, physiotherapist, physiotherapy, dentist, dental, bds, healthcare, health care, hospital, hospital administration, healthcare management, medical coding, medical coder, pharmacist, optometrist, dietitian, dietician, nutritionist, nutrition, public health, epidemiology, epidemiologist, radiology, lab technician, medical lab technician, paramedic, ayurveda, bams, bhms, homeopathy, veterinary"],
      ["pharma", "Pharma and life sciences", "pharma, pharmaceutical, pharmacy, pharmacology, pharmacovigilance, drug safety, regulatory affairs, clinical research, clinical research associate, clinical data, clinical trials, clinical data management, biotech, biotechnology, biotechnologist, microbiology, microbiologist, biochemistry, biochemist, molecular biology, genetics, genomics, bioinformatics, life sciences, life science, biomedical, biomedical engineer, medical devices, food technology, food technologist, food science, medical writer"],
      ["research", "Research and science", "research, researcher, research assistant, research associate, research intern, research fellow, research scholar, phd, scientist, scientific, lab, laboratory, physics, physicist, chemistry, chemist, biology, biologist, mathematics, mathematician, astronomy, astrophysics, environmental science, environmental scientist, environmental engineer, geology, geologist, ecology, zoology, botany"],
      ["psychology", "Psychology and counselling", "psychology, psychologist, clinical psychologist, counselling psychologist, counsellor, counselor, counselling, counseling, therapist, mental health, behavioural science, behavioral science, occupational therapist, speech therapist"],
    ],
  },
  {
    key: "legal", label: "Legal", short: "Legal", roles: [
      ["lawyer", "Lawyer and legal associate", "lawyer, law, legal, advocate, attorney, solicitor, legal associate, legal intern, legal assistant, legal analyst, legal researcher, legal research, litigation, litigator, corporate law, corporate lawyer, legal counsel, counsel, in house counsel, paralegal, law firm, legal advisor, legal consultant, legal executive, judicial, judiciary, judge, ip, intellectual property, patent, patent analyst, trademark, contract management, legal drafting, arbitration, dispute resolution, llb, ba llb, bba llb"],
      ["compliance", "Compliance and secretarial", "compliance, compliance officer, compliance analyst, compliance associate, regulatory compliance, company secretary, cs executive, company secretarial, secretarial, corporate governance, grc, regulatory"],
    ],
  },
  {
    key: "education", label: "Education", short: "Education", roles: [
      ["teacher", "Teacher and tutor", "teacher, teaching, tutor, tutoring, home tutor, online tutor, educator, faculty, lecturer, professor, assistant professor, teaching assistant, trainer, instructor, career counsellor, career coach, education counsellor, study abroad counsellor, education consultant, education, b ed"],
      ["curriculum", "Curriculum design", "instructional designer, instructional design, curriculum designer, curriculum design, curriculum developer, curriculum development, learning designer, learning experience designer, e learning, elearning, academic content writer, academic content developer, educational content"],
    ],
  },
];

/** Evidence we read but no family fits, and students we cannot read at all. */
export const OTHER = { key: "other" as const, label: "Other roles", short: "Other roles" };
export const NONE = { key: "none" as const, label: "Not enough data", short: "Not enough data" };
const NONE_ROLES: Record<string, string> = { "none/empty": "Nothing to read", "none/little": "Too little to tell", "none/refused": "Only what they rule out" };
export const UNSAID = "Role not said";

const FAM_LABEL = new Map<Fam, { label: string; short: string }>([
  ...TAXONOMY.map((f) => [f.key, { label: f.label, short: f.short }] as const),
  [OTHER.key, OTHER], [NONE.key, NONE],
]);
export const FAMILY_ORDER: Fam[] = [...TAXONOMY.map((f) => f.key), "other", "none"];
export const famLabel = (k: string) => FAM_LABEL.get(k as Fam)?.label ?? k;
export const famShort = (k: string) => FAM_LABEL.get(k as Fam)?.short ?? k;

const ROLE_LABEL = new Map<string, string>();
for (const f of TAXONOMY) {
  for (const [slug, label] of f.roles) ROLE_LABEL.set(`${f.key}/${slug}`, label);
  ROLE_LABEL.set(`${f.key}/unsaid`, UNSAID);
}
for (const [k, v] of Object.entries(NONE_ROLES)) ROLE_LABEL.set(k, v);

/** The label of a canonical role key ("data/ba" is "Business analyst"); an Other role's key carries its own words. */
export function roleLabelOf(key: string): string {
  const hit = ROLE_LABEL.get(key);
  if (hit) return hit;
  const words = key.startsWith("other/") ? key.slice(6) : key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ------------------------------------------------------------------- words

/** Little words that never decide a role ("Marketing or Sales" is marketing, then sales). */
const FILLER = new Set(["and", "or", "of", "the", "in", "for", "a", "an", "with", "to", "at", "on", "as", "by", "from"]);

/** Lower case, apostrophes out ("founder's" is "founders"), & to and, punctuation to spaces, keeping c++ and c#. */
export const toks = (s: string): string[] =>
  s.normalize("NFKC").toLowerCase().replace(/[‘’'`]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9+#]+/g, " ").split(" ").filter((w) => w && !FILLER.has(w));

interface Entry { fam: Fam | null; role: string | null; w: number; ux?: boolean }
interface Dict { map: Map<string, Entry>; max: Map<string, number> }

/** Phrases that two roles both claimed (the first keeps it): the tests want none. */
export const DUPES: string[] = [];

function dictOf(rows: [Entry, string][], strict = true): Dict {
  const d: Dict = { map: new Map(), max: new Map() };
  const put = (v: string[], e: Entry, plural: boolean) => {
    const k = v.join(" ");
    const had = d.map.get(k);
    if (had) {
      if (strict && !plural && (had.fam !== e.fam || had.role !== e.role)) DUPES.push(k);
      return;
    }
    d.map.set(k, e);
    d.max.set(v[0], Math.max(d.max.get(v[0]) ?? 0, v.length));
  };
  const all = rows.flatMap(([e, phrases]) => phrases.split(",").map((p) => [e, toks(p)] as const).filter(([, t]) => t.length));
  // Every phrase as written first, then the plurals where the spelling is still free ("mbb" is not "mbbs").
  for (const [e, t] of all) put(t, e, false);
  for (const [e, t] of all) if (!t[t.length - 1].endsWith("s")) put([...t.slice(0, -1), `${t[t.length - 1]}s`], e, true);
  return d;
}

/**
 * Words that consume a phrase without placing anyone: a degree inside a headline ("B.Tech student"), a sector
 * ("fintech"), a skill ("data structures"), "career growth", civil services (no family fits them: Other).
 */
const BLOCK = "b tech, btech, m tech, mtech, b e, edtech, fintech, healthtech, agritech, proptech, legaltech, product based, product company, product startup, service based, data structures, data structure, system design, design thinking, career growth, personal growth, growth mindset, growth oriented, business administration, communication skills, communication skill, civil services, civil service, upsc, ias, government job, brand ambassador, campus ambassador, student ambassador, research paper, cv";

const ROLE_ROWS = TAXONOMY.flatMap((f) =>
  f.roles.map(([slug, , phrases]): [Entry, string] => [{ fam: f.key, role: `${f.key}/${slug}`, w: 1, ux: f.key === "design" && slug === "industrial" }, phrases]));
const ROLE_DICT = dictOf([...ROLE_ROWS, [{ fam: null, role: null, w: 0 }, BLOCK]]);

/**
 * What they rule out. A word for the whole field ("marketing", "tech", "sales", "core") rules out the family; a
 * specific role ("social media marketing", "insurance") rules out that role only, so a student who refuses social
 * media can still sit in Marketing as a brand manager.
 */
const FAMILY_WORDS: [Fam, string][] = [
  ["software", "software, tech, technology, it, coding, programming, development, developer, it jobs, tech roles, tech jobs, software jobs"],
  ["data", "data, analytics, data roles"],
  ["ai", "ai, artificial intelligence, machine learning, ml"],
  ["product", "product"],
  ["design", "design, designer, designing"],
  ["marketing", "marketing, marketing roles"],
  ["content", "content, media, writing"],
  ["sales", "sales, selling, cold calling, field sales, field work, field job, targets, telecalling, telesales, sales roles"],
  ["finance", "finance, accounts, accounting, ca, financial"],
  ["consulting", "consulting"],
  ["ops", "operations, ops, bpo, call center, call centre, back office"],
  ["hr", "hr, human resources"],
  ["core", "core, core jobs, core engineering, core roles"],
  ["science", "research, healthcare, medical"],
  ["legal", "legal, law"],
  ["education", "teaching, education, edtech"],
];
const REFUSE_DICT = dictOf([...FAMILY_WORDS.map(([fam, p]): [Entry, string] => [{ fam, role: null, w: 1 }, p]), ...ROLE_ROWS], false);

/** The course or degree. A specific one places a student (1.5); a broad one only tips the balance (0.75). */
const COURSE_DICT = dictOf([
  [{ fam: "software", role: null, w: 1.5 }, "computer science, computer science engineering, computer engineering, cse, cs, bca, mca, information technology, it, b tech it, btech it, bsc it, b sc it, msc it, m sc it, software engineering, computer applications, computing, cs engineering"],
  [{ fam: "data", role: null, w: 1.5 }, "data science, data analytics, business analytics, analytics, big data"],
  [{ fam: "data", role: null, w: 0.75 }, "statistics, applied statistics"],
  [{ fam: "ai", role: null, w: 1.5 }, "artificial intelligence, ai, ai ml, aiml, machine learning"],
  [{ fam: "design", role: null, w: 1.5 }, "design, b des, bdes, m des, mdes, ui ux, ux design, communication design, graphic design, visual communication"],
  [{ fam: "design", role: "design/industrial", w: 1.5 }, "product design, industrial design"],
  [{ fam: "design", role: "design/fashion", w: 1.5 }, "fashion design, fashion technology, nift, textile design, fashion"],
  [{ fam: "design", role: "design/interior", w: 1.5 }, "interior design, architecture, b arch, barch, m arch"],
  [{ fam: "design", role: "design/motion", w: 1.5 }, "animation, multimedia, vfx"],
  [{ fam: "design", role: null, w: 0.75 }, "fine arts, bfa, mfa"],
  [{ fam: "marketing", role: null, w: 1.5 }, "marketing, marketing management, digital marketing, advertising, brand management"],
  [{ fam: "marketing", role: "marketing/research", w: 1.5 }, "marketing research, market research"],
  [{ fam: "content", role: null, w: 1.5 }, "mass communication, mass comm, mass media, bmm, bjmc, media studies, film studies, journalism mass communication"],
  [{ fam: "content", role: "content/journalist", w: 1.5 }, "journalism"],
  [{ fam: "content", role: "content/creator", w: 1.5 }, "film making, filmmaking"],
  [{ fam: "content", role: null, w: 0.75 }, "english literature, english, literature, creative writing"],
  [{ fam: "finance", role: null, w: 1.5 }, "finance, banking finance, accounting, accountancy, accounting finance, financial markets"],
  [{ fam: "finance", role: "finance/banking", w: 1.5 }, "banking insurance, actuarial science, banking"],
  [{ fam: "finance", role: "finance/audit", w: 1.5 }, "ca, chartered accountancy, cma, acca"],
  [{ fam: "finance", role: null, w: 0.75 }, "commerce, b com, bcom, m com, mcom, bcom hons, b com hons, b com h, economics"],
  [{ fam: "consulting", role: null, w: 1.5 }, "strategy, strategic management, business strategy, consulting, management consulting"],
  [{ fam: "ops", role: null, w: 1.5 }, "operations, operations management, retail management"],
  [{ fam: "ops", role: "ops/scm", w: 1.5 }, "supply chain, supply chain management, logistics, logistics management"],
  [{ fam: "hr", role: null, w: 1.5 }, "human resource, human resources, human resource management, hrm, hr, personnel management"],
  [{ fam: "core", role: "core/mech", w: 1.5 }, "mechanical, mechanical engineering, automobile, automotive, aerospace, aeronautical, marine engineering"],
  [{ fam: "core", role: "core/production", w: 1.5 }, "production engineering, industrial engineering, manufacturing"],
  [{ fam: "core", role: "core/civil", w: 1.5 }, "civil, civil engineering, construction"],
  [{ fam: "core", role: "core/electrical", w: 1.5 }, "electrical, electrical engineering, eee, electrical electronics"],
  [{ fam: "core", role: "core/electronics", w: 1.5 }, "electronics, electronics communication, ece, electronics telecommunication, entc, extc, instrumentation, electronics instrumentation, vlsi"],
  [{ fam: "core", role: "core/robotics", w: 1.5 }, "mechatronics, robotics, robotics automation"],
  [{ fam: "core", role: "core/chemical", w: 1.5 }, "chemical, chemical engineering, petroleum, metallurgy, metallurgical, mining, polymer"],
  [{ fam: "science", role: "science/clinical", w: 1.5 }, "mbbs, bds, nursing, bsc nursing, physiotherapy, bpt, bams, bhms, veterinary, public health, nutrition"],
  [{ fam: "science", role: "science/pharma", w: 1.5 }, "pharmacy, b pharm, bpharm, b pharma, m pharm, pharm d, pharmd, biotechnology, biotech, microbiology, biochemistry, life sciences, bioinformatics, genetics, food technology, biomedical engineering"],
  [{ fam: "science", role: "science/research", w: 1.2 }, "zoology, botany, physics, chemistry, biology, environmental science, geology"],
  [{ fam: "science", role: "science/psychology", w: 1.5 }, "psychology, applied psychology"],
  [{ fam: "legal", role: "legal/lawyer", w: 1.5 }, "llb, ba llb, bba llb, b llb, llm, law, legal studies, integrated law"],
  [{ fam: "education", role: "education/teacher", w: 1.5 }, "b ed, m ed, education, elementary education, d el ed, deled"],
  [{ fam: null, role: null, w: 0 }, "b tech, btech, b e, be, bba, mba, pgdm, ba, bsc, b sc, ma, msc, m sc, bms, bbm, me, m tech, mtech, phd, business, business administration, business management, management, management studies, business studies, high school, school, class 12, 12th"],
]);

/** Resume skills that point to one family (a common one like Excel, Python or Canva points nowhere). */
const SKILL_DICT = dictOf([
  [{ fam: "software", role: null, w: 1 }, "javascript, typescript, react, react js, reactjs, node js, nodejs, next js, express js, angular, vue, vue js, html, css, java, c++, c#, rust, kotlin, swift, php, ruby, django, flask, spring boot, spring, hibernate, mongodb, postgresql, redis, graphql, rest apis, rest api, git, github, docker, kubernetes, jenkins, ci cd, linux, data structures, algorithms, dsa, oop, system design, flutter, android, android studio, react native, tailwind, tailwind css, bootstrap, jquery, firebase, asp net, laravel, selenium, jest, cypress, azure, terraform, ansible, microservices, unity, unreal engine, golang"],
  [{ fam: "data", role: null, w: 1 }, "sql, power bi, tableau, data analysis, data visualization, data visualisation, pandas, numpy, statistics, r, spss, sas, looker, looker studio, google data studio, bigquery, dax, power query, etl, data cleaning, data mining, data modelling, data modeling, matplotlib, seaborn, snowflake, databricks, spark, pyspark, hadoop, airflow, dbt, data warehousing, mis, vba, alteryx, qlik, qlikview, metabase, stata"],
  [{ fam: "ai", role: null, w: 1 }, "machine learning, ml, deep learning, tensorflow, pytorch, keras, scikit learn, nlp, computer vision, opencv, generative ai, llm, langchain, llamaindex, hugging face, huggingface, transformers, prompt engineering, rag, openai api, neural networks, xgboost, mlops, yolo, gen ai, vector database, crewai, langgraph"],
  [{ fam: "product", role: null, w: 1 }, "product management, product roadmap, roadmapping, prd, user stories, product strategy, mixpanel, amplitude, product analytics"],
  [{ fam: "design", role: null, w: 1 }, "figma, adobe xd, photoshop, adobe photoshop, illustrator, adobe illustrator, indesign, adobe indesign, coreldraw, ui ux, ui design, ux design, user research, wireframing, prototyping, typography, blender, maya, after effects, adobe after effects, cinema 4d, 3ds max, sketchup, rhino, keyshot, zbrush, procreate, adobe creative suite"],
  [{ fam: "marketing", role: null, w: 1 }, "seo, sem, social media marketing, digital marketing, google ads, meta ads, facebook ads, google analytics, ga4, email marketing, hubspot, mailchimp, marketing, performance marketing, brand management, market research, marketing strategy, affiliate marketing, influencer marketing, semrush, ahrefs, google tag manager, meta business suite, social media management, campaign management, marketing automation"],
  [{ fam: "content", role: null, w: 1 }, "content writing, copywriting, creative writing, blogging, video editing, premiere pro, adobe premiere pro, final cut pro, davinci resolve, capcut, filmora, photography, videography, journalism, proofreading, storytelling, scriptwriting, script writing, technical writing, content creation, content strategy, podcasting, lightroom, content marketing"],
  [{ fam: "sales", role: null, w: 1 }, "sales, business development, lead generation, b2b sales, negotiation, cold calling, crm, zoho crm, client relationship management, customer relationship management, account management, sales strategy, inside sales, prospecting"],
  [{ fam: "finance", role: null, w: 1 }, "financial modelling, financial modeling, financial analysis, valuation, dcf, accounting, tally, tally erp, tally prime, gst, taxation, income tax, auditing, bookkeeping, quickbooks, zoho books, sap fico, budgeting, ifrs, ind as, gaap, equity research, bloomberg, bloomberg terminal, capital iq, investment analysis, portfolio management, stock market, technical analysis, fundamental analysis, derivatives, risk management, credit analysis, financial reporting"],
  [{ fam: "consulting", role: null, w: 1 }, "consulting, management consulting, business strategy, market sizing, problem structuring, sap, salesforce"],
  [{ fam: "ops", role: null, w: 1 }, "supply chain, supply chain management, logistics, procurement, inventory management, operations management, sap mm, six sigma, lean six sigma, vendor management, demand planning, project management, pmp, scrum, ms project"],
  [{ fam: "hr", role: null, w: 1 }, "recruitment, talent acquisition, hr, human resources, payroll, onboarding, employee engagement, hrms, hris, performance management, labour law"],
  [{ fam: "core", role: null, w: 1 }, "autocad, solidworks, catia, ansys, creo, siemens nx, fusion 360, revit, staad pro, etabs, primavera, plc, scada, arduino, raspberry pi, embedded c, verilog, vhdl, systemverilog, pcb design, altium, kicad, proteus, multisim, ltspice, simulink, cnc, gd t, hvac, labview, keil, iot, 8051, microcontrollers, cadence, xilinx, vivado, quartus, ros, comsol, abaqus, hypermesh"],
  [{ fam: "science", role: null, w: 1 }, "lab techniques, pcr, cell culture, western blot, elisa, clinical research, pharmacovigilance, bioinformatics, microbiology, molecular biology, gel electrophoresis, chromatography, hplc, spectroscopy, medical coding, clinical trials, regulatory affairs"],
  [{ fam: "legal", role: null, w: 1 }, "legal research, legal drafting, drafting, contract drafting, litigation, corporate law, westlaw, manupatra, scc online, lexisnexis, legal writing, mooting, moot court, intellectual property, contract review"],
  [{ fam: "education", role: null, w: 1 }, "teaching, tutoring, curriculum design, lesson planning, classroom management, instructional design"],
]);

/** Skills that make a "product designer" a UI/UX designer rather than an industrial one. */
const UX_SKILLS = new Set(["figma", "adobe xd", "ui ux", "ui design", "ux design", "user research", "wireframing", "prototyping"]);

export interface Match { fam: Fam | null; role: string | null; w: number; ux: boolean; phrase: string }

// The pool repeats the same few thousand texts ("Data Analyst"): scan each once per dictionary (bounded).
const scanMemo = new WeakMap<Dict, Map<string, Match[]>>();

/** The phrases a text holds, longest first wherever one starts, left to right; a matched phrase is not read again. */
function scan(text: string, d: Dict): Match[] {
  let memo = scanMemo.get(d);
  if (!memo) scanMemo.set(d, (memo = new Map()));
  const hit = memo.get(text);
  if (hit) return hit;
  const ws = toks(text);
  const out: Match[] = [];
  for (let i = 0; i < ws.length; ) {
    const most = Math.min(d.max.get(ws[i]) ?? 0, ws.length - i);
    let took = 0;
    for (let n = most; n >= 1; n--) {
      const phrase = n === 1 ? ws[i] : ws.slice(i, i + n).join(" ");
      const e = d.map.get(phrase);
      if (e) {
        out.push({ fam: e.fam, role: e.role, w: e.w, ux: !!e.ux, phrase });
        took = n;
        break;
      }
    }
    i += took || 1;
  }
  if (memo.size > 60_000) memo.clear();
  memo.set(text, out);
  return out;
}

/** The families a text names (for the tests and the dry run). */
export const familiesIn = (text: string): Fam[] => [...new Set(scan(text, ROLE_DICT).map((m) => m.fam).filter((f): f is Fam => !!f))];

// Words that say nothing about the role: a role text made only of these is not evidence ("Intern", "Any role").
const JUNK = new Set([
  "intern", "interns", "internship", "internships", "trainee", "fresher", "freshers", "student", "graduate", "role", "roles", "job", "jobs",
  "position", "any", "anything", "open", "not", "sure", "unsure", "yet", "decided", "undecided", "something", "everything", "work", "career",
  "junior", "jr", "senior", "sr", "associate", "executive", "manager", "assistant", "analyst", "lead", "head", "officer", "specialist",
  "entry", "level", "part", "time", "full", "remote", "wfh", "home", "good", "best", "high", "paying", "salary", "company", "companies",
  "na", "n", "none", "nil", "other", "others", "etc", "related", "field", "domain", "mba", "pgdm", "bba", "bcom", "b", "com", "tech", "btech",
  "mtech", "bsc", "msc", "ma", "ba", "final", "year", "first", "second", "third", "fourth", "1st", "2nd", "3rd", "4th", "my", "i", "want",
  "looking", "like", "would", "can", "do", "be", "is", "am", "new", "entry-level", "mt", "management", "general",
]);

/** An Other role from words no family fits, or null when the words say nothing ("Intern", "Any role"). */
function otherRole(text: string): { key: string; label: string } | null {
  const t = toks(text).filter((w) => !JUNK.has(w));
  if (!t.length || t.join("").length < 3) return null;
  const words = t.join(" ").slice(0, 40).trim();
  return { key: `other/${words}`, label: words.charAt(0).toUpperCase() + words.slice(1) };
}

// ------------------------------------------------------------------- placing

export type Src = "wanted" | "adjacent" | "title" | "headline" | "past" | "course" | "skills";

/**
 * TALENT-NET-2 (12 Nov 2026, the coordinator's prod dry run: "the first wanted role must decide"; "an AI-read guess alone
 * isn't enough"): evidence is read in tiers, and the first tier that says something decides; a later tier never
 * outvotes an earlier one. Inside the title tier, the pieces add up by these weights.
 */
export const WEIGHT = { title: 2.5, headline: 2, past: 1.5, pastCap: 3 };
/** The title tier places a student at this much: one title, headline or past role. */
export const PLACE_MIN = 1.2;
/** Skills alone place a family (with "Role not said") at this many of its skills, more than any other family has. */
export const SKILLS_MIN = 4;
/** A broad course (B.Com, statistics, English) places its family only with this many of its skills beside it. */
export const BROAD_COURSE_SKILLS = 2;

export interface Placed { family: Fam; role: string }
export interface Place extends Placed {
  roleName: string;
  /** Up to three more: their other wanted roles first, then what else they named, then our AI's resume read. */
  also: Placed[];
  /** Why they sit here, in plain words. */
  why: string;
}

const clipTo = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const placeMemo = new WeakMap<Candidate, Place>();

/**
 * Where one student sits, in tiers; the first tier that names a family decides it and the role:
 * 1. their own wanted roles: the first one that maps to a family they do not rule out decides family and role;
 * 2. the roles they said on the call they are open to: the first that maps;
 * 3. their title, the call's headline and past roles, added up (title 2.5, headline 2, past roles 1.5 up to 3);
 * 4. the course (then the degree): the first specific one ("Computer Science", "BBA in Strategy"); a broad one (B.Com)
 *    only with two of that family's skills beside it. The role is the course's when it is a profession (a core branch,
 *    law, CA, medicine), else "Role not said";
 * 5. skills alone: four of one family's skills, more than any other family, with "Role not said".
 * In tiers 1 to 3, role words no family fits go to Other roles. The old product's AI read of the resume (its likely
 * roles and archetype headline) never decides; it is a second fit. A family they rule out never places them, not even
 * as a second fit; a specific refused role rules out that role only. Nothing readable, or too little, goes to Not
 * enough data. `skills` are the student's resume skills (model.ts skillsOf). Worked out once per student.
 */
export function placeOf(c: Candidate, skills: { key: string; label: string }[]): Place {
  const hit = placeMemo.get(c);
  if (hit) return hit;
  const p = place(c, skills);
  placeMemo.set(c, p);
  return p;
}

interface Named { family: Fam; role: string | null; text: string; src: Src }

function place(c: Candidate, skills: { key: string; label: string }[]): Place {
  const blocked = new Map<Fam, string>(); // the whole family, and the refusal that said so
  const blockedRole = new Map<string, string>();
  for (const r of c.said?.refuses ?? []) {
    for (const m of scan(r, REFUSE_DICT)) {
      if (m.fam && !m.role && !blocked.has(m.fam)) blocked.set(m.fam, r);
      if (m.role && !blockedRole.has(m.role)) blockedRole.set(m.role, r);
    }
  }
  const hitBlocked = new Set<string>(); // the refusals that took evidence away
  const refused = (fam: Fam, role: string | null): boolean => {
    const why = blocked.get(fam) ?? (role ? blockedRole.get(role) : undefined);
    if (why) hitBlocked.add(why);
    return !!why;
  };
  const hasUx = skills.some((s) => UX_SKILLS.has(s.key));

  /** The families and roles a text names, in order, without what they rule out; `named` is whether it named any. */
  const read = (text: string, src: Src): { hits: Named[]; named: boolean } => {
    const hits: Named[] = [];
    let named = false;
    for (const m of scan(text, ROLE_DICT)) {
      if (!m.fam) continue;
      named = true;
      if (refused(m.fam, m.role)) continue;
      hits.push({ family: m.fam, role: m.ux && hasUx && /product design/.test(m.phrase) ? "design/uiux" : m.role, text, src });
    }
    return { hits, named };
  };

  const guess = c.source === "old"; // the old product's adjacent roles and headline are its AI's read of the resume
  const wanted = c.rolesWanted.map((t) => read(t, "wanted"));
  const open = guess ? [] : c.rolesAdjacent.map((t) => read(t, "adjacent"));
  const saidIn: { text: string; src: Src }[] = [
    ...(c.title ? [{ text: c.title, src: "title" as const }] : []),
    ...(c.headline && !guess ? [{ text: c.headline, src: "headline" as const }] : []),
    ...c.claims.filter((k) => k.kind === "role" && k.text).map((k) => ({ text: k.text, src: "past" as const })),
  ];
  const said = saidIn.map((x) => read(x.text, x.src));
  const guessed = guess ? [...c.rolesAdjacent, ...(c.headline ? [c.headline] : [])].map((t) => read(t, "adjacent")) : [];

  // Second fits, in the order they were said: other wanted roles, open to, title and past roles, then the AI read.
  const seconds = [...wanted, ...open, ...said, ...guessed].flatMap((x) => x.hits);
  const done = (family: Fam, role: string, why: string): Place => {
    const also: Placed[] = [];
    const famSeen = new Set<Fam>([family]);
    const roleSeen = new Set<string>([role]);
    for (const h of seconds) {
      if (also.length >= 3) break;
      if (h.family === family) {
        if (h.role && !roleSeen.has(h.role)) {
          roleSeen.add(h.role);
          also.push({ family, role: h.role });
        }
      } else if (!famSeen.has(h.family)) {
        famSeen.add(h.family);
        also.push({ family: h.family, role: h.role ?? `${h.family}/unsaid` });
      }
    }
    const note = hitBlocked.size ? `. Rules out: ${clipTo([...hitBlocked].join(", "), 60)}` : "";
    return { family, role, roleName: roleLabelOf(role), also, why: `${why}${note}` };
  };
  const whyOf = (h: Named) => {
    const x = clipTo(h.text.trim(), 70);
    return h.src === "wanted" ? `Wanted role: ${x}` : h.src === "adjacent" ? `Open to: ${x}` : h.src === "title" ? `Now: ${x}`
      : h.src === "headline" ? `Headline: ${x}` : `Worked as: ${x}`;
  };
  /** The first text of a tier that no family fits but names a role ("Pastry chef"), as Other roles. */
  const otherIn = (items: { text: string; src: Src; named: boolean }[]): Place | null => {
    for (const x of items) {
      const o = x.named ? null : otherRole(x.text);
      if (o) return done("other", o.key, whyOf({ family: "other", role: o.key, text: x.text, src: x.src }));
    }
    return null;
  };

  // 1 and 2: the first own wanted role that maps, then the first role they are open to.
  const tiers: [typeof wanted, string[], Src][] = [[wanted, c.rolesWanted, "wanted"], [open, guess ? [] : c.rolesAdjacent, "adjacent"]];
  for (const [reads, texts, src] of tiers) {
    const first = reads.find((x) => x.hits.length)?.hits[0];
    if (first) return done(first.family, first.role ?? `${first.family}/unsaid`, whyOf(first));
    const other = otherIn(texts.map((text, i) => ({ text, src, named: reads[i].named })));
    if (other) return other;
  }

  // 3: title, headline and past roles, added up.
  const score = new Map<Fam, { w: number; past: number; best: Named & { w: number }; roles: Map<string, number> }>();
  for (const x of said) {
    for (const fam of new Set(x.hits.map((h) => h.family))) {
      const h = x.hits.find((y) => y.family === fam)!;
      const s = score.get(fam) ?? { w: 0, past: 0, best: { ...h, w: 0 }, roles: new Map() };
      let w = h.src === "title" ? WEIGHT.title : h.src === "headline" ? WEIGHT.headline : WEIGHT.past;
      if (h.src === "past") {
        w = Math.min(w, WEIGHT.pastCap - s.past);
        s.past += w;
      }
      s.w += w;
      if (w > s.best.w) s.best = { ...h, w };
      if (h.role) s.roles.set(h.role, (s.roles.get(h.role) ?? 0) + w);
      score.set(fam, s);
    }
  }
  const top = [...score.entries()].sort((a, b) => b[1].w - a[1].w)[0];
  if (top && top[1].w >= PLACE_MIN) {
    const role = [...top[1].roles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? `${top[0]}/unsaid`;
    return done(top[0], role, whyOf(top[1].best));
  }
  // A title or past role no family fits (never a headline: it is a sentence, not a role).
  const saidOther = otherIn(saidIn.map((x, i) => ({ ...x, named: said[i].named })).filter((x) => x.src !== "headline"));
  if (saidOther) return saidOther;

  // Skills that point to one family, counted per family (a common one like Excel or Python points nowhere).
  const skillsBy = new Map<Fam, string[]>();
  for (const s of skills) {
    const m = scan(s.key, SKILL_DICT).find((x) => x.fam);
    if (!m?.fam || refused(m.fam, null)) continue;
    skillsBy.set(m.fam, [...(skillsBy.get(m.fam) ?? []), s.label]);
  }

  // 4: the course, then the degree: the first specific reading, or a broad one with that family's skills beside it.
  const courses = [c.course, c.degree].filter((x): x is string => !!x);
  let broad: { m: Match; text: string } | null = null;
  for (const text of courses) {
    for (const m of scan(text, COURSE_DICT)) {
      if (!m.fam || refused(m.fam, m.role)) continue;
      if (m.w >= PLACE_MIN) return done(m.fam, m.role ?? `${m.fam}/unsaid`, `Course: ${clipTo(text, 70)}`);
      broad ??= { m, text };
    }
  }
  const near = broad?.m.fam ? skillsBy.get(broad.m.fam) ?? [] : [];
  if (broad?.m.fam && near.length >= BROAD_COURSE_SKILLS) {
    return done(broad.m.fam, `${broad.m.fam}/unsaid`, `Course: ${clipTo(broad.text, 50)}, with skills: ${near.slice(0, 3).join(", ")}`);
  }

  // 5: skills alone.
  const bySkills = [...skillsBy.entries()].sort((a, b) => b[1].length - a[1].length);
  if (bySkills[0] && bySkills[0][1].length >= SKILLS_MIN && bySkills[0][1].length > (bySkills[1]?.[1].length ?? 0)) {
    return done(bySkills[0][0], `${bySkills[0][0]}/unsaid`, `Skills: ${bySkills[0][1].slice(0, 4).join(", ")}`);
  }

  // Not enough data: why, in plain words.
  const note = hitBlocked.size ? `. Rules out: ${clipTo([...hitBlocked].join(", "), 60)}` : "";
  const g = guessed.flatMap((x) => x.hits)[0];
  const little = g ? `only our AI's read of the resume, which guessed ${clipTo(g.text.trim(), 50)}`
    : broad ? `Course: ${clipTo(broad.text, 50)}` : bySkills[0] ? `Skills: ${bySkills[0][1].slice(0, 4).join(", ")}` : null;
  const none = (role: string, why: string): Place => ({ family: "none", role, roleName: NONE_ROLES[role], also: [], why });
  if (little) return none("none/little", `Too little to tell: ${little}${note}`);
  if (hitBlocked.size) return none("none/refused", `Everything we found is in what they rule out${note}`);
  return none("none/empty", "No wanted role, title, course or skill we recognise");
}

// ------------------------------------------------------------------- the network

export interface NetRole { key: string; label: string; n: number }
export interface NetFamily { key: Fam; label: string; short: string; n: number; roles: NetRole[]; moreRoles: number }
export interface Net { n: number; families: NetFamily[] }

const ROLE_CAP = 40;

/**
 * The network for a set of placed students: each family with its count and its roles' counts (every student once, by
 * the primary family and role, so the families add up to n and each family's roles add up to it). Families biggest
 * first, Other roles and Not enough data last; roles biggest first, "Role not said" last. A family keeps its 40
 * biggest roles and counts the rest in moreRoles.
 */
export function netOf(places: Placed[]): Net {
  const fams = new Map<Fam, Map<string, number>>();
  for (const p of places) {
    let m = fams.get(p.family);
    if (!m) fams.set(p.family, (m = new Map()));
    m.set(p.role, (m.get(p.role) ?? 0) + 1);
  }
  const tail = (f: Fam) => (f === "none" ? 2 : f === "other" ? 1 : 0);
  const families: NetFamily[] = [...fams.entries()].map(([key, m]) => {
    const all = [...m.entries()]
      .sort((a, b) => Number(a[0].endsWith("/unsaid")) - Number(b[0].endsWith("/unsaid")) || b[1] - a[1] || a[0].localeCompare(b[0]));
    return {
      key, label: famLabel(key), short: famShort(key), n: all.reduce((s, [, n]) => s + n, 0),
      roles: all.slice(0, ROLE_CAP).map(([k, n]) => ({ key: k, label: roleLabelOf(k), n })), moreRoles: Math.max(0, all.length - ROLE_CAP),
    };
  });
  families.sort((a, b) => tail(a.key) - tail(b.key) || b.n - a.n || FAMILY_ORDER.indexOf(a.key) - FAMILY_ORDER.indexOf(b.key));
  return { n: places.length, families };
}

/** What search matches on besides their own words: the family and the canonical role (not "Role not said"). */
export function canonOf(p: Place): string[] {
  if (p.family === "none" || p.family === "other") return [];
  return p.role.endsWith("/unsaid") ? [famLabel(p.family)] : [famLabel(p.family), p.roleName];
}

/** Does a student sit in the open family and role? Empty means everything. */
export const within = (p: Placed, fam: string, role: string) => (!fam || p.family === fam) && (!role || p.role === role);

/** The top bar's counts for a set of students. */
export interface Counts { n: number; call: number; old: number; optedIn: number; active: number }
export function countsOf(cs: Pick<Candidate, "source" | "optedIn" | "intent">[]): Counts {
  const out: Counts = { n: cs.length, call: 0, old: 0, optedIn: 0, active: 0 };
  for (const c of cs) {
    if (c.source === "call") out.call++;
    else out.old++;
    if (c.optedIn) out.optedIn++;
    if (c.intent === "active") out.active++;
  }
  return out;
}
