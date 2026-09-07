/**
 * Demo-data seed script — builds a curated, realistic dataset through the
 * real `createComment`/`uploadAttachment` GraphQL mutations (CAPTCHA
 * included), so the deployed app has something worth recording a demo video
 * against: varied root comments, a mix of shallow reply threads, at least
 * one deep chain (to exercise "Continue this thread" re-rooting past
 * `MAX_VISUAL_DEPTH`), image + text-file attachments, and a few
 * HTML-tagged replies.
 *
 * CAPTCHA is solved the same way the e2e suite does it
 * (`backend/test/comments.e2e-spec.ts` → `solvedCaptcha()`): request a
 * challenge, then read the expected answer straight out of Redis under
 * `captcha:<token>`. Only works against a stack whose Redis you can reach
 * directly — a local dev stack, or (this script's actual purpose) run
 * *inside* the backend container on the VPS, which already has
 * `REDIS_URL` pointed at the production Redis over the internal Docker
 * network, while `GRAPHQL_URL` can point at the public
 * `https://comments-api.dedstream.in.ua/graphql` endpoint so writes go
 * through the real HTTP path (nginx, rate limiting, etc.), not an internal
 * shortcut.
 *
 * `createComment` is rate-limited to 10/min per IP (and there's a global
 * 120/min cap covering every query/mutation, `captchaChallenge` included);
 * the script backs off on ANY throttled call and resumes automatically, so
 * the full run just takes a while (budget roughly 10-15 minutes for the
 * default dataset).
 *
 * Timestamps: `createComment` has no way to set `createdAt` (server-assigns
 * `now()`), so realistic "spread over the last few weeks" dates are applied
 * in a second pass after creation, via a direct Prisma `UPDATE` — this is
 * why the script needs `DATABASE_URL` too (already set correctly in the
 * container's own environment, no override needed there).
 *
 *   node scripts/seed-comments.mjs
 *
 * Env:
 *   GRAPHQL_URL      default http://localhost:4000/graphql
 *   REDIS_URL        default redis://localhost:6379
 *   DEMO_IMAGES_DIR  default <repo root>/demo-images
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GRAPHQL_URL = process.env.GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const IMAGES_DIR = process.env.DEMO_IMAGES_DIR ?? path.join(__dirname, '../../demo-images');

const redis = new Redis(REDIS_URL);
const prisma = new PrismaClient();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── GraphQL plumbing ───────────────────────────────────────────────────────

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

const UPLOAD_ATTACHMENT = `
  mutation ($input: UploadAttachmentInput!) { uploadAttachment(input: $input) { id processedAt type } }
`;

/** Posts one comment (root or reply), retrying on THROTTLER with the
 * standard 60s backoff. Returns the new comment's id. */
async function createComment({ username, email, homepage, text, parentId, attachmentId }) {
  for (;;) {
    try {
      const { token, answer } = await solvedCaptcha();
      const data = await gql(CREATE_COMMENT, {
        input: {
          username,
          email,
          homepage,
          text,
          parentId,
          attachmentId,
          captchaToken: token,
          captchaAnswer: answer,
        },
      });
      return data.createComment.id;
    } catch (err) {
      if (!err.throttled) throw err;
      process.stdout.write(`\r  rate-limited — waiting 60s…                              `);
      await sleep(60_000);
    }
  }
}

const IMAGE_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' };

/** Uploads one image from DEMO_IMAGES_DIR, then polls `attachment(id)`
 * briefly for `processedAt` — mirrors the frontend's own polling, mainly so
 * a resize failure surfaces here instead of silently reaching the demo. */
async function uploadImage(filename) {
  const buffer = readFileSync(path.join(IMAGES_DIR, filename));
  const ext = path.extname(filename).toLowerCase();
  const { uploadAttachment } = await gql(UPLOAD_ATTACHMENT, {
    input: { filename, mimeType: IMAGE_MIME[ext], data: buffer.toString('base64') },
  });

  for (let i = 0; i < 10 && !uploadAttachment.processedAt; i++) {
    await sleep(1500);
    const { attachment } = await gql(`query($id: ID!){ attachment(id:$id){ processedAt } }`, {
      id: uploadAttachment.id,
    });
    if (attachment.processedAt) break;
  }
  return uploadAttachment.id;
}

async function uploadText(filename, content) {
  const { uploadAttachment } = await gql(UPLOAD_ATTACHMENT, {
    input: { filename, mimeType: 'text/plain', data: Buffer.from(content, 'utf8').toString('base64') },
  });
  return uploadAttachment.id;
}

