# Descriptions: searchable, read by Brio, and in the storage's own field

Agreed with Deepak 2026-10-29. A document's description is what the firm wrote in the Details pane
(`settings.description`). Firma already stores it, so searching it changes nothing in the privacy
policy (document *content* stays unindexed: `INDEX_DOCUMENT_TEXT` is still off).

## Built (2026-10-29)

- **Keyword match:** the engagement search and firm Doc Search match the query, and each of its
  terms, in the description as well as the name (`search-service.ts`: `searchByFileName`,
  `searchByFileNameTerms`, `searchGlobalFileName`, `searchGlobalFileNameTerms`). A match found only
  in the description ranks a little below the same match in a name, is tagged **Description match**,
  and shows the description under the result.
- **By meaning:** a document's vector is built from its name and description (and any stored
  summary): `prepareTextForEmbedding(name, summary, description)`, the description cut at 1,000
  characters (the model reads about 200 words). `indexFile` includes it; `SearchService.refreshEmbedding`
  rebuilds one document's vector from what Firma holds, without reading the file. Saving a
  description calls it, after the save answers.
- **Brio:** the file tree it's given (`lib/ai/files-context.ts`) carries each description on one
  short line beside the name (160 characters).
- **The storage's own field** (`lib/files/native-description.ts`):
  - Google Drive: written on every save; Drive's own `fullText` search then finds it.
  - OneDrive: personal drives only (Graph: "Only on OneDrive Personal"); the drive type is asked
    once per connection. OneDrive for Business and SharePoint have no such field: Firma only.
  - Read back on Google: the folder listing asks Drive for `description`. One written in Drive
    replaces Firma's (and rebuilds the vector); one Firma holds that Drive lacks is written to Drive,
    once (a refusal isn't retried every listing). Clearing it in Drive isn't taken as clearing it in
    Firma: an empty field can't tell "cleared" from "never written".
  - A failed write is logged, never a failed save.

## Not done

- Existing descriptions get their vector the next time they're saved or the file is re-indexed;
  there's no backfill job.
- OneDrive personal: no read-back (its listing doesn't carry the field).
- **/tour:** a few sample files carry a description (`lib/demo/demo-firm-data.json`): Doc Search
  shows them as Description matches, ranked after name matches, and the Details pane opens with them.
