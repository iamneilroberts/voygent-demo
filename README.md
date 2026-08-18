# voygent-demo

A public, interactive demo of Voygent, an AI travel-planning agent that runs the whole planning loop inside a chat client. It's live at [demo.voygent.ai](https://demo.voygent.ai).

The part worth a look for engineers is the honesty layer. Featured trips replay a recorded session, so they run cheaply and deterministically, while an off-menu trip runs fully live against real supplier search. The UI tells you which one you're seeing, and `?faithful=1` forces a fully-live run. The goal was an AI demo you can actually check, because a lot of AI demos quietly fake the impressive parts.

## Engineering deep dives

I write up the engineering as I go, at [demo.voygent.ai/blog](https://demo.voygent.ai/blog). Each post takes one real problem from building this and leaves the dead ends and the numbers in:

- Making an AI feature you can verify
- The bot-defeat saga
- Context economics
- Record/replay engineering
- Cost engineering
- Trip integrity: the data is the product
- Keeping the model on track (the phase machine)
- Choosing the model, and why the demo is LLM-agnostic

## Stack

Cloudflare Workers for the MCP server and agent loop, KV and D1 for state, and a small React client. The featured trips are backed by record/replay fixtures. The `/blog` and `/info` pages are server-rendered from an editable content store rather than the SPA bundle, so they stay fast and edit-in-place.
