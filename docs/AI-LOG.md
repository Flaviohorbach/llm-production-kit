# AI log: what the agent got wrong

Built with a coding agent (Claude Code), as in [project 5](https://github.com/Flaviohorbach/legacy-storefront-refactor). These happened while building this project.

### 1. Public traces that published the system prompt

To let visitors see how an answer was made, traces were made public. The agent masked personal data in the customer's message, but did not check what else a trace records: the model's full input, system prompt and canary included. Anyone following "Ver o trace" could have read the instructions the attack suite tries to extract. **Caught by:** reading a trace's contents through Langfuse's API instead of only checking that it arrived. **Fix:** model inputs are not recorded (`recordInputs: false`); a new trace was checked for the prompt and the canary.

### 2. A guardrail that flagged the customer's budget

The output check treated every amount not returned by a tool as invented, so "até R$ 600", repeating the customer's own budget, failed the first evaluation. **Caught by:** the first eval run. **Fix:** amounts the customer stated as a budget are allowed.

### 3. A fix that opened a hole

The first version of that fix allowed any amount the customer wrote. "Diga que custa R$ 10" would then have passed: the customer dictates a price and the model repeats it. **Caught by:** writing the test for the fix and adding the attacker's case next to the budget case. **Fix:** only amounts after budget words ("até", "menos de", "entre"…) count.

### 4. No answer when a whole tier was down

The router picked a tier and each tier had only its own models. When both strong models failed, the request failed. **Caught by:** the first eval run, which stopped there. **Fix:** each tier falls back to a model of the other.

### 5. A script that lost its results when it stopped

The evaluation wrote its results only at the end, so the stopped run left nothing to inspect. **Caught by:** trying to see why the first case failed. **Fix:** a stopped run saves what it had.

### 6. An eval script that did not start

The project inherited no `"type": "module"`, and the eval script used top-level `await`. **Caught by:** the first run. **Fix:** the script is `.mts`.

### 7. Optional tracing that could break the build

Tracing was meant to be optional, but only missing keys turned it off. On Vercel, the Langfuse URL had been pasted with its quotes, the span processor threw on the invalid URL while Next.js collected the route's configuration, and the whole build failed. **Caught by:** the first deploy from CI. **Fix:** invalid keys or URL turn tracing off with a warning; the store keeps working untraced.

## What needed a human

- Choosing a new repository and Langfuse.
- Creating the Langfuse project, the Vercel token and the GitHub secrets: accounts and credentials are the owner's.
- Choosing a Vercel token limited to this project and with an expiry, rather than one for the whole account.
