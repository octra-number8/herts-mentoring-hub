/**
 * AI-assisted library search: PREPARED, NOT ENABLED.
 *
 * Nothing in the Hub calls an AI service today. This module records the agreed
 * design so a future release can switch it on deliberately, after review by
 * Provincial leadership and the data protection lead.
 *
 * Principles
 * 1. No external AI processing of confidential content. Only content that is
 *    already published to a wide audience may ever leave the Hub: published
 *    knowledge articles with audience `learning` or `mentors`, and published
 *    document versions classified `learning` or `mentors`. Never `internal` or
 *    `leadership` documents, drafts, notes, support requests, confidential
 *    concerns, member records, contacts or anything from an import.
 * 2. Permissions first. Retrieval runs as the signed-in user through
 *    `search_all` / RLS (never the service role), so an answer can only draw on
 *    what that user could already open. Every answer cites the documents used.
 * 3. Retrieval before generation. Embeddings, if used, are computed for the
 *    eligible content only and stored in the Hub's own database (pgvector),
 *    keyed by document version so revisions and archiving remove stale text.
 * 4. Opt in, per organisation, behind a feature flag (feature key `ai_search`,
 *    availability `activation_required`), with an audit entry per query that
 *    records who asked and which sources were cited (not the answer text).
 * 5. Canon: no reproduction of ritual or Solomon content; answers link to the
 *    source document rather than paraphrasing restricted material.
 *
 * Switching it on would need: a migration adding the feature and an
 * embeddings table with RLS mirroring `app.can_read_doc_version`; a job that
 * embeds newly published eligible versions; and a search panel that shows
 * cited sources alongside the ordinary grouped results.
 */
export const AI_SEARCH = {
  enabled: false,
  eligibleDocumentClassifications: ["learning", "mentors"] as const,
  eligibleArticleAudiences: ["learning", "mentors"] as const,
  externalProcessingOfConfidentialContent: false,
} as const;
