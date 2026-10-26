// 027 FR-10 / AC-10: the seeded acceptance corpus for the facts check. Each case
// states its sources, the texts that are checked and the EXACT set of
// (where, key) values the check must flag: no extra, none missed. Written before
// the patterns were tuned (T3); an expectation is never loosened to make a pattern
// pass without a note in reports/T3.md.
//
// Keys: tel:<digits>  date:<month>-<day>[-<year>]  date:n:<a>-<b>-<c> (numeric,
// as written)  time:<minutes since midnight>  cur:<amount>  pct:<amount>
// num:<amount>.

export type CorpusWhere = 'headline' | 'INSTAGRAM' | 'LINKEDIN'

export interface CorpusCase {
  name: string
  sources: string[]
  texts: Array<{ where: CorpusWhere; text: string }>
  expected: Array<{ where: CorpusWhere; key: string }>
}

const H = 'headline' as const
const IG = 'INSTAGRAM' as const
const LI = 'LINKEDIN' as const

export const FACTS_CORPUS: CorpusCase[] = [
  // ── tel ────────────────────────────────────────────────────────────────
  {
    name: 'tel: an invented contiguous number in the headline',
    sources: ['A launch post for the new academy'],
    texts: [{ where: H, text: 'Call 0768030944 now' }],
    expected: [{ where: H, key: 'tel:0768030944' }],
  },
  {
    name: 'tel: the same number in another format is supported',
    sources: ['Contact us on 076-8030-944 for details'],
    texts: [{ where: IG, text: 'Call 076 803 0944 today' }],
    expected: [],
  },
  {
    name: 'tel: an international number absent from the sources',
    sources: ['No contact details in this brief'],
    texts: [{ where: IG, text: 'Call +94 76 803 0944' }],
    expected: [{ where: IG, key: 'tel:94768030944' }],
  },

  // ── date ───────────────────────────────────────────────────────────────
  {
    name: 'date: an invented dated deadline in LinkedIn',
    sources: ['Applications are open'],
    texts: [{ where: LI, text: 'Join us on 15 March 2027 in Colombo' }],
    expected: [{ where: LI, key: 'date:3-15-2027' }],
  },
  {
    name: 'date: day-month and month-day spellings are one value',
    sources: ['Event on March 15, 2027'],
    texts: [{ where: LI, text: 'Save the date: 15th of March 2027' }],
    expected: [],
  },
  {
    name: 'date: a different year in the source does not support it',
    sources: ['The last intake was 15 March 2026'],
    texts: [{ where: IG, text: 'Next intake 15 March 2027' }],
    expected: [{ where: IG, key: 'date:3-15-2027' }],
  },
  {
    name: 'date: a source date with no year supports a dated caption',
    sources: ['We start on 15 March'],
    texts: [{ where: IG, text: 'We start on 15 March 2027' }],
    expected: [],
  },
  {
    name: 'date: May with a day is a date',
    sources: ['Open call'],
    texts: [{ where: H, text: 'Applications close May 15' }],
    expected: [{ where: H, key: 'date:5-15' }],
  },
  {
    name: 'date: May as a verb is not a date',
    sources: ['Open call'],
    texts: [{ where: IG, text: 'You may attend. Seats may fill fast. We may add more.' }],
    expected: [],
  },
  {
    name: 'date: a numeric date written the other way flags (ISO vs day-first)',
    sources: ['Deadline 15/03/2027'],
    texts: [{ where: LI, text: 'Deadline 2027-03-15' }],
    expected: [{ where: LI, key: 'date:n:2027-3-15' }],
  },
  {
    name: 'date: a numeric date written the other way flags (month-first vs day-first)',
    sources: ['Deadline 15/03/2027'],
    texts: [{ where: H, text: 'Deadline 03/15/2027' }],
    expected: [{ where: H, key: 'date:n:3-15-2027' }],
  },
  {
    name: 'date: the same numeric date with a leading zero is supported',
    sources: ['Deadline 15/3/2027'],
    texts: [{ where: IG, text: 'Deadline 15/03/2027' }],
    expected: [],
  },

  // ── time ───────────────────────────────────────────────────────────────
  {
    name: 'time: an invented 12-hour time',
    sources: ['An evening event'],
    texts: [{ where: IG, text: 'Doors open at 6:30pm' }],
    expected: [{ where: IG, key: 'time:1110' }],
  },
  {
    name: 'time: a 24-hour source supports a 12-hour caption',
    sources: ['Starts 18:30 sharp'],
    texts: [{ where: LI, text: 'Doors open at 6:30 pm' }],
    expected: [],
  },
  {
    name: 'time: a bare hour with pm',
    sources: ['An evening event'],
    texts: [{ where: H, text: 'Join at 5 pm' }],
    expected: [{ where: H, key: 'time:1020' }],
  },

  // ── currency ───────────────────────────────────────────────────────────
  {
    name: 'currency: an invented price in the headline',
    sources: ['Our new course'],
    texts: [{ where: H, text: 'From $49' }],
    expected: [{ where: H, key: 'cur:49' }],
  },
  {
    name: 'currency: Rs and a code are the same value',
    sources: ['Fee: LKR 5000'],
    texts: [{ where: LI, text: 'Fee: Rs. 5,000' }],
    expected: [],
  },
  {
    name: 'currency: a trailing code and a word match a symbol source',
    sources: ['Price $50'],
    texts: [{ where: IG, text: 'Just 50 USD, or 50 dollars' }],
    expected: [],
  },
  {
    name: 'currency: kind-strict, "49 days" does not support "$49"',
    sources: ['A 49 days programme'],
    texts: [{ where: IG, text: 'Only $49' }],
    expected: [{ where: IG, key: 'cur:49' }],
  },

  // ── pct ────────────────────────────────────────────────────────────────
  {
    name: 'pct: an invented discount',
    sources: ['A new offer'],
    texts: [{ where: IG, text: 'Save 35% off today' }],
    expected: [{ where: IG, key: 'pct:35' }],
  },
  {
    name: 'pct: kind-strict, "35 days" does not support "35%"',
    sources: ['A 35 days programme'],
    texts: [{ where: LI, text: 'Save 35% now' }],
    expected: [{ where: LI, key: 'pct:35' }],
  },
  {
    name: 'pct: "percent" in the source supports "%"',
    sources: ['Get 35 percent off'],
    texts: [{ where: IG, text: '35% off' }],
    expected: [],
  },

  // ── num ────────────────────────────────────────────────────────────────
  {
    name: 'num: an invented count with a thousands comma',
    sources: ['A community event'],
    texts: [{ where: LI, text: 'Join 1,250 customers' }],
    expected: [{ where: LI, key: 'num:1250' }],
  },
  {
    name: 'num: a currency source widens to the same bare number',
    sources: ['Tickets cost $1,250'],
    texts: [{ where: LI, text: '1,250 reasons to come' }],
    expected: [],
  },
  {
    name: 'num: thousands commas and decimals are canonical',
    sources: ['Rated 4.50 out of 5 by 1,250 learners'],
    texts: [{ where: IG, text: '4.5 stars from 1250 learners' }],
    expected: [],
  },
  {
    name: 'num: k, m, bn and words multiply',
    sources: ['2500 learners'],
    texts: [{ where: IG, text: '2.5k learners, 1.2m users, 5 million views and 2bn reach' }],
    expected: [
      { where: IG, key: 'num:1200000' },
      { where: IG, key: 'num:5000000' },
      { where: IG, key: 'num:2000000000' },
    ],
  },
  {
    name: 'num: an ordinal above 10 is a number, "1st" is exempt',
    sources: ['Our anniversary'],
    texts: [{ where: H, text: '1st place and our 100th event' }],
    expected: [{ where: H, key: 'num:100' }],
  },
  {
    name: 'num: a year is flagged when no source states it',
    sources: ['Applications are open'],
    texts: [{ where: IG, text: 'Join us in 2027' }],
    expected: [{ where: IG, key: 'num:2027' }],
  },
  {
    name: 'num: the day of a source date does not support a bare number',
    sources: ['Applications close 20 June'],
    texts: [{ where: IG, text: 'Only 20 seats' }],
    expected: [{ where: IG, key: 'num:20' }],
  },
  {
    name: 'num: the year of a source date supports the bare year',
    sources: ['The intake starts 15 March 2027'],
    texts: [{ where: IG, text: 'Join us in 2027' }],
    expected: [],
  },
  {
    name: 'num: a year stated in a source is supported',
    sources: ['Intake for 2027'],
    texts: [{ where: IG, text: 'Join us in 2027' }],
    expected: [],
  },

  // ── sources: each place a stated value can live ───────────────────────
  {
    name: 'sources: supported by the brief topic',
    sources: ['Early bird $49 for the first week', '', '', '', ''],
    texts: [{ where: IG, text: 'Early bird price: $49' }],
    expected: [],
  },
  {
    name: 'sources: supported by the brief description',
    sources: ['', 'Doors open 18:00, ticket $20, 2027', '', '', ''],
    texts: [{ where: LI, text: 'Tickets $20' }],
    expected: [],
  },
  {
    name: 'sources: supported by the campaign briefing',
    sources: ['', '', 'Campaign runs until 30 June 2027 with a 20% launch offer', '', ''],
    texts: [{ where: IG, text: 'Offer ends 30 June 2027, 20% off' }],
    expected: [],
  },
  {
    name: 'sources: supported by the brand kit voice text',
    sources: ['', '', '', 'Always sign off with 076-8030-944', ''],
    texts: [{ where: IG, text: 'Call 0768030944' }],
    expected: [],
  },
  {
    name: 'sources: supported by a campaign document',
    sources: ['', '', '', '', 'Contact: heartsacademy@bistecglobal.com or +94 76 803 0944'],
    texts: [{ where: LI, text: 'Call +94 76 803 0944' }],
    expected: [],
  },

  // ── exemptions ─────────────────────────────────────────────────────────
  {
    name: 'exempt: small bare integers 0 to 10',
    sources: ['A tips post'],
    texts: [{ where: IG, text: '3 tips in 2 minutes, 10 steps, 0 stress, 9 years of experience' }],
    expected: [],
  },
  {
    name: 'exempt: 24/7, 24x7 and 24/365',
    sources: ['Support post'],
    texts: [{ where: IG, text: 'Support 24/7, 24x7 and 24/365' }],
    expected: [],
  },
  {
    name: 'exempt: aspect-ratio and size tokens',
    sources: ['Template post'],
    texts: [{ where: LI, text: 'Export 1:1, 4:5, 3:4, 9:16 and 16:9 at 1080x1920 and 1080×1080' }],
    expected: [],
  },
  {
    name: 'exempt: list markers at the start of a line',
    sources: ['A list post'],
    texts: [{ where: IG, text: '1. First\n2) Second\n(3) Third\n12. Twelfth\n  14) Fourteenth' }],
    expected: [],
  },
  {
    name: 'exempt: Step, Tip and Part numbers',
    sources: ['A guide'],
    texts: [{ where: LI, text: 'Step 15, Tip 20 and Part 30 of the guide' }],
    expected: [],
  },
  {
    name: 'exempt: a year in a copyright line',
    sources: ['A footer'],
    texts: [
      { where: H, text: '© 2026 Bistec Global' },
      { where: IG, text: 'Copyright 2025. (c) 2024' },
    ],
    expected: [],
  },
  {
    name: 'exempt: a number attached to letters, a hashtag, a URL, an email and a handle',
    sources: ['Social post'],
    texts: [
      {
        where: IG,
        text:
          'Q3 results, COVID19 and #Top10 #2027goals. See https://bistec.com/2027/launch?id=12345 ' +
          'or mail a1234567@bistec.com and follow @bistec2027',
      },
    ],
    expected: [],
  },

  // ── digits in other scripts ────────────────────────────────────────────
  {
    name: 'digits: Sinhala Lith digits are flagged as ASCII',
    sources: ['A Sinhala post'],
    texts: [{ where: IG, text: '෧෫෦ ශිෂ්‍යයන්' }],
    expected: [{ where: IG, key: 'num:150' }],
  },
  {
    name: 'digits: Sinhala Lith digits match an ASCII source',
    sources: ['150 students enrolled'],
    texts: [{ where: IG, text: '෧෫෦ ශිෂ්‍යයන්' }],
    expected: [],
  },
  {
    name: 'digits: Arabic-Indic and extended Arabic-Indic digits',
    sources: ['An Arabic post'],
    texts: [{ where: LI, text: '٣٥٠ طالب و ۴۵۰ خريج' }],
    expected: [
      { where: LI, key: 'num:350' },
      { where: LI, key: 'num:450' },
    ],
  },
  {
    name: 'digits: Devanagari and Tamil digits',
    sources: ['A South Asian post'],
    texts: [{ where: IG, text: '२५० छात्र, ௩௦௦ மாணவர்கள்' }],
    expected: [
      { where: IG, key: 'num:250' },
      { where: IG, key: 'num:300' },
    ],
  },
  {
    name: 'digits: fullwidth digits flag and match an ASCII source',
    sources: ['1234 attendees'],
    texts: [
      { where: IG, text: '１２３４ attendees' },
      { where: LI, text: '５０% off' },
    ],
    expected: [{ where: LI, key: 'pct:50' }],
  },

  // ── locations, dedupe, ordering ────────────────────────────────────────
  {
    name: 'dedupe: the same value twice in a text is one flag; in two texts is two',
    sources: ['A post'],
    texts: [
      { where: H, text: 'Only $49' },
      { where: IG, text: 'Pay $49 now, yes $49' },
      { where: LI, text: 'Fees $50' },
    ],
    expected: [
      { where: H, key: 'cur:49' },
      { where: IG, key: 'cur:49' },
      { where: LI, key: 'cur:50' },
    ],
  },
  {
    name: 'mixed: one of each family across the headline and both captions',
    sources: ['A launch post'],
    texts: [
      { where: H, text: 'Launch on 30 March 2027 at 6:30pm' },
      { where: IG, text: 'Call +94 76 803 0944 or pay $49 (35% off) for 1,250 seats' },
      { where: LI, text: 'Nothing numeric here, just 3 reasons' },
    ],
    expected: [
      { where: H, key: 'date:3-30-2027' },
      { where: H, key: 'time:1110' },
      { where: IG, key: 'tel:94768030944' },
      { where: IG, key: 'cur:49' },
      { where: IG, key: 'pct:35' },
      { where: IG, key: 'num:1250' },
    ],
  },
  {
    name: 'empty: no sources and empty texts are clear',
    sources: [],
    texts: [
      { where: H, text: '' },
      { where: IG, text: '' },
    ],
    expected: [],
  },
]
