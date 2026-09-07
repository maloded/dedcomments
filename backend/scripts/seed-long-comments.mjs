/**
 * Additive demo-data script — posts a small batch of genuinely long,
 * multi-paragraph root comments and replies through the real
 * `createComment` mutation, on top of whatever's already there. Purely
 * additive: never truncates, never touches existing rows.
 *
 * Written as a follow-up to `seed-comments.mjs` (Step 21's curated dataset)
 * rather than a mode of it — that script's job is "build the whole curated
 * set from an empty table"; this one's job is "add a handful more, once,
 * on top of real existing data", which doesn't share much beyond the same
 * CAPTCHA-solving/GraphQL/throttle-backoff plumbing (copied here rather
 * than imported — small enough not to be worth a shared module for a
 * one-off script).
 *
 * Same run mechanics as seed-comments.mjs: run *inside* the backend
 * container (needs Redis over the internal Docker network), pointed at the
 * public GraphQL endpoint so writes go through the real HTTP path.
 *
 *   node scripts/seed-long-comments.mjs
 *
 * Env:
 *   GRAPHQL_URL   default http://localhost:4000/graphql
 *   REDIS_URL     default redis://localhost:6379
 */
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const GRAPHQL_URL = process.env.GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const redis = new Redis(REDIS_URL);
const prisma = new PrismaClient();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    if (JSON.stringify(json.errors).includes('THROTTLER')) {
      const err = new Error('THROTTLED');
      err.throttled = true;
      throw err;
    }
    throw new Error(JSON.stringify(json.errors));
  }
  return json.data;
}

async function solvedCaptcha() {
  const { captchaChallenge } = await gql('{ captchaChallenge { token } }');
  const answer = (await redis.get(`captcha:${captchaChallenge.token}`)) ?? '';
  return { token: captchaChallenge.token, answer };
}

const CREATE_COMMENT = `
  mutation ($input: CreateCommentInput!) { createComment(input: $input) { id } }
`;

async function createComment({ username, email, homepage, text, parentId }) {
  for (;;) {
    try {
      const { token, answer } = await solvedCaptcha();
      const data = await gql(CREATE_COMMENT, {
        input: { username, email, homepage, text, parentId, captchaToken: token, captchaAnswer: answer },
      });
      return data.createComment.id;
    } catch (err) {
      if (!err.throttled) throw err;
      process.stdout.write(`\r  rate-limited — waiting 60s…                              `);
      await sleep(60_000);
    }
  }
}

// Alphanumeric only (USERNAME_REGEX), distinct from Step 21's identity pool
// so these don't collide with (or get mistaken for) the existing dataset.
const IDENTITIES = [
  { username: 'MarcusWebb', email: 'marcuswebb@gmail.com', homepage: 'https://marcuswebb.dev' },
  { username: 'PriyaKapoor', email: 'priyakapoor@outlook.com' },
  { username: 'TheoLindgren', email: 'theolindgren@icloud.com', homepage: 'https://github.com/theolindgren' },
  { username: 'RosaOrtiz', email: 'rosaortiz@yahoo.com' },
  { username: 'DevonMarsh', email: 'devonmarsh@hey.com' },
  { username: 'AishaBello', email: 'aishabello@protonmail.com', homepage: 'https://aishabello.dev' },
  { username: 'CalebStone', email: 'calebstone@gmail.com' },
  { username: 'WillaFrost', email: 'willafrost@outlook.com' },
  { username: 'NateOkafor', email: 'nateokafor@icloud.com' },
  { username: 'ElenaVance', email: 'elenavance@yahoo.com' },
  { username: 'RubenSalas', email: 'rubensalas@hey.com' },
];

// ─── Long, multi-paragraph root comments ───────────────────────────────────
// \n\n renders as a real paragraph break (both RootCommentsTable's
// .commentText and CommentThreadNode's .text are `white-space: pre-wrap`).
// Two of these embed an allowed tag naturally partway through, rather than
// as the whole comment (a more realistic demonstration than a single short
// tagged sentence).

