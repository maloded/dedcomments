/**
 * Dev utility — bulk-creates root comments through the real `createComment`
 * GraphQL mutation (CAPTCHA included), so the frontend has enough data to
 * exercise pagination / sorting by hand or for a demo recording.
 *
 * CAPTCHA is solved the same way the e2e suite does it
 * (`backend/test/comments.e2e-spec.ts` → `solvedCaptcha()`): request a
 * challenge, then read the expected answer straight out of Redis under
 * `captcha:<token>`. Only works against a dev/local stack you control.
 *
 *   npm run seed:comments -- [count]        # default 35
 *   node scripts/seed-comments.mjs 60
 *
 * `createComment` is rate-limited to 10/min per IP; the script backs off and
 * resumes automatically, so a large count just takes a while.
 *
 * Env:
 *   GRAPHQL_URL   default http://localhost:4000/graphql
 *   REDIS_URL     default redis://localhost:6379
 */
import Redis from 'ioredis';

const GRAPHQL_URL = process.env.GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const COUNT = Number(process.argv[2] ?? 35);

const redis = new Redis(REDIS_URL);

// Deliberately mixed-case + non-alphabetical insertion order so that sorting
// by username (case-insensitively) visibly reorders the list and crosses the
// 25-per-page boundary.
const NAMES = [
  'Zed', 'amy', 'Bob', 'charlie', 'Delta', 'echo', 'Foxtrot', 'golf',
  'Hotel', 'india', 'Juliet', 'kilo', 'Lima', 'mike', 'November', 'oscar',
  'Papa', 'quebec', 'Romeo', 'sierra', 'Tango', 'uniform', 'Victor', 'whiskey',
  'Xray', 'yankee', 'Zulu', 'aaron', 'Brenda', 'carlos', 'Diana', 'ethan',
  'Fiona', 'george', 'Hannah', 'ian', 'Jules', 'karen', 'Leo', 'mona',
];

const BODIES = [
  'Seeded comment for pagination testing.',
  'Another root comment so the list spills onto a second page.',
  'Testing <strong>sort order</strong> across the page boundary.',
  'Filler text with a bit of <i>emphasis</i>.',
  'Nothing interesting here, just volume.',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    // `createComment` is rate-limited (10/min per IP). Back off and let the
    // caller retry rather than aborting a long seed run.
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

async function createRoot(i) {
  const { token, answer } = await solvedCaptcha();
  const username = NAMES[i % NAMES.length] + (i >= NAMES.length ? String(i) : '');
  await gql(
    `mutation ($input: CreateCommentInput!) { createComment(input: $input) { id } }`,
    {
      input: {
        username,
        email: `${username.toLowerCase()}@example.com`,
        text: `${BODIES[i % BODIES.length]} (#${i + 1})`,
        captchaToken: token,
        captchaAnswer: answer,
      },
    },
  );
  return username;
}

const created = [];
for (let i = 0; i < COUNT; i++) {
  for (;;) {
    try {
      created.push(await createRoot(i));
      break;
    } catch (err) {
      if (!err.throttled) throw err;
      process.stdout.write(`\r  rate-limited at ${created.length}/${COUNT} — waiting 60s…   `);
      await sleep(60_000);
    }
  }
  process.stdout.write(`\r  created ${i + 1}/${COUNT}                         `);
  await sleep(300); // gentle spacing; the 60s backoff above handles the real limit
}
process.stdout.write('\n');
console.log(`done — ${created.length} root comments (usernames: ${created.slice(0, 6).join(', ')}, …)`);
await redis.quit();
