"""Parser, aligner and rights checks on small synthetic inputs (standard library only)."""
import random
import unittest

from pipeline.align import BookIndex, align, interpolate
from pipeline.make_book import check_rights, section_title, times_for_blocks, us_public_domain_cutoff
from pipeline.textparse import book_words, norm_word, parse_blocks

HTML = """<html><head><meta charset="utf-8"><title>x</title></head><body>
<p>Project Gutenberg header. This ebook is for the use of anyone anywhere in the United States.</p>
*** START OF THE PROJECT GUTENBERG EBOOK TEST ***
<h2>CHAPTER I.</h2>
<div class="figleft"><img src="images/a.png" width="60" alt="A"></div><p>LICE was beginning to get <i>very</i> tired.<span class="pagenum">[2]</span> She
had nothing to do.</p>
<div class="figcenter"><img src="images/i_001.jpg" alt="The White Rabbit"><p class="caption">The Rabbit checks his watch</p></div>
<div class="poem"><span>Twinkle, twinkle, little bat!</span><br><span>How I wonder what you're at!</span></div>
<p>She went on.</p>
*** END OF THE PROJECT GUTENBERG EBOOK TEST ***
<p>License text</p>
</body></html>"""


class ParseTest(unittest.TestCase):
    def setUp(self):
        self.blocks = parse_blocks(HTML)

    def text(self, b):
        return " ".join(w for w, _ in b["w"])

    def test_header_footer_and_page_numbers_are_dropped(self):
        all_text = " ".join(self.text(b) for b in self.blocks if b["k"] != "img")
        self.assertNotIn("Gutenberg", all_text)
        self.assertNotIn("License", all_text)
        self.assertNotIn("[2]", all_text)

    def test_drop_cap_joins_its_word_and_italics_survive(self):
        p = [b for b in self.blocks if b["k"] == "p"][0]
        self.assertEqual(p["w"][0][0], "Alice")
        self.assertIn(["very", True], p["w"])
        self.assertEqual(self.text(p), "Alice was beginning to get very tired. She had nothing to do.")

    def test_headings_images_captions_and_line_breaks(self):
        kinds = [b["k"] for b in self.blocks]
        self.assertEqual(kinds[0], "h")
        img = [b for b in self.blocks if b["k"] == "img"]
        self.assertEqual(len(img), 1, "the drop-cap letter is not an illustration")
        self.assertEqual(img[0]["src"], "images/i_001.jpg")
        self.assertEqual(img[0]["cap"], "The Rabbit checks his watch")
        verse = [b for b in self.blocks if b.get("br")][0]
        self.assertEqual(self.text(verse), "Twinkle, twinkle, little bat! How I wonder what you're at!")
        self.assertEqual(verse["br"], [4])

    def test_normalization(self):
        self.assertEqual(norm_word("“Oh!”"), "oh")
        self.assertEqual(norm_word("you’re"), "you're")
        self.assertEqual(norm_word("—"), "")


def make_book(n_words=3000, seed=7):
    rnd = random.Random(seed)
    vocab = ["the", "rabbit", "alice", "queen", "garden", "said", "very", "curious", "tea", "hatter", "march", "hare",
             "cat", "smile", "door", "key", "little", "bottle", "drink", "me", "cake", "grew", "small", "tall", "pool",
             "tears", "mouse", "swim", "shore", "race", "caucus", "dodo", "bill", "lizard", "chimney", "caterpillar"]
    return [rnd.choice(vocab) + ("" if rnd.random() < 0.8 else str(rnd.randint(0, 9))) for _ in range(n_words)]


def speak(tokens, start_time=12.0, rate=0.32, errors=0.08, seed=3, intro=("chapter", "one", "this", "is", "a", "librivox", "recording")):
    """A fake transcript: an intro the book doesn't contain, then the words with some recognition errors."""
    rnd = random.Random(seed)
    t, out = 0.0, []
    for w in intro:
        out.append([round(t, 2), round(t + 0.3, 2), w])
        t += 0.35
    t = start_time
    for w in tokens:
        r = rnd.random()
        if r < errors / 2:
            out.append([round(t, 2), round(t + rate, 2), "xyzzy"])     # misheard
        elif r < errors:
            pass                                                     # dropped
        else:
            out.append([round(t, 2), round(t + rate, 2), w])
        t += rate
    return out