const ROOTS = [
  {
    identity: IDENTITIES[0],
    text:
      "I've been going back and forth on this for weeks now, and I think I finally landed somewhere I'm comfortable with. The short version is that the tradeoffs here are more nuanced than either side of the debate usually admits — there's real value in both approaches depending on what you're actually optimizing for.\n\nWhat finally convinced me was watching how differently two teams I know handled basically the same problem. One went all-in on the newer approach and hit a wall around month three; the other stuck with something more conservative and is still shipping steadily a year later. Neither is universally right, but context matters a lot more than the loudest opinions online would have you believe.",
  },
  {
    identity: IDENTITIES[1],
    text:
      "Finally got around to profiling the slow part of our build and the results were honestly embarrassing. Turns out almost all of the time was going into a single recursive function that nobody had touched in over a year — nobody had noticed because it worked fine on small inputs and only fell over once the dataset grew past a certain size.\n\nThe fix ended up being surprisingly small: swapping the naive recursion for <code>useMemo</code>-backed memoization cut the build time by more than half. It's a good reminder that the biggest wins are rarely in the code you'd expect — they're hiding in whatever nobody has looked at recently.",
  },
  {
    identity: IDENTITIES[2],
    text:
      'Spent the whole weekend rebuilding my home network from scratch after finally admitting the old setup was held together with hope and duct tape. Ripped out three separate access points that were all fighting each other and replaced everything with a proper mesh setup.\n\nIf anyone\'s considering doing the same, I\'d genuinely recommend reading through <a href="https://en.wikipedia.org/wiki/Mesh_networking" title="Mesh networking overview">this overview</a> before buying anything — I wasted money on hardware I didn\'t actually need because I didn\'t understand how the topology worked going in. Wish I\'d done that first.',
  },
  {
    identity: IDENTITIES[3],
    text:
      "Honestly didn't expect to feel this strongly about it, but after using both for an extended period I think the difference comes down to something people rarely talk about: how the tool behaves when things go wrong, not when everything's working as expected. Anyone can look good in the happy path. It's the failure modes, the confusing error messages, the moments where you're debugging late at night trying to figure out why something that should just work doesn't — that's where the real gap shows up, and it's not close.",
  },
  {
    identity: IDENTITIES[4],
    text:
      "Took me way longer than I'd like to admit to actually sit down and read the whole thing cover to cover instead of skimming for the parts I thought I needed. Ended up finding at least three things that would've saved me a lot of pain months ago if I'd just read it properly the first time. Lesson learned, I guess — sometimes the boring documentation really is worth the hour it takes.",
  },
  {
    identity: IDENTITIES[5],
    text:
      'We tried something a little unconventional for the last sprint and I wanted to write up how it went in case anyone else is considering it. Instead of the usual planning meeting, we spent the first morning just pairing on the riskiest unknown before committing to any estimates at all.\n\nIt felt slow at first and a couple of people were skeptical, but by the time we actually sat down to plan we had real information instead of guesses. Estimates ended up being noticeably more accurate than usual, and nothing blew up two weeks in the way it normally does.',
  },
  {
    identity: IDENTITIES[6],
    text:
      "Went into this expecting to be disappointed, honestly, since the first one didn't quite land for me. But this was <strong>genuinely</strong> a different experience — the pacing problems from before are just gone, and the character work finally gets the space it needed all along.\n\nIt's not <i>perfect</i>, there's still a stretch in the middle that drags a little, but it's the kind of thing I'd happily sit through again just for the last twenty minutes alone.",
  },
];

// ─── Replies to some of the above (a few, at least two multi-paragraph) ────

