# Feedback on the tools we used

Kept current during the build; it becomes the Devpost feedback answer.

## Vega SDK, CLI and Vega Virtual Device
- The installer can run unattended (`NONINTERACTIVE=true`), which made it easy for a coding agent to install. It also links `kepler` → `vega` for older scripts.
- See FRICTION_LOG.md for the log-output issue.

## Fire OS / ADB, Expo TV
- (to come)

## Amazon Devices Builder Tools (MCP + skills)
- (to come)

## AWS: CDK, Lambda, DynamoDB, Cognito, Bedrock
- `aws login` (AWS CLI 2.32+) gave the agent short-term credentials from a browser sign-in, with no access keys or SSO setup.