// ─── Demo identities ────────────────────────────────────────────────────────
// Alphanumeric only (USERNAME_REGEX = /^[a-zA-Z0-9]+$/ — no underscores/dots/
// spaces), but written to read as real handles, not test ids.

const USERNAMES = [
  'AlexMorgan', 'SarahChen', 'MikeTorres', 'JuliaReyes', 'BenCarter',
  'EmmaClarke', 'RyanCross', 'ZoeMartin', 'OliviaBrooks', 'MaxPower',
  'LunaSky', 'JakeSullivan', 'GraceHopper99', 'TomHardy21', 'NoraFields',
  'LiamParker', 'AvaMitchell', 'EthanBlake', 'MiaWatson', 'NoahRivera',
  'IsabelGray', 'LucasBennett', 'ChloeWard', 'DanielFoster', 'HannahShaw',
  'JacksonLee', 'VictoriaKing', 'SamuelDrake', 'OscarWinters', 'NinaHayes',
  'TylerBrooks', 'AmeliaStone', 'DerekJones7', 'FionaCollins', 'GavinReed',
  'HarperLane', 'IvyThompson', 'JasperNolan', 'KateWinslow', 'PixelNova',
];

const DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'protonmail.com', 'hey.com'];

function identity(i) {
  const username = USERNAMES[i % USERNAMES.length];
  const email = `${username.toLowerCase()}@${DOMAINS[i % DOMAINS.length]}`;
  const homepage =
    i % 3 === 0
      ? `https://github.com/${username.toLowerCase()}`
      : i % 3 === 1
        ? `https://${username.toLowerCase()}.dev`
        : undefined;
  return { username, email, homepage };
}

// ─── Content pools ──────────────────────────────────────────────────────────

const ROOT_TEXTS = [
  "Just switched to a mechanical keyboard after years of laptop typing and I don't know how I lived without it.",
  'Finally finished the whole first season this weekend — the pacing in the last two episodes was incredible.',
  "Does anyone else batch-cook on Sundays? It's saved me so much time during the week.",
  'The new update feels noticeably snappier. Whatever they changed under the hood, keep it up.',
  "Been running for three months straight now and my 5k time finally dropped under 25 minutes.",
  'Read this three times and I still think the middle section drags a bit, but the ending redeems it.',
  "Moved my whole setup to a standing desk. Knees are happier, focus is better, highly recommend.",
  'Anyone have a good recommendation for a lightweight note-taking app that syncs across devices?',
  "The soundtrack alone is worth the price of admission. Been listening to it on loop all week.",
  'Tried the new recipe last night — cut the salt in half and it was still plenty seasoned.',
  "Six months into learning guitar and barre chords are still humbling me every single day.",
  'This is exactly the kind of feature I was hoping would ship eventually. Great to see it land.',
  "Rewatched the original after seeing the sequel and honestly the original holds up better.",
  'My commute got twenty minutes shorter after switching routes and it has genuinely improved my mood.',
  "Started journaling every morning and it's made a bigger difference than I expected.",
  'The battery life on this thing is absurd. Two full days of heavy use on a single charge.',
  "Anyone else find the documentation a bit sparse on the edge cases? Had to dig through issues.",
  'Picked this up on a whim and ended up finishing it in a single weekend.',
  "Switched teams at work last month and the onboarding process was smoother than I expected.",
  'The plot twist in chapter twelve completely reframed everything that came before it.',
  "Been meal-prepping with a slow cooker and it's cut my weekday cooking time in half.",
  'Solid update overall, though I do miss the old icon set a little.',
  "Took the long way home today just to catch the sunset over the bridge — worth it.",
  'Three years of using this daily and it still hasn’t let me down once.',
  "Finally got around to organizing my bookshelf by color instead of author, no regrets.",
  'The live show was even better than the recorded version — the energy in the room was something else.',
  "Started using a physical planner again after years of apps and it's surprisingly satisfying.",
  'Picked up sourdough as a hobby and my kitchen has never smelled better.',
  "The keyboard shortcuts in this update alone probably save me an hour a week.",
  'Everyone told me to skip the intro but I actually think it sets up the whole story well.',
];

