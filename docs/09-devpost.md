# 09 · Devpost submission text

Copy-ready text for the Devpost form. The feedback field takes [FEEDBACK.md](../FEEDBACK.md), the feature requests
field [FEATURE_REQUESTS.md](../FEATURE_REQUESTS.md) and the friction log field [FRICTION_LOG.md](../FRICTION_LOG.md).

## Name

MarbleTime

## Elevator pitch

Kids earn TV time with real-life jobs. A jar of marbles on Fire TV shows today's time; a parent's "yes" on the phone
drops new ones in, and extra jobs earn a talking character the kid invents.

## Tracks

- Fire TV
- AWS Builder mini-challenge (how MarbleTime uses AWS is in the feedback answer)

## About the project

### Inspiration

In many homes TV time is a daily negotiation. Amazon Kids can set limits, but it gives kids no way to earn time, so
parents keep score in their heads. We wanted the TV itself to show the deal: how much is left today, and what a job
is worth.

### What it does

- **The jar is today's TV time.** Each kid has a jar of marbles on the TV, and one marble is 10 minutes. The jar's
  size is the daily maximum from health guidance (60 minutes under 7, 90 from 7). Every day starts with it half
  full: that half is given, never earned.
- **Jobs fill the rest.** Parents write the jobs in the phone app ("Toys away"). The kid picks one with the remote
  and says "I did it!". The parent gets a notification with "Yes" and "Not yet", and on a yes the marbles drop into
  the jar on the big screen.
- **Extra effort earns a character.** A job done when the jar is already full, or five puzzle stars, earns a new
  character. The kid types what it should be ("a dragon who loves pancakes"), an AI draws it, code and a second
  model check the drawing, and the character waves and talks on the TV.
- **For kids who can't read yet**, the Fire OS app reads every line aloud, in English, Estonian, German and Spanish.
- **Three ways to enforce the time**, set per TV:
  - *Amazon Kids:* Amazon Kids keeps its own daily limit, and the phone app tells the parent how many earned minutes
    to add as bonus time (the Appstore path, on Fire OS and Vega).
  - *Strict* (a sideloaded Fire OS prototype): a native service counts the time each kid watches in any video app,
    locks video apps when a jar is empty or at bedtime, and keeps the TV's settings and the uninstall screen behind
    the parents' PIN.
  - *API demo:* the same flow on the Earned Time API we propose to Amazon.

### How we built it

- **One React Native codebase**, from Amazon's multi-TV starter, built for Fire OS (Expo TV) and Vega OS, with
  platform files only where the two differ.
- **Strict mode** is a Kotlin Expo module: a foreground service that uses Android's usage stats and an overlay. Its
  rules sit in a pure engine with unit tests.
- **The phone app** is a React web app with push notifications.
- **The backend** is TypeScript, contract first (OpenAPI), and the same code runs locally and on AWS: API Gateway
  (HTTP, and WebSocket for live updates), Lambda, DynamoDB, Cognito, S3 and CloudFront, deployed with the CDK.
- **Characters:** an art-director model turns the kid's words into a brief, a drawing model writes a layered SVG,
  code checks it (size, position, a mouth that can open to talk), and a second model looks at the rendered picture.
- **Puzzles** come from banks written by AI ahead of time and checked by code.
- **Every design number** is backed by research (screen-time guidance, rewards and motivation) or marked as an
  assumption to test, with sources in the repo.
- A coding agent (Claude Code) did most of the building and checked each TV change on a real Fire TV Stick 4K Plus
  over ADB, or on the Vega Virtual Device.

### Challenges we ran into

- **Bedrock was blocked on our new AWS account** ("Error 002") for the whole hackathon, for every model. The backend
  is wired for Bedrock. For the prototype the characters are drawn by Google's Gemini on a local server, and Google's
  terms don't allow that in apps for children, so it isn't how MarbleTime would ship.
- **Amazon Kids isn't offered on Fire TV in Estonia**, where we built MarbleTime, so the Amazon Kids mode follows the
  docs but couldn't be tried.
- **An app can't hear what a kid says to the remote**: the microphone always goes to Alexa. So kids type their
  character's description, or a grown-up types it in the phone app.
- **Vega failures without errors:** buttons ignored OK until the manifest listed two audio services, and links and
  fonts failed silently.
- **Closing gaps in strict mode:** our lock tests found that a kid could stop the app from the TV's settings, so the
  settings now ask for the PIN.

### Accomplishments that we're proud of

- On a real Fire TV Stick, strict mode puts YouTube, Prime Video and Netflix behind "Who's watching?" within a second
  of opening, "Alexa, open YouTube" included.
- The same app runs on Fire OS and on the Vega simulator.
- 614 automated tests across the backend, the phone app, the TV's rules and the strict-mode engine.
- 34 friction log entries, each with steps, a workaround and a suggestion.

### What we learned

- Research favours a daily budget with a part kids always get over paying for every task. The jar makes that budget
  visible to a kid who can't read the clock.
- On Fire OS an app can enforce time only with a lock screen and permissions granted over ADB, and on Vega not at
  all. That is why the platform needs an API for it.

### What's next for MarbleTime

- The **Earned Time API**: one call for a parent-approved app to add time to a kid's Amazon Kids profile, on Fire OS
  and Vega. Strict mode is a prototype of what it would do.
- Bedrock for the characters once our account may use it. Polly in Estonian would let all four languages use AWS
  voices.
- Human-made puzzles where they exist, starting with Oak National Academy's free quizzes for ages 5–11 (in English).
- Sound on Vega, and an Appstore release of the Amazon Kids mode.

## Built with

react-native, react-native-tvos, expo, vega-sdk, kotlin, typescript, react, vite, aws-lambda, amazon-api-gateway,
amazon-dynamodb, amazon-cognito, amazon-s3, amazon-cloudfront, aws-cdk, amazon-bedrock, gemini, web-push,
claude-code

## Links

- Code: <https://github.com/ksvslk/MarbleTime>
- TV builds (Fire OS APK, Vega packages, Demo Cartoons): <https://github.com/ksvslk/MarbleTime/releases/latest>
- Phone app (sign up with an email address): <https://d3uyrtcal2s4t9.cloudfront.net>
- Video: to come

### Testing instructions (for the Devpost field)

The backend and the phone app run on AWS until Nov 20. Sign up in the phone app with an email address. Install the TV
app from the release page (Fire TV: `adb install MarbleTime-fireos.apk`; Vega Virtual Device: `vega run-app
MarbleTime-vega-aarch64.vpkg app.marbletime.tv.main -d VirtualDevice`). The TV shows a QR code and a six-letter code:
in the phone app, open TVs and scan it, or type the code. Step by step, with strict mode's two `adb` commands and the
demo clock: "Try it without building" in the README. On AWS, new characters can't be drawn yet (Amazon Bedrock is
blocked on our account, "Error 002"), and voices are Amazon Polly's (English, German, Spanish).

## Still to fill in

- The video link, after upload.
