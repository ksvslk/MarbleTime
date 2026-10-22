# Research 4 · Verifying AI-written brain-game questions

Input for the redesign (Oct 7, 2026). Compiled by a research agent that opened every source except Hanley & Lippman-Hand (1983); a few numbers were read from full-text HTML rather than abstracts (MATHWELL per-model range, Tan's 28.7%, Vendrow's 48%, the Estonian r=0.94, Isley-type details); the Pelánek quotes were checked in the PDF text. Strength: **S** strong, **M** moderate, **W** weak. [n] = source number, F = finding.

## 1. Key findings

### A. How often LLM-written items are flawed

1. K–8 maths word problems: teachers rated 15–75% of each model's outputs "solvable, accurate and appropriate"; the best model (a fine-tuned 70B) passed all three on only 74% of problems with executable solutions [1]. M.
2. GPT-4 maths MCQs: 70% of stems/keys/explanations valid, only 37% of distractors/misconceptions/feedback; one key miscalculated [2]. W (4 educators, 20 items).
3. ChatGPT maths help failed human checks on 32% of problems (25–47% by subject); majority vote over 10 samples cut this to 0–2% for algebra, statistics stayed at 13% [3]. M.
4. Reading: 93.8% of GPT-4o's grade 3–12 questions good, but only 42.6% hit the requested inference type [4]; failure modes: wrong label, unclear options, text lacking the evidence [5]; distractors miss real misconceptions [6]. M.
5. Human-made sets have flaws too: 26 of 300 GSM8K items ill-posed and 1 mislabelled; 48% of frontier-model "errors" were benchmark faults [7]; 6.49% of MMLU questions contain errors [8]. S.
6. Age fit: LLMs "do not adapt well to different audiences, even when prompted" [9]; on NAEP items no model–prompt pair matched grade-level students [10]; simulated classrooms correlate 0.75 with real grade-4 item correctness [11] (usable as a starting prior). M.
7. Non-English: accuracy gaps up to 24.3% between high- and low-resource languages [12]; only 33 of 650 LLM-judge papers cover multilingual/low-resource settings [13]; Claude 3.7 Sonnet's judgements of Estonian outputs correlated 0.94 with humans [14]. W.

### B. Verification