// Plain, natural replies with no HTML — the majority of shallow replies.
const PLAIN_REPLIES = [
  'Completely agree, same experience here.',
  "I was skeptical at first but you've convinced me to try it.",
  'Interesting take — hadn’t considered it that way.',
  'Following this thread, curious how it turns out for you.',
  'This matches what I found too, glad it’s not just me.',
  'Honestly a bit surprised, but good to know.',
  'Same boat here, been debating this for a while.',
  'Thanks for sharing, this is genuinely useful.',
  'Not sure I fully agree, but I see where you’re coming from.',
  'That’s a great point I hadn’t thought about.',
  'Ha, exact same thing happened to me last week.',
  'Appreciate the detailed reply, saved me some trial and error.',
];

// HTML-tagged replies — every one of the four allowed tag shapes shows up
// across this pool, spread across different comments (brief §5 / task step
// 2.5). hrefs are real, generic, safe (http/https) reference sites.
const HTML_REPLIES = [
  'This is <strong>exactly</strong> the right call, no notes.',
  'I’d honestly say it’s <i>underrated</i> compared to the alternatives.',
  'You can get the same result faster with <code>Ctrl+Shift+P</code> and the command palette.',
  'Worth reading the background on this — <a href="https://en.wikipedia.org/wiki/Special:Random" title="Related reading">here’s a good overview</a>.',
  'Ran into the same thing — fixed it by passing <code>--legacy-peer-deps</code>.',
  'Not to be <i>that</i> person, but the docs actually cover this pretty well.',
  '<strong>Huge</strong> improvement over the previous version, genuinely.',
  'There’s a solid writeup on this over on <a href="https://developer.mozilla.org" title="MDN Web Docs">MDN</a> if you want the details.',
  'The trick is wrapping it in <code>useMemo</code> so it doesn’t recompute every render.',
  'I was <i>certain</i> this wouldn’t work and then it just did.',
  'Check out <a href="https://github.com" title="GitHub">the repo</a> — the README walks through the whole setup.',
  'This deserves way more attention than it’s getting, <strong>seriously</strong> underrated.',
];

// Natural, varied back-and-forth for the deep chain — no "Level N" filler.
// Cycled through a handful of usernames for a realistic multi-person thread.
const DEEP_CHAIN_LINES = [
  'Honestly not sure I buy this — feels like it only works in the happy path.',
  'Fair, but the happy path is like 95% of real usage in my experience.',
  'Sure, though that other 5% is usually where the actual bugs live.',
  'True. We hit exactly that a couple months back and it was a mess to debug.',
  'What ended up fixing it for you two in the end?',
  'Mostly just adding proper fallbacks everywhere instead of assuming success.',
  'That tracks. Defensive coding is unglamorous but it pays off eventually.',
  'Curious whether this scales once you’re past a few thousand records though.',
  'We tested around that range and it held up fine, surprisingly.',
  'Good to know — was worried it’d fall over past a certain size.',
  'It does start to lag a bit past ~50k, for what it’s worth.',
  'That lines up with what I’d expect honestly, not a dealbreaker.',
  'Agreed, and there are pagination tricks that push that ceiling way higher anyway.',
  'Yeah, chunking the requests helped a lot when we ran into this.',
  'Did you have to change much on the client side for that to work?',
  'Barely anything actually, mostly just the request layer.',
  'That’s reassuring, was expecting a bigger refactor than that.',
  'Same here at first, then realized it was a pretty contained change.',
  'Appreciate you both walking through this, saved me a lot of guessing.',
  'No problem, this thread genuinely helped me think it through too.',
  'Same, going to revisit our setup with this in mind next sprint.',
  'Let us know how it goes, curious if it holds up for your case too.',
];

const TEXT_FIXTURES = [
  { filename: 'notes.txt', content: 'Quick notes from today:\n- Follow up on the open PR\n- Double check the staging deploy\n- Reply to the thread about caching\n' },
  { filename: 'todo.txt', content: 'To do this week:\n1. Finish the draft\n2. Buy groceries\n3. Call about the appointment\n4. Read the new chapter\n' },
  { filename: 'recipe.txt', content: 'Weeknight pasta:\n- 2 cloves garlic, sliced thin\n- Olive oil, a generous glug\n- Chili flakes to taste\n- Toss with pasta water until it emulsifies\n' },
  { filename: 'ideas.txt', content: 'Random ideas:\n- Weekend trip to the coast\n- Try that new bakery downtown\n- Finally organize the garage\n' },
];

const IMAGE_FILES = ['atlas.jpg', 'ded.jpg', 'zWs.gif'];

// ─── Timestamp backdating ───────────────────────────────────────────────────
// createComment has no way to set createdAt (server assigns now()) — dates
// are backdated afterward via a direct Prisma UPDATE so the table/sorting
// looks like a real, aged comment section instead of 90-odd rows all
// created in the same few minutes.

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

