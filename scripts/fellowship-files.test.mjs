// node --test scripts/fellowship-files.test.mjs
// FELLOW-FILES (21 Nov 2026): a fellow's LinkedIn file fills in their posts' impressions. The file lists posts as
// linkedin.com/posts/<name>_<opening-words>-share-<id>; fellows save links as that, as feed/update/urn:li:activity:<id>
// (a different id made moments apart), or not at all. Every person and post here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkWords, linkedInId, numbersFromFiles, sameLinkedInPost, sameOpening } from "../app/lib/fellowship-files.ts";

// Two ids for one post, the activity made 436 ms after the share (the top bits are milliseconds).
const SHARE = 7527010149639622657n;
const ACTIVITY = SHARE + (436n << 22n) + 12345n;

test("an activity link and a share link of the same post are the same post; another post's id is not", () => {
  assert.equal(linkedInId(`https://www.linkedin.com/feed/update/urn:li:activity:${ACTIVITY}`), ACTIVITY);
  assert.equal(linkedInId(`https://www.linkedin.com/posts/asha-k_in-october-i-applied-share-${SHARE}-7CQh`), SHARE);
  assert.equal(linkedInId(`https://www.linkedin.com/posts/asha-k_internship-studojo-ugcPost-${SHARE}-8D_6`), SHARE);
  assert.equal(sameLinkedInPost(ACTIVITY, SHARE), true);
  assert.equal(sameLinkedInPost(SHARE + (60_000n << 22n), SHARE), false, "a post a minute later is another post");
  assert.equal(sameLinkedInPost(null, SHARE), false);
  assert.equal(linkedInId("https://www.linkedin.com/posts/asha-k"), null, "a profile link has no post id");
});

test("opening words: the words LinkedIn puts in the link agree with the start of the post", () => {
  const url = `https://www.linkedin.com/posts/asha-k_in-october-i-had-applied-for-an-internship-share-${SHARE}-7CQh`;
  assert.deepEqual(linkWords(url), ["in", "october", "i", "had", "applied", "for", "an", "internship"]);
  assert.equal(sameOpening("In October, I had applied for an internship at a bank. Here's what happened.", url), true);
  assert.equal(sameOpening("In October I joined a club.", url), false);
  assert.equal(sameOpening("It’s not what I thought", "https://www.linkedin.com/posts/asha-k_its-not-what-i-thought-share-1"), false, "no long id: not a post link");
  assert.equal(sameOpening("It’s not what I thought at all", `https://www.linkedin.com/posts/asha-k_its-not-what-i-thought-share-${SHARE}`), true, "apostrophes dropped, as LinkedIn does");
  assert.equal(sameOpening("Hi all, big news", `https://www.linkedin.com/posts/asha-k_hi-all-big-news-share-${SHARE}`), false, "too few words to be sure");
});

const week = (periodStart, periodEnd, posts, uploadedAt = `${periodEnd}T12:00:00.000Z`) => ({ uploadedAt, periodStart, periodEnd, posts });
const post = (id, body, url, postedAt, status = "posted") => ({ id, body, url, postedAt, status });

test("a file fills in the post it lists, by id or by opening words, only when the post went up inside the file's period", () => {
  const ours = [
    post(1, "In October I had applied for an internship and got nothing back.", `https://www.linkedin.com/feed/update/urn:li:activity:${ACTIVITY}`, "2026-11-13T05:00:00Z"),
    post(2, "Six hackathons and six losses in two months taught me this.", null, "2026-11-13T09:00:00Z"),
    post(3, "Forty people stopped at our stall in one hour, here is why.", null, "2026-11-02T09:00:00Z"),
    post(4, "Not posted yet, so no numbers come in for it at all.", null, null, "ready"),
  ];
  const files = [
    week("2026-11-09", "2026-11-15", [
      { url: `https://www.linkedin.com/posts/asha-k_in-october-i-had-applied-for-an-internship-share-${SHARE}-7CQh`, publishedOn: "2026-11-13", impressions: 564 },
      { url: `https://www.linkedin.com/posts/asha-k_six-hackathons-and-six-losses-in-two-months-share-${SHARE + (9_000_000n << 22n)}-Iy_S`, publishedOn: "2026-11-13", impressions: 459 },
      // Went up before this period: the file has only this week's share of it.
      { url: `https://www.linkedin.com/posts/asha-k_forty-people-stopped-at-our-stall-in-one-share-${SHARE - (900_000_000n << 22n)}-a1`, publishedOn: "2026-11-02", impressions: 80 },
      { url: `https://www.linkedin.com/posts/asha-k_not-posted-yet-so-no-numbers-share-${SHARE + (86_400_000n << 22n)}`, publishedOn: "2026-11-14", impressions: 999 },
    ]),
    week("2026-11-16", "2026-11-22", [
      // A later file: post 1 is older than its period, so the 9-15 Nov count stands.
      { url: `https://www.linkedin.com/posts/asha-k_in-october-i-had-applied-for-an-internship-share-${SHARE}-7CQh`, publishedOn: "2026-11-13", impressions: 120 },
    ]),
  ];
  const got = numbersFromFiles(ours, files);
  assert.equal(got.get(1)?.impressions, 564, "activity link vs share link");
  assert.equal(got.get(2)?.impressions, 459, "no link saved: opening words");
  assert.equal(got.has(3), false, "older than the file's period");
  assert.equal(got.has(4), false, "a post not marked posted never takes numbers");
});

test("the highest count across files wins, and a file post that could be two of ours is left out", () => {
  const ours = [
    post(1, "I said no to an internship offer last week and here is why.", `https://www.linkedin.com/posts/asha-k_i-said-no-share-${SHARE}`, "2026-11-12T05:00:00Z"),
    post(2, "We moved our fest stall next to the food queue and it worked.", null, "2026-11-12T06:00:00Z"),
    post(3, "We moved our fest stall next to the food queue and it worked again.", null, "2026-11-13T06:00:00Z"),
  ];
  const files = [
    week("2026-11-08", "2026-11-14", [{ url: `https://www.linkedin.com/posts/asha-k_i-said-no-share-${SHARE}-x`, publishedOn: "2026-11-12", impressions: 300 }]),
    week("2026-11-10", "2026-11-16", [
      { url: `https://www.linkedin.com/posts/asha-k_i-said-no-share-${SHARE}-x`, publishedOn: "2026-11-12", impressions: 1063 },
      { url: `https://www.linkedin.com/posts/asha-k_we-moved-our-fest-stall-next-to-the-food-share-${SHARE + (5_000_000n << 22n)}`, publishedOn: "2026-11-12", impressions: 50 },
    ]),
  ];
  const got = numbersFromFiles(ours, files);
  assert.equal(got.get(1)?.impressions, 1063);
  assert.equal(got.get(1)?.periodEnd, "2026-11-16");
  assert.equal(got.has(2) || got.has(3), false, "same opening on two posts: not guessed");
});
