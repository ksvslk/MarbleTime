# Research 5 · Open question banks and open content (checked Oct 7, 2026)

Input for the redesign. Compiled by a research agent that confirmed every licence on the official page and quoted the licence line. Project rule: permissive licences only (CC0, public domain, CC BY, MIT, Apache, OGL); ShareAlike only in a separate, flagged pool; no NonCommercial.

**Short answer:** free sets exist, but almost every ready-made item that can be used commercially is in **UK English**. The best match is **Oak National Academy** (UK government body): thousands of quiz questions for ages 5–11 under the Open Government Licence v3 (compatible with CC BY 4.0), many already in our shape (prompt, picture, 3 choices). **No open, ready-made Estonian item bank for ages 4–10 was found.**

## 1. Usable now

| Source | Content, size | Ages | Lang | Format | Licence (quoted) | Effort |
|---|---|---|---|---|---|---|
| **Oak National Academy quizzes** | A starter and an exit quiz per lesson; about 360 KS1 and 710 KS2 maths lessons, 240 KS1 and 840 KS2 English lessons. Sample of 6 KS1 maths lessons (72 questions): 50 multiple choice, 43 of them with exactly 3 options; many with a picture ("Count the leaves. How many leaves are in the group?") | 5–11 | en-GB | JSON (free API key, bulk download) | OGL v3 "except where otherwise stated". Credit: "A [subject] lesson by Oak National Academy licensed under Open Government Licence (OGL)" | Low–medium: keep 3-option questions, host images, follow each image's attribution, remove UK specifics. KS1 English is book-based with no phonics units, so maths helps most |
| **STA national test materials** (gov.uk) | Phonics screening check (40 words a year), optional KS1 maths, reading and grammar papers, KS2 papers; last 3 years online | 5–7 (KS2 10–11) | en-GB | PDF | "You may re-use them (not including logos) free of charge … Open Government Licence v3.0". Third-party parts (e.g. photos) listed per year must be replaced | Medium: copy by hand; many open answers need 3 choices written |
| **DfE Mathematics guidance KS1–2** (2020) | 76 "ready-to-progress" criteria for Years 1–6 with example questions | 5–11 | en | PDF | OGL v3 "except where otherwise stated" | Medium: skill map and difficulty anchors |
| **DfE Development Matters**, **National Curriculum English Appendix 1** | Early maths and literacy steps (3–4-year-olds, Reception); Year 1–2 common exception words and grapheme lists | 3–7 | en | PDF | OGL | Low (lists) |
| **Illustrative Mathematics K–5, first edition** | Lessons, centres and practice sets with pictures for K–5 | 5–11 | en | HTML | "Licensed under the Creative Commons Attribution 4.0 license" (name and logo excluded). **The newer IM v.360 is NonCommercial: first edition only** | Medium–high: scraping; many open-ended problems |
| **Emoji pictures**: Twemoji, Noto Emoji, Fluent Emoji | Full emoji sets, SVG/PNG | – | – | SVG/PNG | Twemoji graphics CC BY 4.0; Noto images Apache 2.0 (fonts OFL 1.1); Fluent MIT | Low |
| **Unicode CLDR emoji names** | A name for every emoji in **Estonian, German, Spanish and English** (🐶 "koera nägu", 🍎 "punane õun") | – | et de es en | XML | Unicode License V3 (keep the notice) | Low: picture labels and read-aloud words |
| **Wordbank** (word knowledge by age) | Includes Estonian (16–36 months), German, Spanish variants | difficulty data | 4 | CSV/API | CC BY 4.0 unless stated | Low: easy words for 4–5-year-olds |
| **EKI Ekilex/Sõnaveeb**, **Estonian Frequency Dictionary** | Learner list of ~7,000 words (A2–B1); 10,000 base-word frequency list | difficulty data | et | API / files | "Ekilexi andmekogude tüüplitsent on CC BY 4.0"; frequency dictionary "CC - BY" | Low–medium |
| **Estonian curricula** (basic school maths annex, preschool curriculum) | Learning outcomes grades 1–3 | 6–9 | et | PDF | Not copyrighted: Copyright Act § 5 excludes legislation and administrative documents | Low: skill map |

