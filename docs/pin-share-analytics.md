# Pin share box: analytics

The "Send this landmark" box sits on every pin card (desktop card and phone sheet). Every link it sends carries its own
random **share id** (`?s=…`, 8 characters), so one share can be followed from the person who sent it to everyone who
opened it, and on to anyone who passed it along.

## Events

**`pin_shared`**: someone pressed Share on a pin card.

| Param | Values |
|---|---|
| `ui_source` | `card` |
| `result` | `copied`, `failed` (desktop and phone fallback); `shared`, `cancelled` (phone share sheet) |
| `method` | `copy` or `share_sheet` |
| `kind` | `published`, `starter`, `community` |
| `published` | 1 / 0 (older param, kept) |
| `share_id` | the id in the link that was sent |
| `parent_share` | the share id this visitor arrived through, if they came in by a shared link ('' otherwise) |
| `structure_id`, `pin_id` | what was shared |
| `signed_in` | 1 / 0 |

**`shared_pin_opened`**: a shared pin link was opened.

| Param | Values |
|---|---|
| `found` | 1 if the pin still exists |
| `published`, `kind` | as above |
| `share_id` | the id from the link ('' for old links without one) |
| `own` | 1 if this device made that share (the sender testing their own link) |
| `repeat` | 1 if this tab already reported it (a reload or restored tab) |
| `structure_id`, `pin_id` | what was opened |

GA's 50 custom dimensions are all used, so the new params show only in **BigQuery** (`anatomy-go-app.analytics_555232644`),
not in the GA interface. Who is who is GA's anonymous `user_pseudo_id`; no names or emails are sent.

## Sender → opener (BigQuery)

```sql
WITH p AS (
  SELECT event_name, user_pseudo_id, TIMESTAMP_MICROS(event_timestamp) AS at,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='share_id') AS share_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='parent_share') AS parent_share,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='result') AS result,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='method') AS method,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='kind') AS kind,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='pin_id') AS pin_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key='own') AS own,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key='repeat') AS repeat
  FROM `anatomy-go-app.analytics_555232644.events_*`
  WHERE _TABLE_SUFFIX >= '20261124' AND event_name IN ('pin_shared','shared_pin_opened')
)
SELECT s.share_id, s.at AS shared_at, s.user_pseudo_id AS sender, s.method, s.result, s.kind, s.pin_id, s.parent_share,
  o.user_pseudo_id AS opener, o.at AS opened_at, o.user_pseudo_id = s.user_pseudo_id AS self_open
FROM p s
LEFT JOIN p o ON o.event_name='shared_pin_opened' AND o.share_id=s.share_id AND IFNULL(o.repeat,0)=0
WHERE s.event_name='pin_shared'
ORDER BY shared_at DESC;
```

What the opener did next: their events after `opened_at` with the same `user_pseudo_id`. Chains of re-shares:
`pin_shared.parent_share` = the `share_id` of the share they came in by.

Rates worth watching after launch: pin cards viewed → `pin_shared` (any result) → `result in (shared, copied)` →
opens per share (excluding `own` and `repeat`) → openers who share again.
