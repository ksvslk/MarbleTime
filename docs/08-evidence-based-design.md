# 08 · Evidence-based redesign (draft for decision, Oct 7, 2026)

The founder rejected the reward/time values and game rules as chosen without evidence. This redesign rebuilds them from five research reports in [research/](research/):

| # | Report | Key sources |
|---|---|---|
| R1 | [Screen-time guidance and earned screen time](research/01-screen-time.md) | WHO 2019; Estonian TAI 2025 (checked by us); Canada, Sweden, Norway, AAP 2026; Tang 2018; Epstein 2008 RCT |
| R2 | [Rewards, motivation, chores, praise](research/02-rewards-motivation.md) | Deci, Koestner & Ryan 1999; Lepper 1973/1982; token-economy reviews; Kamins & Dweck 1999; Pinquart 2017 |
| R3 | [Learning-game design](research/03-learning-games.md) | feedback meta-analyses; Math Garden / Elo (Pelánek 2016); Estonian curricula and Soodla & Palu 2022 (checked by us) |
| R4 | [Verifying AI-written questions](research/04-ai-verification.md) | PAL; self-consistency; Kim et al. 2025 correlated errors (checked by us); juries; item statistics |
| R5 | [Open question banks](research/05-open-question-banks.md) | Oak National Academy (OGL v3, checked by us); CLDR; Estonian sources |

Each rule below names its evidence. **[A]** marks an assumption: no study gives the value, so it ships as a parent-adjustable setting and is measured (§8).

## Decisions (Oct 7, with the founder)

1. **This entry is chores → TV time only.** Brain games are dropped: once they stop paying TV time (§3) they no longer connect to the core loop, and they bring the hardest problems (correct questions, age fit, a blocked Bedrock). §3–§5 and research R3–R5 stay for later.
2. **The jar is today's budget**: its size is the daily ceiling (60 min under 7, 90 by default from 7, at most 120); every day starts with the base (half the ceiling); a marble is 10 minutes; jobs are worth 1–3 marbles. Marbles a kid earned never disappear: they wait until used or handed off, and the jar never shows more than the ceiling.
3. **Routine jobs**: the parent can mark a job routine; it is praised but earns no marble (§2.4).
4. **Extra jobs earn a new character.** A job approved when the jar is full earns a character token instead of time: a creative reward the kid directs, not random (no loot-box mechanics, R2 F13) and not more screen time.
5. **Characters are drawn from the kid's own words** (English only for now), spoken into the parent's phone (Amazon Transcribe, en-US) or typed. The TV remote can't be used: the stick offers apps no speech service (checked: `query-services android.speech.RecognitionService` → none) and its voice button belongs to Alexa. Pipeline: an *art director* model turns the words into a character card in a strict schema (brands removed, scary made friendly, mild cartoon props allowed) → a *drawing* model makes an SVG with named, pivoted parts → code checks it and sends its exact errors back for repair → a second model checks the picture (kid-friendly, not a copy of a known character, matches the card). No ready-made character is ever swapped in; parents can remove any character.
   - Measured with Gemini 3.8 Flash (Oct 7, 100 varied kid ideas): 98/100 valid on the first try, 100/100 after one repair (both failures: a shirt number drawn as text), median 23 s (90% under 44 s, slowest 141 s), 1.26 cents each. One rate-limit error, retried.
   - The same test showed why the art director and the picture check are required: "Spiderman but a duck" came out in a Spider-Man suit despite the drawing rules, and "a big scary skeleton" was too scary for small kids.
6. **Characters speak short pre-written lines in context**, lip-synced ("You did it, Mia! Let's wait for Dad."), with Polly's child voices and its viseme marks. No AI-written speech. No dialogue between characters and no scenes in this entry.
7. **"Who noticed"**: parents set their name as kids see it, and the celebration says "– Dad" (§2.3).

## 1. Time: a daily budget, not a wage

1. **A hard daily maximum for everything on the TV** (base + jobs + games + bonuses), from national guidance (R1 §1–2):
   - **Under 7: 60 minutes**, "less is better". Estonia's TAI 2025 (we read the PDF) says "kuni 60 minutit … mida vähem, seda parem" for ages 2–6; WHO, Canada, Sweden and Norway agree.
   - **7 and over: 90 minutes by default, at most 120.** TAI 2025: up to two hours a day besides school ("kuni kahe tunnini päevas"); Norway 60–90, Canada 120.
   - Parents can lower it; nothing can raise it above the guideline for the age. No weekend extra by default: no guideline adds one [A for any weekend setting].
