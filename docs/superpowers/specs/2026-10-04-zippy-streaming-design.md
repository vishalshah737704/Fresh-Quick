# Ask Zippy: word-by-word streaming

Date: 2026-10-04. Approved to run autonomously by Vishal ("make your judgement"); decisions below were taken by the controller.

## Intent

Zippy's answer currently arrives in one piece after a wait (Z2 dropped streaming when the tool loop arrived; the web chat then moved to a JSON reply for the Z4a cards). Restore word-by-word text on web and mobile for every answer, including ones that use live lookups and cart or checkout cards. Success: the customer sees words appear within about a second of the final answer starting; cards, conversation history, rate limits, privacy rules and the kill switches behave exactly as before.

## Design

1. **Wire format:** one JSON object per line (NDJSON, `Content-Type: application/x-ndjson`), one event type per line:
   - `{"t":"delta","text":"..."}` a piece of answer text.
   - `{"t":"reset"}` discard everything streamed so far in this reply (sent when a round that already streamed text ends in tool calls, because the model's pre-tool preamble is not part of the answer).
   - `{"t":"done","reply":"<full final text>","conversationId":<id|null>,"actions":[...]}` always the last event on success. The client replaces its streamed text with `reply` (so a dropped delta cannot corrupt the final text) and attaches `actions`.
   - `{"t":"error","message":"<friendly message>"}` terminal failure; replaces the in-progress text with the message (as the non-streaming path does today).
2. **Request:** `stream: true` (the existing default) now means NDJSON events; `stream: false` keeps today's single JSON reply (still used by tests and the Z4a flows). The old plain-text streaming branch and the unused `streamChat` in `lib/zippy/client-api.ts` are removed (nothing in the current clients uses them). `actionsEnabled` no longer requires `!stream`, because cards now travel in the `done` event.
3. **Server loop:** `runAgentLoop` yields typed events instead of strings: `{type:"delta"}`, `{type:"reset"}`, `{type:"final", text}`. Each model round is streamed (`messages.stream(...).on("text")`), deltas are forwarded as they arrive; if the round ends in tool calls after streaming any text, a `reset` is emitted; the last round ends with `final`. Max-tokens, refusal, empty-text and tool-error behaviour is unchanged. The non-streaming route just reads `final`.
4. **Persistence and limits:** the assistant message is saved once, after the stream ends, from the final text (never partial); the user message is saved first as today. Rate limits, identity from the session token, retrieval, prompts, tools and cards are untouched. A client disconnect aborts the model call through `request.signal`; nothing is saved for an aborted reply.
5. **Web client:** a pure NDJSON line parser (`lib/zippy/stream-events.ts`, no imports, tested) and `streamChat` rebuilt on it; `ZippyWidget` shows the growing text in the assistant bubble, clears it on `reset`, finishes on `done` (cards appear), shows the error text on `error`, and keeps cancel/new-chat/history behaviour and the Z4a/Z4b lessons (stable message ids, cards survive follow-ups, no empty bubble, per-card state in the widget).
6. **Mobile client:** React Native's global `fetch` does not expose a streaming body; use `import { fetch } from "expo/fetch"` (Expo SDK 57, already installed) for the chat call only. The parser is a byte-identical copy of the web one under `mobile/lib/` (guarded by the parity test). Same UI behaviour as web. If streaming fails to start (older client runtime), fall back to the non-streaming JSON call.
7. **Typing indicator:** show the existing "thinking" state until the first delta; hide it when text starts.

## Out of scope

Changing the model, prompts, tools, retention or rate limits (separate items); streaming tool progress text; persisting partial replies.

## Testing

Unit tests: the event parser (split lines across chunks, bad lines skipped, unknown types ignored, `done` carries actions), the loop's event sequence (delta then final; tool round with streamed text emits reset; refusal/max_tokens/empty), and the route's event encoder as a pure function. Live: curl shows several `delta` lines arriving over time, then `done` with the same text; a cart-card request streams text and delivers the card in `done`; a lookup question streams only the final answer (reset when the preamble was streamed); error and abort behave; a real-browser run shows text growing and the Confirm card at the end. A phone check stays Vishal's.
