import { test } from "node:test";
import assert from "node:assert/strict";
import { wordAt, sentenceIds, fmt } from "../src/player.js";

test("the highlighted word is the last one that has started", () => {
  const t = [0, 50, 120, 120, 300];
  assert.equal(wordAt(t, -1), -1);
  assert.equal(wordAt(t, 0), 0);
  assert.equal(wordAt(t, 49), 0);
  assert.equal(wordAt(t, 120), 3, "words with the same start resolve to the later one");
  assert.equal(wordAt(t, 99999), 4);
  assert.equal(wordAt([], 10), -1);
});

test("sentences end at . ! ? (with closing quotes) but not after Mr. or Mrs.", () => {
  const ids = sentenceIds(["Mr.", "Darcy", "bowed.", "“Oh!”", "said", "she.", "Then", "silence"]);
  assert.deepEqual(ids, [0, 0, 0, 1, 2, 2, 3, 3]);
});

test("clock format", () => {
  assert.equal(fmt(5), "0:05");
  assert.equal(fmt(728.4), "12:08");
  assert.equal(fmt(3725), "1:02:05");
});
