// Single source of truth for the one-time historical credit card import.
// Imported by both the API route and the client SyncButton, so keep this
// file free of server-only dependencies.
//
// Moved forward from 2026-05-01 on 2026-09-30: everything before August is
// already in Supabase, and re-pulling it only lengthened the import.
export const HISTORICAL_IMPORT_START = '2026-08-01';
export const HISTORICAL_IMPORT_START_LABEL = 'Aug 1, 2026';
