# Feature requests for Amazon

## Critical: an Earned Time API for Fire TV
Let a parent-approved app add screen time to a child's Amazon Kids profile, on Fire OS and Vega. Today a parent has to tap "bonus time" in the Parent Dashboard by hand. Full proposal: docs/07-earned-time-api.md.

## Important: tell a parent-approved app which kid profile is active, and when its time is used
On a shared TV an app can't know who is watching, so a time-budget app has to ask before every session, and kids can pick a sibling's time. An on-device call for the active kid profile (for profiles the parent shared with the app) plus a "time used" event about once a minute would let the app's own display of time left stay true without any lock-screen or usage-access tricks. Part of docs/07-earned-time-api.md (§2).

## Important: a dictation API for the app in front, and the same voice typing from the Fire TV phone app
A kid who can't type should be able to say what their new character is. Today the only way spoken words reach an app is the system keyboard's voice typing, and only from the hardware remote's microphone key (the Video Skills Kit, the one API that passes on what was said, takes no new partners and is for video search): the Fire TV phone app's microphone always goes to Alexa, which answers with a search page over the app (FRICTION_LOG, Oct 12). Ask: (1) a dictation API for the foreground app (hold the voice button → the app receives the transcript, with its own on-screen prompt, no keyboard over the screen), on Fire OS and Vega, with the family's language among the supported ones; (2) the phone app's microphone dictating into the keyboard whenever the keyboard offers voice typing; (3) the microphone key staying in the app whenever one of its text fields is selected, keyboard open or not (today a closed keyboard sends it to Alexa search); (4) documentation of when voice typing is offered (plain text fields only, supported locales, a connected voice remote, the keyboard open, not in Amazon Kids…).

## Important: a settings UI for trusted family apps' permissions on Fire OS
Usage access, display-over-other-apps and accessibility can only be granted over ADB today, so normal parents can't set up a family app that needs them.

## Nice to have: a keep-awake API for non-media Vega apps
A chore board that stays on screen in the living room shouldn't need to pretend to play media to keep the TV awake.

## Important: Amazon Polly voices in Estonian (and Latvian, Lithuanian)
Polly has 40 languages, Finnish among them, but no Estonian, Latvian or Lithuanian. MarbleTime reads every line aloud for kids who can't read yet, in the family's language. With no Estonian voice on Polly, we moved all four languages (English, Estonian, German, Spanish) to another provider, so that the TV keeps one narrator's voice. Small languages are where a family app most needs a good voice, because few other options exist.

## Important: Amazon Kids on Fire TV in more countries
Amazon Kids profiles aren't offered on Fire TV in Estonia (and, it seems, most countries). MarbleTime's Amazon Kids mode builds on them; outside the supported countries families need a sideloaded strict mode instead. At least a list of countries in the docs, and a way for developers to test Amazon Kids anywhere.
