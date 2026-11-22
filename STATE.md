# State (2026-11-22)

- Starting point: one line in Jack's notes ("Turning audio books into full visual experiences"); no code or assets.
- Built: a pipeline that turns a LibriVox recording plus a Project Gutenberg HTML edition into word-timed chapter
  pages with the original illustrations; a static site with a read-along player, embeds, open data; monthly,
  weekly and deploy workflows.
- Published at launch: Alice's Adventures in Wonderland (Eric Leach; Rackham illustrations; 95% of words matched)
  and A Christmas Carol (Kara Shallenberg; Leech illustrations). 12 more books queued.
- Verified: unit tests for the parser, aligner, rights and player logic; build tests; a headless-Chrome test of
  sync, seeking, illustrations, embeds and phone layout; live playback from the Internet Archive.
- Known limits: timing is word-level from a small recognition model (occasional drift of a fraction of a second
  around unmatched words); books whose LibriVox reader used a different edition than the Gutenberg HTML match less
  well (the quality gate catches it); no accounts or progress sync across devices.
