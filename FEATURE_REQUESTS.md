# Feature requests for Amazon

## Critical: an Earned Time API for Fire TV
Let a parent-approved app add screen time to a child's Amazon Kids profile, on Fire OS and Vega. Today a parent has to tap "bonus time" in the Parent Dashboard by hand. Full proposal: docs/07-earned-time-api.md.

## Important: a settings UI for trusted family apps' permissions on Fire OS
Usage access, display-over-other-apps and accessibility can only be granted over ADB today, so normal parents can't set up a family app that needs them.

## Nice to have: a keep-awake API for non-media Vega apps
A chore board that stays on screen in the living room shouldn't need to pretend to play media to keep the TV awake.

## Important: Amazon Polly voices in Estonian (and Latvian, Lithuanian)
Polly has 40 languages, Finnish among them, but no Estonian, Latvian or Lithuanian. MarbleTime reads every line aloud for kids who can't read yet, in the family's language; for Estonian families we had to use another provider for that one language, while English, German and Spanish use Polly neural voices. Small languages are where a family app most needs a good voice, because few other options exist.

## Important: Amazon Kids on Fire TV in more countries
Amazon Kids profiles aren't offered on Fire TV in Estonia (and, it seems, most countries). MarbleTime's Amazon Kids mode builds on them; outside the supported countries families need a sideloaded strict mode instead. At least a list of countries in the docs, and a way for developers to test Amazon Kids anywhere.