const REPLIES = [
  {
    identity: IDENTITIES[7],
    rootIndex: 0,
    text:
      "This matches my experience almost exactly. I think the part that took me longest to internalize is that 'it depends' isn't a cop-out answer — it's genuinely the correct one most of the time, even though it's deeply unsatisfying to hear when you just want someone to tell you what to do.\n\nWhat helped me was writing down the actual constraints before picking a direction, instead of picking a direction and then justifying it afterward. Sounds obvious written out like that, but I definitely wasn't doing it before.",
  },
  {
    identity: IDENTITIES[8],
    rootIndex: 1,
    text:
      'Had almost the exact same experience a few months back — turned out to be a nested loop nobody remembered writing. Wrapping the expensive call in <code>useMemo</code> fixed it for us too, though we also ended up caching the result at a higher level once we realized how often it was being called with the same input.',
  },
  {
    identity: IDENTITIES[9],
    rootIndex: 2,
    text:
      'Went through this exact pain last year. Mesh networking genuinely does solve the problem, just wish someone had told me to measure the house first instead of guessing at coverage.',
  },
  {
    identity: IDENTITIES[10],
    rootIndex: 5,
    text:
      "Really interesting approach — we've been stuck in the 'estimate first, discover the unknowns later' trap for a while and it's caused exactly the kind of mid-sprint chaos you're describing. Might actually try this on the next one.\n\nOne thing I'm curious about: how did you decide which unknown was the riskiest one to spend the morning on? That seems like it could easily turn into its own multi-hour debate if the team doesn't already agree on what's actually risky.",
  },
];

// ─── Timestamp spread ───────────────────────────────────────────────────────
// These are genuinely new/"just added" comments, so they stay recent —
// spread across the last ~3 days rather than all landing in the same
// minute, for a naturally staggered look rather than a backdated one.

const HOUR_MS = 60 * 60 * 1000;
const now = Date.now();

function recentDate(hoursAgoMax) {
  return new Date(now - Math.random() * hoursAgoMax * HOUR_MS);
}

async function run() {
  const idDateMap = new Map();
  const rootIds = [];

  console.log(`Creating ${ROOTS.length} long root comments…`);
  for (let i = 0; i < ROOTS.length; i++) {
    const { identity, text } = ROOTS[i];
    const id = await createComment({ ...identity, text });
    idDateMap.set(id, recentDate(72));
    rootIds.push(id);
    process.stdout.write(`\r  roots: ${i + 1}/${ROOTS.length}                         `);
    await sleep(300);
  }
  process.stdout.write('\n');

  console.log(`Creating ${REPLIES.length} long replies…`);
  for (let i = 0; i < REPLIES.length; i++) {
    const { identity, rootIndex, text } = REPLIES[i];
    const parentId = rootIds[rootIndex];
    const parentDate = idDateMap.get(parentId);
    const id = await createComment({ ...identity, text, parentId });
    // A reply lands some time after its (already-recent) parent, still
    // capped at "now".
    const replyOffsetMs = Math.random() * 12 * HOUR_MS;
    const d = new Date(parentDate.getTime() + replyOffsetMs);
    idDateMap.set(id, d.getTime() > now ? new Date(now - 30_000) : d);
    process.stdout.write(`\r  replies: ${i + 1}/${REPLIES.length}                         `);
    await sleep(300);
  }
  process.stdout.write('\n');

  console.log('Backdating timestamps…');
  const updates = Array.from(idDateMap.entries());
  for (const [id, date] of updates) {
    await prisma.comment.update({ where: { id }, data: { createdAt: date } });
  }

  console.log('\n─── Summary ─────────────────────────────────────────');
  console.log(`Long root comments: ${ROOTS.length}`);
  console.log(`Long replies:       ${REPLIES.length}`);
  console.log(`Total added:        ${ROOTS.length + REPLIES.length}`);
  console.log('────────────────────────────────────────────────────');
}

try {
  await run();
} finally {
  await redis.quit();
  await prisma.$disconnect();
}