2. **The jar is today's budget.** A full jar is the daily maximum. The day starts with the base already in it; jobs fill the rest. It can't overflow. Why: the best trial was a budget with a ceiling below the child's previous viewing, not earning without a ceiling (Epstein 2008 RCT, R1 F11). Earning designs that worked never let children exceed guidelines (R1 F10–11).
3. **The base is an allowance, given every day, never earned.** Limit-setting is the parenting practice linked to *less* screen time; rewarding or punishing with screens is linked to *more* (Tang 2018; Nagata 2025; observational, R1 F6, R2 F7).
4. **What earns into the jar: real-life jobs only** (§2). Brain games are screen time themselves, so they count toward the maximum and don't buy more of it (§3).
5. **Default split: half the maximum as base, half earnable** [A]. R1 suggests a third to a half earnable; no study gives a number.
6. **A marble is one short session: 10 minutes** [A, anchored]. The marble's size isn't in any study, but TAI 2026 (ages 3–5) recommends sessions of "maksimaalselt 10–15 minutit" with breaks, so a marble is one session-sized unit. Under 7 the jar holds 6 marbles (60 min: 3 given, 3 to earn). From 7 it holds 9 (90 min: 4 or 5 given, 4 or 5 to earn) by default. *This replaces "1 marble = 5 minutes".*
7. **The TV ends sessions, not the parent**, with a gentle countdown and a stop at the end of an episode (in strict mode; Amazon Kids time limits in amazon_kids mode). Technology-mediated transitions worked better than parent-mediated ones (Hiniker 2016, R1 F9).
8. **No TV in the hour before bedtime**, whatever is in the jar (AAP 2026, RCPCH, CPS, Norway; R1 F4). Parents set bedtime once.

## 2. Jobs: how they're rewarded

1. **Jobs earn marbles.** Rewards for low-interest tasks don't harm motivation and may help (Cameron 2001; Deci 1999: dull tasks d=+0.18 n.s.; R2 F4–5).
2. **Fast and dependable.** "I did it!" is acknowledged at once. The marble drops when a grown-up approves, with a same-day approval prompt. A marble in the jar never disappears. The same rules apply whichever grown-up approves. Evidence: immediacy and consistency drive token systems (Hackenberg 2009; Kaminski 2008; R2 F2).
3. **The celebration names the deed and who noticed**, e.g. "You fed Rex! – Dad", with a high-five animation. No trait words ("smart"), no superlatives, no comparisons, no "you should…". Evidence: person praise and over-the-top praise backfire, informational beats controlling feedback, a gesture works as well as effort praise (Kamins & Dweck 1999; Brummelman 2014; Morris & Zentall 2014; Deci 1999 d=−0.78 for controlling; R2 F10). The replication caveat (Li & Bates 2019) means a neutral, specific style rather than mindset slogans.
4. **Jobs fade from paid to routine.** A new job earns a marble every time. After steady success it can become "routine": praised and ticked off, with fewer or no marbles (the parent chooses). Family-wide jobs end as unpaid "family helping"; extra jobs stay paid. Evidence: token gains last when rewards are thinned and replaced by social reinforcement (Regnier 2022, 37 studies); reward charts "should be temporary" (Triple P); material rewards reduced young children's helping (Warneken 2008); routine family chores go with concern for others (Grusec 1996). The threshold ("steady success" = 5 on-time completions) is [A].
5. **Bonuses stay occasional and unexpected**, small, within the maximum. Unexpected rewards don't undermine motivation (d=0.01, Deci 1999).
6. **Marbles can buy non-screen treats too.** Parents add their own ("park trip", "choose dinner"), priced in marbles, so TV isn't the only prize (R1 §2.2, R2 §2.2) [A for usage].

## 3. Brain games: quality screen time, not a way to earn more