/** Root i (of `total`) gets a date spread across the last `spanDays`, oldest
 * first — root 0 is the oldest, the last root is ~now. A little jitter keeps
 * it from looking mechanically uniform. */
function rootDate(i, total, spanDays = 24) {
  const frac = total <= 1 ? 1 : i / (total - 1);
  const jitterMs = (Math.random() - 0.5) * 6 * 60 * 60 * 1000; // ±3h
  return new Date(now - (1 - frac) * spanDays * DAY_MS + jitterMs);
}

/** A reply's date: some time after its parent's, never past `now`. */
function replyDate(parentDate, minHours, maxHours) {
  const offsetMs = (minHours + Math.random() * (maxHours - minHours)) * 60 * 60 * 1000;
  const d = new Date(parentDate.getTime() + offsetMs);
  return d.getTime() > now ? new Date(now - 60_000) : d;
}

// ─── Build + run ────────────────────────────────────────────────────────────

const ROOT_COUNT = 30;
// Every other root (13 of them, indices 1,3,5,...,25) gets shallow replies;
// two specific older roots (indices 2 and 5 — picked for plenty of headroom
// before `now` once their reply chain's timestamps stack up) get a deep
// chain instead of/in addition to shallow replies.
const DEEP_CHAIN_ROOT_INDICES = [2, 5];
const SHALLOW_REPLY_ROOT_INDICES = [1, 3, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27];

const stats = {
  roots: 0,
  replies: 0,
  deepestDepth: 0,
  images: 0,
  textFiles: 0,
  htmlTagged: 0,
};
const idDateMap = new Map(); // id -> Date, for the backdating pass

let uploadedImages = [];
let uploadedTexts = [];

async function uploadAllAttachments() {
  console.log('Uploading attachments…');
  for (const filename of IMAGE_FILES) {
    const id = await uploadImage(filename);
    uploadedImages.push(id);
    stats.images++;
    console.log(`  image: ${filename} -> ${id}`);
  }
  for (const fixture of TEXT_FIXTURES) {
    const id = await uploadText(fixture.filename, fixture.content);
    uploadedTexts.push(id);
    stats.textFiles++;
    console.log(`  text: ${fixture.filename} -> ${id}`);
  }
}

let imageCursor = 0;
let textCursor = 0;
// Attachments are handed out to specific, spread-out comments (not every
// comment) — one root gets the first (largest) image, a reply gets another,
// and a few different comments/replies get a text file each.
function nextImageAttachmentId() {
  if (imageCursor >= uploadedImages.length) return undefined;
  return uploadedImages[imageCursor++];
}
function nextTextAttachmentId() {
  if (textCursor >= uploadedTexts.length) return undefined;
  return uploadedTexts[textCursor++];
}

async function buildShallowReplies(rootId, rootDateValue, replyIndexSeed) {
  const replyCount = 1 + (replyIndexSeed % 3); // 1-3
  let lastId = rootId;
  let lastDate = rootDateValue;
  for (let r = 0; r < replyCount; r++) {
    const idx = replyIndexSeed * 7 + r;
    const { username, email, homepage } = identity(idx + 100);
    const useHtml = idx % 4 === 0;
    const text = useHtml
      ? HTML_REPLIES[idx % HTML_REPLIES.length]
      : PLAIN_REPLIES[idx % PLAIN_REPLIES.length];
    if (useHtml) stats.htmlTagged++;

    const attachmentId = idx % 11 === 0 ? nextTextAttachmentId() : undefined;

    const date = replyDate(lastDate, 1, 48);
    const id = await createComment({ username, email, homepage, text, parentId: rootId, attachmentId });
    idDateMap.set(id, date);
    stats.replies++;
    stats.deepestDepth = Math.max(stats.deepestDepth, 1);

    // Occasionally give one reply its own single nested reply (depth 2).
    if (r === replyCount - 1 && idx % 5 === 0) {
      const { username: u2, email: e2 } = identity(idx + 200);
      const nestedDate = replyDate(date, 1, 24);
      const nestedId = await createComment({
        username: u2,
        email: e2,
        text: PLAIN_REPLIES[(idx + 3) % PLAIN_REPLIES.length],
        parentId: id,
      });
      idDateMap.set(nestedId, nestedDate);
      stats.replies++;
      stats.deepestDepth = Math.max(stats.deepestDepth, 2);
    }
  }
}