class AlignTest(unittest.TestCase):
    def test_finds_the_right_stretch_and_times_it(self):
        book = make_book()
        idx = BookIndex(book)
        part = book[1200:1800]
        r = align(idx, speak(part), start_at=0)
        self.assertIsNotNone(r)
        self.assertLessEqual(abs(r["first"] - 1200), 3)
        self.assertLessEqual(abs(r["last"] - 1799), 3)
        self.assertGreater(r["matched"] / (r["last"] - r["first"] + 1), 0.85)
        # the 100th word of the part starts about 100 words after the reading began
        k = 1300 - r["first"]
        self.assertAlmostEqual(r["times"][k], 12.0 + 100 * 0.32, delta=1.0)

    def test_times_never_go_backwards_and_cover_the_span(self):
        book = make_book()
        r = align(BookIndex(book), speak(book[200:900], errors=0.2), start_at=0)
        self.assertEqual(len(r["times"]), r["last"] - r["first"] + 1)
        self.assertTrue(all(b >= a for a, b in zip(r["times"], r["times"][1:])))

    def test_respects_start_at_for_consecutive_sections(self):
        book = make_book()
        idx = BookIndex(book)
        first = align(idx, speak(book[0:700]), start_at=0)
        second = align(idx, speak(book[700:1400], seed=5), start_at=first["last"] + 1)
        self.assertGreater(second["first"], first["last"])

    def test_unrelated_audio_is_rejected(self):
        book = make_book()
        noise = [[i * 0.3, i * 0.3 + 0.2, w] for i, w in enumerate(make_book(400, seed=99))]
        r = align(BookIndex(book), noise, start_at=0)
        self.assertTrue(r is None or r["matched"] / (r["last"] - r["first"] + 1) < 0.3)

    def test_interpolation_weights_by_length(self):
        toks = ["a", "bbbbbbbb", "c", "d"]
        out = interpolate(toks, 0, 3, {0: 0.0, 3: 3.0}, end_time=3.5)
        self.assertLess(out[1], out[2])
        self.assertGreater(out[2] - out[1], out[1] - out[0], "the long word takes longer")


class MakeBookTest(unittest.TestCase):
    def test_public_domain_cutoff_moves_every_year(self):
        self.assertEqual(us_public_domain_cutoff(2026), 1930)
        self.assertEqual(us_public_domain_cutoff(2027), 1931)

    def test_rights(self):
        pd = "Public domain in the USA."
        self.assertIsNone(check_rights({"published": 1865}, "<p>text</p>", pd))
        self.assertIn("after", check_rights({"published": 1990}, "<p>text</p>", pd))
        self.assertIn("catalog record", check_rights({"published": 1900}, "<p>text</p>", "Copyrighted. Read the copyright notice"))
        self.assertIn("copyrighted", check_rights({"published": 1900}, "<p>This eBook is copyrighted</p>", pd))

    def test_section_titles(self):
        self.assertEqual(section_title("01 - Proem & Down the Rabbit-hole", 1), "Proem & Down the Rabbit-hole")
        self.assertEqual(section_title("", 3), "Part 3")
        self.assertEqual(section_title("01 Marley's Ghost", 1), "Marley's Ghost")
        self.assertEqual(section_title("04 The Last of the Sprits", 4, {"4": "The Last of the Spirits"}), "The Last of the Spirits")

    def test_section_never_ends_on_the_next_chapters_heading(self):
        blocks = parse_blocks("<h2>CHAPTER I</h2><p>one two three four five six seven eight</p><h2>CHAPTER II</h2><p>nine ten</p>")
        bw = book_words(blocks)
        last = [i for i, (b, w, n) in enumerate(bw) if b == 2][0]  # "chapter" of CHAPTER II
        times = [float(i) for i in range(last + 1)]
        shown, flat = times_for_blocks(blocks, bw, 0, last, times)
        self.assertEqual([b["k"] for b in shown], ["h", "p"])
        self.assertEqual(len(flat), 2 + 8)
        self.assertEqual(flat, sorted(flat))


if __name__ == "__main__":
    unittest.main()