8. Running code beats reasoning in text: PAL +15 points over chain-of-thought PaLM-540B on GSM8K [15]; Program of Thoughts ~12% gain [16]; code-based self-verification took GPT-4 on MATH from 53.9% to 84.3% [17]. S.
9. Self-consistency adds 17.9 points on GSM8K, and agreement is "highly correlated with accuracy" [18]; but "self-consistent errors" repeat in every sample, don't shrink with scale, and evade detectors [19]. The 26/35 shape-pattern failure is likely this kind. S/M.
10. Self-checking needs an outside signal: intrinsic self-correction can make reasoning worse [20]; GPT-4 showed "significant performance collapse with self-critique and significant performance gains with sound external verification" [21]; a trained verifier over 100 samples matched a ~30× larger model [22]. S.
11. Seeing the intended answer biases the checker: a GPT-4 judge accepted wrong maths answers 14/20 times by default, 6/20 with chain-of-thought, 3/20 when it solved first [23]; judges "tend to accept" a provided answer [24]; frontier models solve standard word problems with "near-perfect accuracy" [25], so blind solving is a strong signal. M.
12. Errors correlate across models: "Models agree 60% of the time when both models err", more so for larger models, even across providers [26]; mistakes grow more similar with capability, and judges favour similar models [27] and their own outputs [28]; but two models' self-consistent errors overlapped at most 28.7% [19]. M–S.
13. Juries: three smaller models from different families beat a GPT-4 judge (Cohen's κ 0.763 vs 0.627) at 7–8× lower cost [29]; answers change with option order [30]. M.
14. No study reports end-to-end residual error for children's MCQs after combined checks; closest data F1, F3, F5. Rule-based checks found 91% of item-writing flaws on student-written items vs 79% for GPT-4 [31]. W.

### C. Structured outputs

15. Bedrock and Claude structured outputs guarantee schema conformance by constrained decoding (except refusals and max_tokens); no min/max or length constraints; neither vendor claims correctness [32]. Strict formats may hurt reasoning [33] (disputed [34]).

### D. Children's answer data

16. Item statistics: a sound MCQ has a positive key point-biserial and negative distractor point-biserials, smaller for very easy/hard items [35]. Rasch difficulty within ±1 logit needs ~30 respondents, within ±0.5 ~100 [36]. Elo "needs at least 100 students to get good estimates of item difficulty"; 10 answers estimate a child's skill at r≈0.8 [37]. Error rate and median response time reach r≈0.8 at 200 answers per item; discrimination needs "at least 200 answers per item" and is unstable at 1,000 [38]. M–S.
17. Math Garden estimated item difficulty on the fly (3,648 children, 3.5 million answers), aiming for ~75% success [39]. Guessing with k options: P = 1/k + (1−1/k)/(1+e^−(θ−d)) [37]. Families of generated items can be calibrated together [40]. S.

### E. Safety and human review

18. Bedrock Guardrails: content filters, denied topics, word and PII filters, grounding checks, Automated Reasoning. Estonian is "Supported" only for Standard-tier content filters and denied topics; word filters and grounding: English, French, Spanish; Automated Reasoning: English (US). AWS: "Guardrails are ineffective with languages that aren't supported" [41]. S.
19. Zero errors in an audit of N items → 95% upper bound ≈ 3/N; 300 clean items to claim under 1% [42]. S.
20. Vision-language models averaged 58% on trivial counting/overlap tasks [43]; image generators struggle with exact object counts [44]. M.

## 2. Proposed pipeline (any question type)

Rule: the generator's key is a claim; an item ships only when independent checks agree; on disagreement discard and regenerate, never ask the generator to fix it (F10).

1. **Contract** (F15): structured output with prompt, 3 choices, key, language, age, item_type, a machine-readable **scene spec** for the picture, an optional **answer_program** (pure function of the scene spec), and one reason per distractor.
2. **Code checks** (F8, F14, F20): schema; 3 distinct choices; key among them; the picture drawn by code from the scene spec (no free-form image generation); the answer_program run in a sandbox must return the key; age limits, language detection, blocklists.
3. **Blind solving** (F7, F9, F11–13): at least 2 solvers from families other than the generator; they see only what the child sees, options shuffled, 3 runs each; each rates every option correct/incorrect/arguable; ship only if every run agrees with the key and no option is arguable.
4. **Gating by question type** (F9, F12): track rejection rates per type × language × generator; a high rate means survivors share blind spots: quarantine the type; new types start in quarantine.
5. **Age fit and safety** (F4, F6, F18): a jury from other families judges age fit and clarity; Guardrails Standard tier on all text and images; test Estonian explicitly.
6. **Human audit** (F5, F19): review flagged items plus a random sample per type and language; auto-publish a type only after ~300 consecutive clean audits.
7. **Children's answer data** (F6, F16, F17): Elo per child and item with the 3-option guessing formula, starting from age or a simulated classroom, aiming at ~75% success; pool statistics per family; alarms: strong children converging on one wrong option (hide), error rate far above Elo's prediction, long response times, any parent report (quarantine at once); retire a family after ≥200 answers if the key's point-biserial is negative or a distractor's positive.
8. **Realistic residual error** (F1–5, F14, F19): single models 6% to over 50%; best combined result 0–2% (algebra only); code checks plus unanimous cross-family solvers plausibly below 1% for computable types (unproven); interpretive types stay higher; measure with audits (even expert sets run 6–9% flawed).

## 3. Where evidence is weak or missing

No error-rate studies of LLM items for ages 4–10 or in Estonian; no residual-error data for blind cross-family solving plus code checks; LLM judgements of age fit and ambiguity poorly validated (esp. low-resource languages); Guardrails in Estonian undocumented beyond "Supported"; sample-size evidence from school-age learners (remote misclicks add noise); no data on how often children or parents report errors; format-restriction effects disputed.

## 4. Sources

[1] Christ et al. (2024) MATHWELL https://arxiv.org/abs/2402.15861 · [2] Lee et al. (2024) https://arxiv.org/abs/2405.00864 · [3] Pardos & Bhandari (2024) PLOS ONE https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0304013 · [4] Ma, Flor, Wang (2025) https://arxiv.org/abs/2506.08260 · [5] Säuberli & Clematide (2024) https://arxiv.org/abs/2404.07720 · [6] Feng et al. (2024) https://arxiv.org/abs/2404.02124 · [7] Vendrow et al. (2025) https://arxiv.org/abs/2502.03461 · [8] Gema et al. (2024) https://arxiv.org/abs/2406.04127 · [9] Rooein et al. (2023) https://arxiv.org/abs/2312.02065 · [10] Srivatsa et al. (2025) https://aclanthology.org/2025.bea-1.75/ · [11] Acquaye et al. (2026) https://arxiv.org/abs/2601.09953 · [12] Xuan et al. (2025) MMLU-ProX https://arxiv.org/abs/2503.10497 · [13] Doğruöz et al. (2026) https://arxiv.org/abs/2607.02235 · [14] Lillepalu & Alumäe (2025) https://arxiv.org/abs/2510.21193 · [15] Gao et al. (2022) PAL https://arxiv.org/abs/2211.10435 · [16] Chen et al. (2022) PoT https://arxiv.org/abs/2211.12588 · [17] Zhou et al. (2023) https://arxiv.org/abs/2308.07921 · [18] Wang et al. (2022) https://arxiv.org/abs/2203.11171 · [19] Tan et al. (2025) https://arxiv.org/abs/2505.17656 · [20] Huang et al. (2023) https://arxiv.org/abs/2310.01798 · [21] Stechly et al. (2024) https://arxiv.org/abs/2402.08115 · [22] Cobbe et al. (2021) https://arxiv.org/abs/2110.14168 · [23] Zheng et al. (2023) MT-Bench https://arxiv.org/abs/2306.05685 · [24] Yosef et al. (2026) https://arxiv.org/abs/2604.22597 · [25] Strohmaier et al. (2025) https://arxiv.org/abs/2506.24006 · [26] Kim et al. (2025) Correlated Errors in LLMs https://arxiv.org/abs/2506.07962 · [27] Goel et al. (2025) https://arxiv.org/abs/2502.04313 · [28] Panickssery et al. (2024) https://arxiv.org/abs/2404.13076 · [29] Verga et al. (2024) Juries https://arxiv.org/abs/2404.18796 · [30] Zheng et al. (2024) https://arxiv.org/abs/2309.03882 · [31] Moore et al. (2023) https://arxiv.org/abs/2307.08161 · [32] AWS structured outputs https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html ; Anthropic structured outputs https://platform.claude.com/docs/en/build-with-claude/structured-outputs · [33] Tam et al. (2024) https://arxiv.org/abs/2408.02442 · [34] Kurt, dottxt https://blog.dottxt.ai/say-what-you-mean.html · [35] Le (ACER 2012) https://www.acer.org/files/Conquest-Notes-5-ItemPointBiserialDiscrimination.pdf · [36] Linacre (1994) https://www.rasch.org/rmt/rmt74m.htm · [37] Pelánek (2016) Elo https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf · [38] Pelánek et al. (2022) JEDM https://jedm.educationaldatamining.org/index.php/JEDM/article/view/600 · [39] Klinkenberg et al. (2011) https://dare.uva.nl/id/de65bb65-d198-4dbc-ac7b-bc25ca23e627 · [40] Sinharay et al. (2003) https://ideas.repec.org/a/sae/jedbes/v28y2003i4p295-313.html · [41] AWS Guardrails https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html ; https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-supported-languages.html ; https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-tiers.html ; https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-automated-reasoning-checks.html · [42] Newman (1995) JAMA https://jamanetwork.com/journals/jama/article-abstract/389714 · [43] Rahmanzadehgervi et al. (2024) https://arxiv.org/abs/2407.06581 · [44] Binyamin et al. (2024) https://arxiv.org/abs/2406.10210
