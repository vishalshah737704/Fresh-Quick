// Set once, at module load, the first time any server code imports this
// file after the Next.js server process starts (dev server boot, or a
// fresh production process). Used to detect "the server restarted since
// this browser tab last checked" so a stale client-persisted Supabase
// session can be forced to log out — see app/api/auth/server-epoch and
// components/SessionEpochGuard.tsx.
//
// Limitation: in a multi-instance/serverless deployment (multiple Node
// processes or edge/serverless invocations behind one origin), each
// instance has its own epoch, so a client could bounce between two
// "different" epochs across requests and get signed out more often than
// intended. Fine for this project's single self-hosted Node process; would
// need a shared store (e.g. a value in Postgres) to be correct behind a
// load balancer.
export const SERVER_START_EPOCH = Date.now();
