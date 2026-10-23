# Feature requests for Amazon

## Critical: an Earned Time API for Fire TV
Let a parent-approved app add screen time to a child's Amazon Kids profile, on Fire OS and Vega. Today a parent has to tap "bonus time" in the Parent Dashboard by hand. Full proposal: docs/07-earned-time-api.md.

## Important: tell a parent-approved app which kid profile is active, and when its time is used
On a shared TV an app can't know who is watching, so a time-budget app has to ask before every session, and kids can pick a sibling's time. An on-device call for the active kid profile (for profiles the parent shared with the app) plus a "time used" event about once a minute would let the app's own display of time left stay true without any lock-screen or usage-access tricks. Part of docs/07-earned-time-api.md (§2).

## Important: a dictation API for the app in front, and the same voice typing from the Fire TV phone app
A kid who can't type should be able to say what their new character is. Today the only way spoken words reach an app is the system keyboard's voice typing, and only from the hardware remote's microphone key (the Video Skills Kit, the one API that passes on what was said, takes no new partners and is for video search): the Fire TV phone app's microphone always goes to Alexa, which answers with a search page over the app (FRICTION_LOG, Oct 12). Ask: (1) a dictation API for the foreground app (hold the voice button → the app receives the transcript, with its own on-screen prompt, no keyboard over the screen), on Fire OS and Vega, with the family's language among the supported ones; (2) the phone app's microphone dictating into the keyboard whenever the keyboard offers voice typing; (3) the microphone key staying in the app whenever one of its text fields is selected, keyboard open or not (today a closed keyboard sends it to Alexa search); (4) documentation of when voice typing is offered (plain text fields only, supported locales, a connected voice remote, the keyboard open, not in Amazon Kids…).

## Important: a settings UI for trusted family apps' permissions on Fire OS
Usage access, display-over-other-apps and accessibility can only be granted over ADB today, so parents can't set up a family app that needs them without a computer.

## Important: Amazon Polly voices in Estonian, and conversational voices for characters
Polly has Finnish but no Estonian. MarbleTime reads its lines aloud for kids who can't read yet, in the family's language, and its cartoon characters talk. With no Estonian voice on Polly, our local setup uses another provider for all four languages (English, Estonian, German, Spanish), so that the TV keeps one narrator's voice. Polly's neural voices also sounded flat for cartoon characters (FRICTION_LOG, Oct 7). Lively, conversational character voices, children's among them, would let the characters use Polly too.

## Important: Amazon Kids on Fire TV in more countries
Amazon Kids profiles aren't offered on Fire TV in Estonia. MarbleTime's Amazon Kids mode builds on them; where they aren't offered, families need a sideloaded strict mode instead. At least a list of countries in the docs, and a way for developers to test Amazon Kids anywhere.
