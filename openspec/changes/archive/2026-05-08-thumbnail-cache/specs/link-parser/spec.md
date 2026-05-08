## MODIFIED Requirements

### Requirement: REST endpoint for parsing

The backend SHALL expose `POST /api/parse-link` accepting `{url: string, userId?: string}` (`url` is treated as raw text up to 2048 chars; the parser extracts the URL itself) and SHALL return `{source, videoId, page?, title, thumb?, duration?}`. The `thumb` field SHALL be a same-origin proxy URL of the form `/api/thumb?source=<source>&id=<videoId>` (NOT the upstream CDN URL); requests to that proxy URL are handled by the `thumbnail-cache` capability and serve cached cover bytes.

#### Scenario: Direct YouTube URL

- **WHEN** the request body is `{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}`
- **THEN** the response SHALL be `{source:"yt", videoId:"dQw4w9WgXcQ", title, thumb:"/api/thumb?source=yt&id=dQw4w9WgXcQ"}` with title fetched via oEmbed