## 2. Usable with caveats

- **NAEP grade 4 released items (US):** public domain, but ages 9–10, English, no bulk export, some third-party passages.
- **Bebras / Informatik-Biber logic tasks:** CC BY-SA 4.0; the grade 3–4 group gets 9 tasks a year (easy/medium/hard) with explanations, PDF. Best human-made logic tasks for ages 8–10 (ShareAlike pool).
- **OpenMoji**, **Mulberry Symbols**: CC BY-SA 4.0.
- **e-koolikott (HARNO, Estonia):** "E-koolikoti materjalidele kehtib litsents CC BY-SA 3.0", only for written content and uploaded files there; linked tools keep their owners' terms; no bulk export.
- **German/Spanish:** ZUM-Unterrichten (H5P exercises) and Klexikon are CC BY-SA 4.0; CEDEC/INTEF (Spain) CC BY-SA 3.0 ES (coverage of preschool/primary unconfirmed).
- **African Storybook:** CC BY 4.0, 5,479 books in 261 languages (stories for listening questions; check each book's credits).
- **NCETM:** OGL, but named authors' material needs permission. **Letters and Sounds (2007):** OGL v3, some third-party activities.
- **Maths word-problem datasets:** GSM8K (MIT, too long and multi-step); SVAMP (MIT, but built from CC BY-NC ASDiv-A: licensing risk); MGSM (CC BY 4.0, translated, too hard).
- **ARC** (Apache 2.0) and **ConceptARC** (MIT): grid puzzles; difficulty for children unknown.
- **Open Trivia DB:** CC BY-SA 4.0, adult general knowledge.
- **Kuperman 2012 AoA ratings:** original data has no licence; don't ship.

## 3. Not usable

IM v.360 (CC BY-NC); EL Education / Bookworms (reported CC BY-NC); TIMSS/PIRLS (non-commercial only); MELQO (CC BY-NC-SA); ASDiv (CC BY-NC); CHILDES incl. Estonian corpora (CC BY-NC-SA); ARASAAC (BY-NC-SA); OpenStax (no K–5; NC); Siyavula (grades 4–12); MAWPS (no licence); EGRA/EGMA (all rights reserved); US state tests (no reuse terms); Dolch/Fry lists (no licence found; use DfE common exception words); MultiPic (no licence); Kobras (no licence, grades 5+); Innove/REKK worksheets on digar.ee ("Copyrighted").

## 4. Recommendation

1. Build the age map from open curricula (Development Matters, DfE maths guidance, English Appendix 1, the Estonian grade 1–3 curriculum).
2. Keep a "gold" bank of human-made items (Oak 3-option questions, STA phonics and KS1 items, IM practice problems) with source, licence and credit on every item: use as they are (English), as examples for AI, and as difficulty anchors.
3. AI only for variations, checked by code.
4. Logic games generated by code, correct by construction (Bebras and ARC only as inspiration).
5. Licences tidy in THIRD_PARTY_NOTICES.md; ShareAlike items in a separate, flagged pool.

**Estonian:** content must be built, not found: skill map from the curriculum; maths translated from Oak/STA/IM (OGL and CC BY allow translation; native review); vocabulary from CLDR Estonian names, Wordbank Estonian and EKI CC BY lists; letters and sounds generated by code (Estonian spelling is close to one letter per sound); e-koolikott items only when marked CC BY-SA; ask HARNO whether EIS practice tasks and tasemetööd can be licensed.

## 5. Sources

- Oak: https://www.thenational.academy/legal/terms-and-conditions-api-version · https://open-api.thenational.academy/docs/about-oaks-data/content-coverage · https://open-api.thenational.academy/bulk-download · quiz schema https://github.com/oaknational/oak-ai-lesson-assistant/blob/main/packages/aila/src/protocol/schemas/quiz/rawQuiz.ts · sample lesson https://www.thenational.academy/teachers/programmes/maths-primary-ks1/units/counting-recognising-and-comparing-numbers-0-10/lessons/counting-different-groups
- STA: https://www.gov.uk/government/publications/phonics-screening-check-2024-materials · https://www.gov.uk/government/publications/optional-key-stage-1-tests-2025-mathematics-test-materials · https://assets.publishing.service.gov.uk/media/68358834c239ae3e866c03af/2025_KS1_copyright_ownership.pdf
- DfE: https://www.gov.uk/government/publications/teaching-mathematics-in-primary-schools · https://www.gov.uk/government/publications/development-matters--2 · https://assets.publishing.service.gov.uk/media/5a7ccc06ed915d63cc65ce61/English_Appendix_1_-_Spelling.pdf · https://www.gov.uk/government/publications/letters-and-sounds · https://ncetm.org.uk/copyright · OGL: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
- IM: https://illustrativemathematics.org/?p=17146 · https://im.kendallhunt.com/k5/teachers/grade-1/unit-1/practice.html
- NAEP https://www.nationsreportcard.gov/faq.aspx · TIMSS https://timss.bc.edu/Copyright/ · MELQO https://www.brookings.edu/wp-content/uploads/2017/06/melqo-measuring-early-learning-quality-outcomes.pdf · EGRA https://shared.rti.org/node/257 · STAAR https://tea.texas.gov/student-assessment/staar/staar-released-test-questions · MCAS https://www.doe.mass.edu/mcas/release.html
- Bebras https://bebras.it/btw_bs2017/2017-XY-01-eng.html · Biber https://bwinf.de/fileadmin/wettbewerbe/biber/2025/Biberheft_2025_web_komplett.pdf · Kobras https://kobras.eio.ee/ , https://didaktika.cs.ut.ee/informaatikaviktoriin-kobras/
- Datasets: github.com/openai/grade-school-math · github.com/arkilpatel/SVAMP · github.com/chaochun/nlu-asdiv-dataset · github.com/sroy9/mawps · github.com/google-research/url-nlp (mgsm/LICENSE) · github.com/fchollet/ARC-AGI · github.com/victorvikram/ConceptARC · https://opentdb.com/
- Other: https://www.africanstorybook.org/ · https://openstax.org/details/books/prealgebra-2e · https://www.siyavula.com/read · https://talkbank.org/childes/ · https://langcog.github.io/wordbank-datapage/ · github.com/langcog/wordbank · https://norare.clld.org/contributions/Kuperman-2012-AoA · https://www.bcbl.eu/databases/multipic/ · https://en.wikipedia.org/wiki/Dolch_word_list
- Pictures: github.com/jdecked/twemoji · github.com/googlefonts/noto-emoji · github.com/microsoft/fluentui-emoji · github.com/hfg-gmuend/openmoji · github.com/mulberrysymbols/mulberry-symbols · https://arasaac.org/terms-of-use · github.com/unicode-org/cldr (LICENSE, common/annotations/et.xml)
- Estonian: https://harno.ee/uudised/e-koolikotti-materjale-lisanutel-tuleb-ule-vaadata-litsentsitingimused · https://sonaveeb.ee/about?lang=en · https://metashare.ut.ee/repository/browse/estonian-frequency-dictionary/02b2c91ca0d411eebb4773db10791bcfa9452df115b74ddf90ca2e5baabfbcfa/ · https://www.epa.ee/en/copyright/copyright/what-copyright · https://www.riigiteataja.ee/aktilisa/1250/6202/5011/VV2011_m1_lisa5_2025.pdf · https://digar.ee/arhiiv/en/raamatud/21609
- German/Spanish: https://unterrichten.zum.de/wiki/Hauptseite · https://klexikon.zum.de/wiki/Klexikon:Willkommen_im_Klexikon · https://cedec.intef.es/