1. **Games show progress, not TV minutes.** Expected rewards undermine interest in enjoyable tasks (d=−0.68 for interesting tasks, −0.39 tangible rewards for children; Lepper 1973). "Do A to get B" makes children value A less (Lepper 1982). AAP 2026 counts "frequent rewards for play" as low-quality design (R1 F4, R2 F4, F6). Children see mastery per skill ("Counting: ★★★"). *Alternative if the founder wants games to pay:* one fixed marble a day for finishing a session, paid in full regardless of score. That's the least harmful form (d=−0.15, against −0.80 for graded pay), and still never per correct answer.
2. **One answer counts.** A wrong tile is marked calmly (no buzzer); the right answer is shown and read aloud with a one-line reason tied to the picture ("5 and 2 more is 7"); then the game moves on, and a similar question comes later or tomorrow. Evidence: explanation beats showing the answer, which beats right/wrong (Van der Kleij 2015: 0.49 / 0.32 / 0.05); "answer until correct" breeds trial and error (Baker 2004 r=−0.38; Callaghan 2018); low achievers gain more from seeing the answer (Shute 2008) (R3 F3–7).
3. **Guards against guessing**: taps before the question has been read are ignored; the right tile's position varies; repeated fast misses suggest a break. Math Garden's scoring "discourages fast guessing" (R3 F9).
4. **Read the question and the choices aloud for under-8s**; anyone can replay (Li 2014 read-aloud meta-analysis, R3 F15).
5. **Short daily sessions, ending on a success, no timers**: about 5 questions at 4–6, 10 at 7–10 [A, anchored]. Attention develops fast between 5–6 and 8–9 (Betts 2006), spaced daily practice beats blocks (Vlach & Sandhofer 2012), and time-pressure evidence is thin (R3 F15).
6. **Difficulty adapts to each child, not to an age table.** It uses an Elo rating per child and per skill, with the guessing correction for three tiles: P = 1/3 + (2/3)·logistic(θ − d) (Pelánek 2016). It aims at roughly 75–85% right on the first try: Math Garden ran at about 75%, and higher success meant more practice and larger gains (Jansen 2013). The 85% rule is only theory (Wilson 2019), so the exact target is [A]. Skills and difficulty features are tags the content declares (e.g. "add, within 5"), so any new kind of game joins without code changes.
7. **Cold start one step below the age's curriculum level**, then about 10–15 answers place the child (Pelánek 2016: r≈0.8 after 10 answers). In Estonia, adding and subtracting within 5 is the preschool level for ages 6–7; 89% of school starters manage it (Soodla & Palu 2022, which we read). That's why "14 − 6" was wrong for a 6-year-old. Parents can nudge the level.

## 4. Where questions come from

1. **Human-made open sets as a gold bank.** Oak National Academy quizzes are OGL v3 (we read the licence: commercial use allowed, attribution required, free API key). That's thousands of ages 5–11 items, many already 3-choice with pictures. They're used in English as they are, as difficulty anchors for the Elo scale, and as style examples for the AI (R5). Every item keeps its source and credit line.
2. **AI writes the rest, in any language and any kind**, against skill tags and a target difficulty. It is checked by §5 before any child sees it. Estonian has no open item bank (R5), so Estonian depends on AI plus checks plus native review (the founder, for now).
3. **Pictures are drawn by code from a scene description** (objects, counts, order), never generated as images. Vision and image models fail at simple counts (R4 F20). Picture words come from Unicode CLDR names in all four languages (R5).

## 5. How we know a question is right (any kind of question)

The generator's answer is only a claim. A question ships only when independent checks agree. On any disagreement it's discarded and regenerated, never "fixed" by the generator, because self-critique without an outside signal makes things worse (Huang 2023; Stechly 2024; R4 F10).

