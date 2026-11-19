# Frontend

- `ui/` is the temporary setup lobby test UI: plain React/CSS, no router or UI library.
  Home restores GET /api/session. Create includes name, theme select, topic textarea and duration
  select; join needs only name/code. Lobby shows fixed setup for both players, plus seats,
  ready/connected/left state, bothReady, code/copy, expiry, connection status and raw JSON debug.
  Keep this small; the v1 UI port is still deferred to the last slice.
- `ui/src/lib/api.ts` is the only HTTP entry point. Typed session/create/join/ready/leave
  functions (including setPosition and startDebate) parse shared contract schemas; ApiError preserves the server's code and message.
  Bodiless POSTs have no JSON Content-Type. Single-flight refresh and one retry are shared
  between HTTP and the exported refreshAccess used by socket auth recovery.
- `ui/src/lib/socket.ts` connects only while in a room. It parses RoomSnapshotEvent, accepts
  equal/newer versions of the same room, ignores lower ones, accepts a new room's own version
  sequence and disconnects on null. SESSION_EXPIRED refreshes and reconnects once per auth
  failure sequence; a successful connection resets the retry allowance. Disposal prevents a
  pending refresh from reconnecting a departed lobby.
- Waiting shows Waiting for opponent with no ready control. Positions shows your editor/save,
  opponent read-only text, and Ready/Not ready (save changes first). Planning freezes inputs
  and shows Preparing the debate until the plan arrives, then subtopics, allocation and openers.
  Only the host sees Start, disabled with a reason until the plan and both connections exist.
  Debate shows a 3-2-1 countdown from startsAt/serverNow plus monotonic elapsed time since
  receiving the snapshot, then Debate started. Reconnects use the remaining server deadline;
  the click never starts a local three-second timer. lib/debate.ts helpers have Node tests.
  During debate the transcript shows public announcements/arguments labelled with seat/name,
  two chess clocks and an own-turn Send form. Clock display uses the same server deadline/
  elapsed-time helper as countdown; inactive clocks stay still. Raw text is counted in code
  points (600), and 12 arguments disables Send with a clock-keeps-running explanation.
  A pending message's UUID/ordinal/text survive a network failure; retry reuses them. Edits
  or a changed subtopic produce a new key; successful submissions clear the draft. Ended shows
  Debate ended and the retained transcript. HTTP calls go through api.ts submitMessage.
  Draft text resyncs only on saved-position
  or room changes, so unrelated presence pushes do not erase typing.
- App state drives home/lobby; a ref keeps current version checks synchronous across HTTP and
  socket callbacks. UNAUTHENTICATED clears the room and returns home. API health stays in the footer.
- Dev: Vite on 5173 proxies /api and /socket.io (including WebSockets) to API 4000.
  Compose: nginx on 3000 serves the built UI and proxies the same paths; no URLs are hardcoded.
- UI tests run in a Node Vitest project without a DOM dependency: HTTP contracts, shared refresh,
  socket recovery/disposal, payload validation and version ordering. UI is outside the requested
  server/shared coverage thresholds.
- Test two identities in a normal browser window and a private window (or separate profiles).
  Two normal tabs share the same cookies and intentionally represent the same player.
- At the UI port, docs/inventory.md lists the v1 files and planned Next.js-to-Vite changes.