/** Builds a (mostly) linear chain of `length` replies under `rootId`, deep
 * enough to exercise "Continue this thread" multiple times (re-root past
 * MAX_VISUAL_DEPTH=6 repeatedly) and the depth cap itself. One small branch
 * partway down (a second reply to a mid-chain comment) adds a touch of the
 * branching realism real deep threads have, without complicating the
 * "reaches depth ~20" requirement. */
async function buildDeepChain(rootId, rootDateValue, length, seed) {
  let parentId = rootId;
  let parentDate = rootDateValue;
  let depth = 0;

  for (let i = 0; i < length; i++) {
    const idx = seed * 13 + i;
    const { username, email } = identity(idx + 300);
    const useHtml = i % 6 === 0;
    let text = DEEP_CHAIN_LINES[i % DEEP_CHAIN_LINES.length];
    if (useHtml) {
      text = HTML_REPLIES[(seed + i) % HTML_REPLIES.length];
    }
    if (useHtml) stats.htmlTagged++;

    const attachmentId =
      i === Math.floor(length / 2) ? nextImageAttachmentId() ?? nextTextAttachmentId() : undefined;

    const date = replyDate(parentDate, 2, 10);
    const id = await createComment({ username, email, text, parentId, attachmentId });
    idDateMap.set(id, date);
    stats.replies++;
    depth++;
    stats.deepestDepth = Math.max(stats.deepestDepth, depth);

    // One small branch roughly a third of the way down.
    if (i === Math.floor(length / 3)) {
      const { username: bu, email: be } = identity(idx + 400);
      const branchDate = replyDate(date, 1, 6);
      const branchId = await createComment({
        username: bu,
        email: be,
        text: PLAIN_REPLIES[(idx + 5) % PLAIN_REPLIES.length],
        parentId: id,
      });
      idDateMap.set(branchId, branchDate);
      stats.replies++;
    }

    parentId = id;
    parentDate = date;
    process.stdout.write(`\r  deep chain #${seed}: depth ${depth}/${length}                    `);
  }
  process.stdout.write('\n');
}

async function run() {
  await uploadAllAttachments();

  console.log(`\nCreating ${ROOT_COUNT} root comments…`);
  for (let i = 0; i < ROOT_COUNT; i++) {
    const { username, email, homepage } = identity(i);
    const text = ROOT_TEXTS[i % ROOT_TEXTS.length];
    const attachmentId = i === 4 ? nextImageAttachmentId() : undefined; // the large, un-resized-yet image

    const date = rootDate(i, ROOT_COUNT);
    const id = await createComment({ username, email, homepage, text, attachmentId });
    idDateMap.set(id, date);
    stats.roots++;
    process.stdout.write(`\r  roots: ${i + 1}/${ROOT_COUNT}                         `);

    if (SHALLOW_REPLY_ROOT_INDICES.includes(i)) {
      await buildShallowReplies(id, date, i);
    }
    if (DEEP_CHAIN_ROOT_INDICES.includes(i)) {
      const seedIndex = DEEP_CHAIN_ROOT_INDICES.indexOf(i);
      const length = seedIndex === 0 ? 22 : 11;
      console.log(`\n  root #${i + 1} (${username}) starting a depth-${length} chain…`);
      await buildDeepChain(id, date, length, seedIndex);
    }

    await sleep(200); // gentle spacing between roots; the throttle backoff handles the real limit
  }
  process.stdout.write('\n');

  console.log('\nBackdating timestamps…');
  const updates = Array.from(idDateMap.entries());
  for (let i = 0; i < updates.length; i++) {
    const [id, date] = updates[i];
    await prisma.comment.update({ where: { id }, data: { createdAt: date } });
    if (i % 10 === 0) process.stdout.write(`\r  ${i + 1}/${updates.length}                `);
  }
  process.stdout.write('\n');

  console.log('\n─── Summary ─────────────────────────────────────────');
  console.log(`Root comments:        ${stats.roots}`);
  console.log(`Replies:               ${stats.replies}`);
  console.log(`Deepest thread depth:  ${stats.deepestDepth}`);
  console.log(`Image attachments:     ${stats.images}`);
  console.log(`Text file attachments: ${stats.textFiles}`);
  console.log(`HTML-tagged comments:  ${stats.htmlTagged}`);
  console.log(`Total comments:        ${stats.roots + stats.replies}`);
  console.log('────────────────────────────────────────────────────');
}

try {
  await run();
} finally {
  await redis.quit();
  await prisma.$disconnect();
}