1. **Strict schema**: guarantees the format only, not correctness (R4 F15).
2. **Answer program**: the generator also writes a tiny pure function that computes the answer from the scene description; a sandbox runs it and it must return the key. Running code beats reasoning in text (PAL; Program of Thoughts; GPT-4 on MATH 53.9% → 84.3% with code verification, R4 F8).
3. **Blind solvers from other model families**: at least two, seeing only what the child sees, choices shuffled, several runs each. Each rates every choice correct, incorrect or arguable; the question ships only if all agree with the key and none is arguable. Why blind: a judge shown the intended answer accepted wrong maths 14 of 20 times, against 3 of 20 when it solved first (Zheng 2023). Why other families: errors correlate, "models agree 60% of the time when both models err", especially strong models (Kim 2025, which we read). Why juries: three diverse models beat one large judge (Verga 2024, κ 0.763 vs 0.627) (R4 F11–13). On Bedrock: Claude writes, and Nova plus one open-weight family on Bedrock (Llama, Mistral or Qwen) solve.
4. **Quarantine by question kind**: rejection rates are tracked per kind × language × generator. A kind with a high rejection rate (Gemini's patterns: 26 of 35) is quarantined, because its survivors probably share the same blind spot ("self-consistent errors", Tan 2025, R4 F9). New kinds start in quarantine.
5. **Content safety**: Amazon Bedrock Guardrails content filters on all text. Estonian is "Supported" for content filters and denied topics only (R4 F18), so Estonian is also covered by the solvers' review and the human audit.
6. **Children's answers keep checking**:
   - Alarms: strong children converging on one "wrong" choice hides the item at once (likely a wrong key); an error rate far above the Elo prediction flags it; any parent report quarantines it.
   - After about 200 answers per question family, a family is retired if the key's point-biserial is negative or a distractor's is positive (Pelánek 2022; R4 F16).
7. **Human audit**: a random sample per kind and language, plus everything flagged. A kind publishes automatically only after about 300 consecutive clean audits; zero errors in N items gives a 95% bound of about 3/N, so 300 clean items support "under 1%" (R4 F19).
8. **Honest residual error**: single models run from about 6% to over 50% flawed; even expert-made sets run 6–9%. With code checks plus unanimous cross-family solvers, under 1% is plausible for kinds code can compute; it's unproven, and higher for interpretive kinds. We measure it by audit rather than claim it (R4 F1–5, F14).

## 6. Taking time away

1. **Narrowed to a logical consequence.** Taking earned time away is allowed only for breaking a TV rule agreed in advance (e.g. not switching off when time is up), in small steps. It never removes marbles already in the jar; today's remaining time is shortened instead. It shows a neutral reason, with no sad animation and nothing shown to siblings.
   - Response cost works about as well as rewards but lowered motivation in one study (Iwata & Bailey 1974; Carlson & Tamm 2000).
   - Screens as punishment go with more screen time (Tang 2018, observational).
   - Harsh or psychological control is linked to more problem behaviour (Pinquart 2017, 1,435 studies).
   - Logical consequences belong to effective programmes (Leijten 2019) (R1 F6, R2 F11–12).
2. **Parents see their week**: time given vs taken, with a gentle flag if taking dominates [A for the threshold].

## 7. What we don't build

Random or mystery rewards, spin wheels, double-or-nothing, daily-login rewards, breakable streaks, expiring marbles, countdown pressure in games, sibling leaderboards, guilt-tripping characters. Variable-ratio schedules underpin gambling (Drummond & Sauer 2018); loot boxes are linked to problem gambling in teens (Zendle 2019); EU DSA guidelines ask to switch off streaks for minors by default (2025) (R2 F13–14).

## 8. What we measure (every [A] above is a setting tuned by these)

TV minutes per day vs before install; share of days at the maximum; fuss at session end (one-tap parent rating); jobs done during and after fading; games played after the cap and without marbles; how often parents take time away; first-try success per child and skill; flagged and audited questions per kind and language; time to approval.

## 9. What changes from today

| Today | Redesign | Evidence |
|---|---|---|
| Daily base 30 min + unlimited earning | Daily maximum by age (60 / 90–120); base = half; the jar can't overflow | R1 F1–2, F10–11 |
| 1 marble = 5 min | 1 marble = one 10-minute session [A, anchored to TAI 2026] | R1 F4 |
| Games pay 2 marbles, up to 4 a day | Games show progress; no TV minutes (or one fixed daily marble, if chosen) | R2 F4, F6; R1 F4 |
| Tap until right | One answer counts; show and explain the right answer | R3 F3–7 |
| Age bands 4–5 / 6–7 / 8+ in the prompt | Elo per child and skill; cold start from the curriculum level | R3 F9–12 |
| AI's answer trusted after rule checks | Answer program + blind cross-family solvers + kids' data + audits | R4 |
| AI-only questions | Open gold bank (Oak, English) + AI for the rest | R5 |
| Take away any earned minutes, any reason | Only for pre-agreed TV rules; never removes marbles | R2 F11–12 |
| Jobs paid forever | New jobs paid, then faded to routine (parent's choice) | R2 F3, F8–9 |
