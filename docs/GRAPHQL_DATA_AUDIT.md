# CheemaQL: Reboot01 GraphQL data audit

Inspected on **5 October 2026**, using the owner's signed-in student account.

Endpoint: `https://learn.reboot01.com/api/graphql-engine/v1/graphql`.

This document records schema metadata and bounded read-only checks. It contains no credentials, tokens, personal record values, or downloaded student datasets. Schema visibility does not guarantee access to every row. Results depend on the authenticated role and row permissions.

## What was verified

- Anonymous introspection exposes only `no_queries_available`; it does not expose student data queries.
- Authenticated introspection returned 1,178 types and 109 query entry points. Many types are generated filters, ordering inputs, aggregates, and relationship helpers, rather than separate datasets.
- Eleven bounded data checks succeeded: profile, transaction types, XP aggregate, audits, project progress, results, groups, events, registrations, tasks, and records. Tasks returned an empty list for this account at inspection time.
- A further bounded check confirmed Module curriculum configuration and dated skill transactions.
- Two additional checks confirmed selective JSON-path queries, cohort membership, and a program population count aggregate. There were 14 successful bounded read-only probes in total. Population counts alone do not validate a cohort leaderboard or XP distribution.
- Mutation and subscription roots are defined. No mutations were executed and no subscriptions were started. A defined operation is not a recommendation to expose it in CheemaQL.
- Existing app queries are in `js/query.js`; dashboard processing and chart rendering are in `js/profile.js`. This inspection does not change the application.

### Cohort implementation follow-up

Subsequent read-only checks discovered seven Module enrolments in campus Bahrain and verified other students' levels/audit ratios and other teams' project groups. The implemented explorer queries these enrolments dynamically; it does not hardcode that event count. During the live browser check, their combined roster contained 600 unique users, and the Cohort2 enrolment contained 86.

The personal-audit follow-up verified two pending assignments for the signed-in auditor, including deadlines, captain repositories, valid audited commit hashes, and permission-visible `audit.private.code`. The dashboard's personal list filters explicitly by auditor ID; codes are requested separately only on Reveal code. These fields are not added to cohort queries. `user.avatarUrl` was queryable but empty for this account, so the initials fallback was verified. Project configuration did not expose the screenshot's project-level value; the app does not infer a level from the captain's personal level.

Other students' XP totals and individual cohort-label memberships were restricted. Some enrolments expose several labels; selecting that option selects the whole enrolment rather than guessing private label membership. Sampled audit rows involved the current account, so the Auditing view explicitly describes API-filtered coverage. Group `finished` status is exposed as finished-group activity, not a claim of individual successful completion. See the root README for implementation details and validation limits.

## Useful datasets and features

| Dataset | Useful fields and relationships | Dashboard use | Evidence |
| --- | --- | --- | --- |
| `user` | `auditRatio`, `totalUp`, `totalDown`, `totalUpBonus`, `avatarUrl`, `events`, `xps` | Profile, audit summary, program selection | Profile and audit totals queried successfully; avatar is schema-defined |
| `transaction` | `type`, `amount`, `createdAt`, `eventId`, `originEventId`, `object`, `isBonus`, `invalidatedAt`, `auditId` | XP trends, period comparisons, contribution breakdown, bonus XP, XP-award calendar | Types, aggregate, and dated skill transactions queried successfully; bonus/invalidation handling needs feature-specific checks |
| `event_user` / `event` / `xp_view` | Membership, program level, program XP, cohort relationships, start/end dates | Program-scoped KPIs and curriculum context | Membership and profile program relationships queried successfully |
| `progress` / `latest_progress` / `progress_by_path_view` | `isDone`, `grade`, `gradedAt`, `succeeded`, `count`, best/last progress, object and path | Completion overview, per-project history, latest outcome | Progress-by-path sample queried successfully; exact attempt and success definitions need validation |
| `result` | `grade`, `type`, `isLast`, `invalidatedAt`, `gradedAt`, object and group | Outcome breakdown, valid results, exam/project history | Bounded result sample queried successfully |
| `audit` | `auditorId`, `createdAt`, `endAt`, `auditedAt`, `closedAt`, `closureType`, `grade`, group/project | Pending audits, deadline list, audit outcomes, history | Bounded sample queried successfully |
| `group` / `group_user` | Status, captain, accepted members, event, object, start/cancellation dates | Active projects, collaborator counts, team history | Own-group sample queried successfully |
| `object` / `object_child` / `path` | Name, type, curriculum relationships, JSON configuration, canonical paths | Project catalogue, curriculum map, project detail navigation | Object relationships and Module configuration queried successfully; complete catalogue not downloaded |
| `registration` / `registration_user` | Registration start/end, capacity, membership | Upcoming registered events and calendar | Own-registration sample queried successfully |
| `task` | Name, status, timestamps, event/project/group | Outstanding task list | Query succeeded; account had no matching tasks |
| `label` / `label_user` | Cohort membership and names | Cohort selector | Membership relationships and program population count queried successfully; cohort XP comparison not yet validated |
| `record` / `record_type` | Start/end, type, access/auditor eligibility flags | Optional personal availability/eligibility context | Own-record sample queried successfully; exclude free-text reasons from analytics |

Other schema families include markdown, matching, roles, archived paths, object availability, and TOAD campaign/session/game data. They are catalogued below but were not sampled as complete datasets. TOAD objects appear to support assessment/game workflows; that interpretation comes from field names and relationships, not a verified business specification.

## Confirmed skill types

The account's transaction query returned these skill types:

`skill_ai`, `skill_algo`, `skill_back-end`, `skill_css`, `skill_docker`, `skill_front-end`, `skill_game`, `skill_go`, `skill_graphql`, `skill_html`, `skill_js`, `skill_prog`, `skill_rust`, `skill_sql`, `skill_sys-admin`, `skill_tcp`, `skill_unix`.

It also returned `xp`, `level`, `up`, and `down`. This is the observed set for this account, not an exhaustive platform-wide list. The current fixed chart arrays omit AI, Rust, and GraphQL despite available data. Distinct maximum values support a current-skill view; trend charts need dated transactions, which were also verified.

## Confirmed curriculum configuration

The account's Module object exposes these JSON keys:

| JSON path | Observed structure | Potential use |
| --- | --- | --- |
| `timeline` | Array of 18 entries; fields include `rank`, `month`, `notes`, `minLevel`, `expectedLevel`, `checkpointLevel` | Expected progression and milestone view |
| `ranksDefinitions` | Array of 8 entries; fields include `name`, `level`, `milestone` | Current/next rank |
| `levelsDefinitions` | Array of 5 entries; fields include `level`, `requirements` | Level requirement checklist |
| `graph` | Object with `innerCircle`, `outerCircle`, `centralPoint`, `middleCircle` | Curriculum map |
| `expectedXp` | Object with `name`, `type` | Configuration reference; does not alone prove a numerical next-level XP formula |

These structures may vary by program. Parse defensively rather than embedding the sample lengths. The schema exposes `attrs(path: String)` for selecting a specific JSON path, so implementations should request only the curriculum keys they use.

## Analytics definitions and constraints

- Filter by authenticated user and selected program. Existence of `userId` does not mean every student record is accessible.
- Distinguish `eventId` from `originEventId`; validate the correct program scope against the platform before combining totals. Selection piscines, modules, bonuses, and invalidated transactions can affect totals.
- Audit ratio is XP given divided by XP received. Audit completion rate must come from audit records and closure states, not transaction counts or XP amounts. Define the denominator explicitly; reassigned, canceled, unused, invalidated, and expired audits differ from completed audits.
- `audit_closure_type_enum` defines `autoFailed`, `canceled`, `expired`, `failed`, `invalidated`, `reassigned`, `succeeded`, `unused`. Determine pending states using the returned nullable fields and deadlines; verify business semantics before assigning labels.
- `group_status_enum` defines `audit`, `finished`, `setup`, `working`. Count accepted members when deriving collaborators; invitations should not automatically count as completed teamwork.
- Do not treat every result as a completed project. Consider object type, grade, invalidation, progress state, and latest/best result semantics.
- A progress row count or `progress_by_path_view.count` is not automatically the number of submission attempts. Validate its meaning before labelling an attempts metric.
- XP and skill transaction timestamps represent awards/updates, not hours studied or days spent coding. Label a calendar as XP awards rather than a coding streak.
- Use a stated timezone, stable chronological ordering, and zero/empty-state handling. Avoid percentage growth when the comparison baseline is zero.
- Cohort averages, percentiles, and rankings need a separately validated population, permissions, program scope, and denominator. Schema availability alone does not establish a valid leaderboard.
- Fetch lists in bounded pages with stable ordering. Use available aggregates where appropriate; avoid requesting all histories and large JSON objects on initial load.
- Historical skill awards do not prove skill deterioration or mastery; describe them as platform-recorded skill values.

## Data to exclude from a portfolio dashboard

The user `attrs` JSON includes sensitive identity, contact, address, medical, emergency-contact, and document-upload metadata. These fields are unnecessary for progress analytics. Do not fetch the whole `attrs` object merely to display a city or name; select named safe fields or specific JSON paths. Audit codes (`audit_private.code`), free-text personal record reasons, and private profile metadata should also stay out of analytics, exports, screenshots, and demo fixtures.

Use synthetic demo records for public portfolio access. Keep tokens out of documentation and exports. CheemaQL should remain read-only; the API's mutation catalogue is not needed for analytics.

## Recommended implementation sequence

1. Correct deployment paths, safe rendering, session recovery, request retries, and empty-chart handling.
2. Build program-scoped overview cards and dynamic current-skill charts.
3. Add monthly/weekly XP, period comparison, top contributions, XP-award calendar, project search/filter/sort, and safe CSV export.
4. Add audit deadlines/history/outcomes and accepted-team collaboration history with validated definitions.
5. Add curriculum milestone, rank, and requirement views using the selected program's configuration.
6. Add registrations/tasks calendar, skill history, and cohort comparisons only after their scopes and semantics are verified.

## Validation limits

This is a snapshot of one student role, not an administrator schema or a full database export. Bounded samples establish that the listed checks work for this account; they do not verify every field, all records, every aggregate, other accounts, business definitions, mutations, or live subscriptions. No production code was changed, and no test files were added to the repository.

The following inventory is generated from the authenticated schema. It lists all query-returned data families, their fields and relationships, and all root query entry points. JSON fields have runtime-defined keys; the GraphQL schema cannot enumerate every possible JSON key.


## Complete query-returned data families

There are 43 distinct non-aggregate object types directly returned by root queries. `!` denotes a non-null schema type; brackets denote a list. Nullability is a schema declaration, not a guarantee that a lookup returns a matching record.

### `audit`

Values: `attrs: jsonb!`, `auditedAt: timestamptz`, `auditorId: Int!`, `auditorLogin: String`, `closedAt: timestamptz`, `closureMessage: String`, `closureType: audit_closure_type_enum`, `createdAt: timestamptz!`, `endAt: timestamptz`, `grade: numeric`, `groupId: Int!`, `id: Int!`, `resultId: Int`, `updatedAt: timestamptz!`, `version: String`.

Relationships/helpers: `auditor: user_public_view`, `group: group!`, `private: audit_private`, `result: result`.

### `audit_private`

Values: `code: String`.

Relationships/helpers: `audit: audit`.

### `event`

Values: `campus: String`, `createdAt: timestamptz!`, `description: String`, `endAt: timestamptz!`, `id: Int!`, `objectId: Int!`, `parentId: Int`, `path: String!`, `processedAt: timestamptz`, `startAt: timestamptz!`.

Relationships/helpers: `children: [event!]!`, `children_aggregate: event_aggregate!`, `cohorts: [label!]!`, `cohorts_aggregate: label_aggregate!`, `groups: [group!]!`, `groups_aggregate: group_aggregate!`, `matches: [match!]!`, `matches_aggregate: match_aggregate!`, `object: object!`, `objectAvailabilities: [object_availability!]!`, `objectAvailabilities_aggregate: object_availability_aggregate!`, `parent: event`, `pathByPath: path!`, `progresses: [progress!]!`, `progressesByEventid: [progress!]!`, `progressesByEventid_aggregate: progress_aggregate!`, `progresses_aggregate: progress_aggregate!`, `registrations: [registration!]!`, `registrations_aggregate: registration_aggregate!`, `results: [result!]!`, `resultsOnPath: [result!]!`, `resultsOnPath_aggregate: result_aggregate!`, `results_aggregate: result_aggregate!`, `tasks: [task!]!`, `users: [event_user_view!]!`, `usersRelation: [event_user!]!`, `usersRelation_aggregate: event_user_aggregate!`, `users_aggregate: event_user_view_aggregate!`, `xps: [xp_view!]!`.

### `event_user`

Values: `createdAt: timestamptz!`, `eventId: Int!`, `id: Int!`, `level: Int!`, `userAuditRatio: float8`, `userId: Int!`, `userLogin: String`, `userName: String`.

Relationships/helpers: `cohorts: [label_user!]!`, `cohorts_aggregate: label_user_aggregate!`, `event: event!`, `member: event_user_view`, `objectAvailabilities: [object_availability!]!`, `objectAvailabilities_aggregate: object_availability_aggregate!`, `publicUser: user_public_view`, `user: user!`, `xp: xp_view`.

### `event_user_view`

Values: `createdAt: timestamptz`, `discordDMChannelId: String`, `discordId: String`, `discordLogin: String`, `eventId: Int`, `githubId: Int`, `id: Int`, `login: String`, `profile: jsonb`, `updatedAt: timestamptz`.

Relationships/helpers: `cohorts: [label_user!]!`, `cohorts_aggregate: label_user_aggregate!`, `event: event`.

### `group`

Values: `campus: String`, `cancelReason: String`, `canceledAt: timestamptz`, `captainId: Int!`, `captainLogin: String`, `createdAt: timestamptz!`, `eventId: Int`, `id: Int!`, `objectId: Int!`, `path: String!`, `startedWorkingAt: timestamptz`, `status: group_status_enum!`, `updatedAt: timestamptz!`.

Relationships/helpers: `auditors: [audit!]!`, `auditors_aggregate: audit_aggregate!`, `captain: user_public_view`, `captainRecords: [record_public_view!]!`, `captainRecords_aggregate: record_public_view_aggregate!`, `event: event`, `members: [group_user!]!`, `members_aggregate: group_user_aggregate!`, `object: object!`, `pathByPath: path!`, `progresses: [progress!]!`, `progresses_aggregate: progress_aggregate!`, `results: [result!]!`, `results_aggregate: result_aggregate!`, `tasks: [task!]!`.

### `group_user`

Values: `accepted: Boolean`, `answeredAt: timestamptz`, `createdAt: timestamptz!`, `enrollerId: Int`, `enrollment: String!`, `enrollmentStatus: String`, `eventId: Int!`, `groupId: Int!`, `id: Int!`, `path: String!`, `updatedAt: timestamptz!`, `userAuditRatio: float8`, `userId: Int!`, `userLevel: String`, `userLogin: String`.

Relationships/helpers: `event: event!`, `group: group!`, `pathByPath: path!`, `user: user_public_view`.

### `label`

Values: `createdAt: timestamptz!`, `description: String!`, `id: Int!`, `name: String!`, `updatedAt: timestamptz!`.

Relationships/helpers: `event: event`, `registrations: [registration!]!`, `registrations_aggregate: registration_aggregate!`, `users: [label_user!]!`, `users_aggregate: label_user_aggregate!`.

### `label_user`

Values: `createdAt: timestamptz!`, `eventId: Int`, `id: Int!`, `labelId: Int!`, `labelName: String`, `userId: Int!`.

Relationships/helpers: `label: label!`, `user: user!`.

### `latest_progress`

Values: `campus: String`, `createdAt: timestamptz!`, `eventId: Int`, `grade: numeric`, `id: bigint!`, `isDone: Boolean!`, `parentId: Int`, `path: String!`, `updatedAt: timestamptz!`, `userId: Int!`, `version: String`.

### `markdown`

Values: `content: String!`, `createdAt: timestamptz!`, `name: String!`, `updatedAt: timestamptz!`.

Relationships/helpers: `user: user!`.

### `match`

Values: `bet: Boolean`, `campus: String`, `confirmed: Boolean`, `createdAt: timestamptz!`, `eventId: Int`, `id: Int!`, `matchId: Int`, `objectId: Int!`, `path: String`, `result: Boolean`, `updatedAt: timestamptz!`, `userId: Int`, `userLogin: String`.

Relationships/helpers: `event: event`, `match: match`, `matches: [match!]!`, `matches_aggregate: match_aggregate!`, `object: object!`, `pathByPath: path`, `user: user_public_view`.

### `object`

Values: `attrs: jsonb!`, `authorId: Int`, `campus: String`, `createdAt: timestamptz!`, `id: Int!`, `name: String`, `type: String!`, `updatedAt: timestamptz!`.

Relationships/helpers: `author: user`, `childrenRelation: [object_child!]!`, `childrenRelation_aggregate: object_child_aggregate!`, `events: [event!]!`, `events_aggregate: event_aggregate!`, `groups: [group!]!`, `groups_aggregate: group_aggregate!`, `matches: [match!]!`, `matches_aggregate: match_aggregate!`, `object_type: object_type!`, `objects: [object!]!`, `objects_aggregate: object_aggregate!`, `parents: [object_child!]!`, `parents_aggregate: object_child_aggregate!`, `paths: [path!]!`, `paths_aggregate: path_aggregate!`, `progresses: [progress!]!`, `progresses_aggregate: progress_aggregate!`, `reference: object`, `registrations: [registration!]!`, `registrations_aggregate: registration_aggregate!`, `results: [result!]!`, `results_aggregate: result_aggregate!`, `tasks: [task!]!`.

### `object_availability`

Values: `created_at: timestamptz!`, `eventId: Int!`, `eventUserId: Int!`, `id: Int!`, `login: String!`, `path: String!`, `updated_at: timestamptz!`, `userAuditRatio: float8`, `userId: Int!`.

Relationships/helpers: `event: event!`, `event_user: event_user!`, `invites: [group_user!]!`, `invites_aggregate: group_user_aggregate!`, `pathByPath: path!`, `records: [record!]!`, `user: user!`, `userRecords: [record_public_view!]!`, `userRecords_aggregate: record_public_view_aggregate!`, `user_view: user_public_view`.

### `object_child`

Values: `attrs: jsonb!`, `childId: Int!`, `id: Int!`, `index: Int`, `key: String!`, `parentId: Int!`, `replacedAt: timestamptz`, `replacedBy: Int`, `updatedAt: timestamptz`.

Relationships/helpers: `child: object!`, `formerVersions: [object_child!]!`, `formerVersions_aggregate: object_child_aggregate!`, `latestVersion: [object_child!]!`, `latestVersion_aggregate: object_child_aggregate!`, `parent: object!`, `paths: [path!]!`, `paths_aggregate: path_aggregate!`.

### `object_type`

Values: `type: String!`.

Relationships/helpers: `objects: [object!]!`, `objects_aggregate: object_aggregate!`.

### `path`

Values: `objectChildId: Int`, `objectId: Int`, `parentId: Int`, `path: String!`, `updatedAt: timestamptz!`.

Relationships/helpers: `events: [event!]!`, `events_aggregate: event_aggregate!`, `groups: [group!]!`, `groups_aggregate: group_aggregate!`, `matches: [match!]!`, `matches_aggregate: match_aggregate!`, `object: object`, `objectAvailabilities: [object_availability!]!`, `objectAvailabilities_aggregate: object_availability_aggregate!`, `object_child: object_child`, `path_archives: [path_archive!]!`, `path_archives_aggregate: path_archive_aggregate!`, `progresses: [progress!]!`, `progresses_aggregate: progress_aggregate!`, `registrations: [registration!]!`, `registrations_aggregate: registration_aggregate!`, `results: [result!]!`, `results_aggregate: result_aggregate!`, `tasks: [task!]!`, `transactions: [transaction!]!`, `transactions_aggregate: transaction_aggregate!`.

### `path_archive`

Values: `attrs: jsonb`, `createdAt: timestamptz!`, `id: Int!`, `index: Int`, `path: String`, `status: path_status_enum`, `updatedAt: timestamptz!`.

Relationships/helpers: `pathByPath: path`.

### `progress`

Values: `campus: String`, `createdAt: timestamptz!`, `eventId: Int`, `grade: numeric`, `gradedAt: timestamptz`, `groupId: Int`, `id: bigint!`, `isDone: Boolean!`, `objectId: Int!`, `path: String!`, `updatedAt: timestamptz!`, `userId: Int!`, `userLogin: String`, `version: String`.

Relationships/helpers: `event: event`, `group: group`, `object: object!`, `pathByPath: path!`, `results: [result!]!`, `results_aggregate: result_aggregate!`, `user: user!`.

### `progress_by_path_view`

Values: `bestProgressVersion: String`, `campus: String`, `count: bigint`, `createdAt: timestamptz`, `lastProgressId: bigint`, `objectId: Int`, `path: String`, `succeeded: Boolean`, `updatedAt: timestamptz`, `userId: Int`.

Relationships/helpers: `bestProgress: progress`, `lastProgress: progress`, `object: object`, `user: user`.

### `record`

Values: `authorId: Int!`, `authorLogin: String`, `createdAt: timestamptz!`, `endAt: timestamptz`, `id: Int!`, `message: String!`, `startAt: timestamptz!`, `typeName: String!`, `userId: Int!`, `userLogin: String`.

Relationships/helpers: `author: user!`, `type: record_type!`, `user: user!`.

### `record_public_view`

Values: `endAt: timestamptz`, `startAt: timestamptz`, `userId: Int`.

### `record_type`

Values: `canAccessPlatform: Boolean!`, `canBeAuditor: Boolean!`, `description: String!`, `isPermanent: Boolean!`, `label: String!`, `type: String!`.

Relationships/helpers: `records: [record!]!`.

### `registration`

Values: `campus: String`, `capacity: Int!`, `createdAt: timestamptz!`, `endAt: timestamptz!`, `eventId: Int!`, `eventJoinedAt: timestamptz!`, `id: Int!`, `labelId: Int`, `labelName: String`, `objectId: Int!`, `path: String!`, `startAt: timestamptz!`.

Relationships/helpers: `event: event!`, `label: label`, `object: object!`, `pathByPath: path!`, `registrationUsers: [registration_user!]!`, `registrationUsers_aggregate: registration_user_aggregate!`, `users: [registration_user_view!]!`, `users_aggregate: registration_user_view_aggregate!`.

### `registration_user`

Values: `createdAt: timestamptz!`, `id: Int!`, `position: Int`, `registrationId: Int!`, `userId: Int!`, `userLogin: String`.

Relationships/helpers: `registration: registration!`, `user: user!`.

### `registration_user_view`

Values: `createdAt: timestamptz`, `id: Int`, `position: bigint`, `registeredAt: timestamptz`, `registrationId: Int`, `updatedAt: timestamptz`.

Relationships/helpers: `registration: registration`.

### `result`

Values: `attrs: jsonb`, `campus: String`, `createdAt: timestamptz!`, `eventId: Int`, `grade: numeric`, `gradedAt: timestamptz`, `groupId: Int`, `id: Int!`, `invalidatedAt: timestamptz`, `invalidationReason: String`, `isLast: Boolean`, `objectId: Int!`, `path: String!`, `type: String!`, `updatedAt: timestamptz!`, `userId: Int`, `userLogin: String`, `version: String`.

Relationships/helpers: `audits: [audit!]!`, `audits_aggregate: audit_aggregate!`, `event: event`, `group: group`, `object: object!`, `pathByPath: path!`, `user: user`.

### `role`

Values: `createdAt: timestamptz!`, `description: String!`, `id: Int!`, `name: String!`, `slug: String!`, `updatedAt: timestamptz!`.

Relationships/helpers: `user_roles: [user_role!]!`, `user_roles_aggregate: user_role_aggregate!`.

### `task`

Values: `attrs: jsonb!`, `createdAt: timestamptz!`, `eventId: Int`, `groupId: Int`, `id: Int!`, `name: String!`, `objectId: Int`, `output: String`, `path: String`, `status: String!`, `updatedAt: timestamptz!`, `userId: Int`.

Relationships/helpers: `event: event`, `group: group`, `object: object`, `pathByPath: path`, `user: user`.

### `timing`

Values: `audit: timestamptz`, `event: timestamptz`, `group: timestamptz`, `match: timestamptz`, `progress: timestamptz`, `record: timestamptz`, `registration: timestamptz`, `transaction: timestamptz`, `user: timestamptz`.

### `toad_campaign_games`

Values: `campaign_id: uuid!`, `game_id: uuid!`, `id: Int!`, `overriden_duration: Int`, `overriden_points: Int`, `position: Int!`.

Relationships/helpers: `campaign: toad_campaigns!`, `ref: toad_games!`.

### `toad_campaigns`

Values: `attempts: Int!`, `created_at: timestamptz!`, `id: uuid!`, `instructions: String`, `title: String!`, `user_id: Int!`.

Relationships/helpers: `games: [toad_campaign_games!]!`, `games_aggregate: toad_campaign_games_aggregate!`, `sessions: [toad_sessions!]!`, `sessions_aggregate: toad_sessions_aggregate!`, `user: user`.

### `toad_games`

Values: `duration: Int!`, `id: uuid!`, `name: String!`, `points: Int!`.

Relationships/helpers: `campaigns: [toad_campaign_games!]!`, `campaigns_aggregate: toad_campaign_games_aggregate!`.

### `toad_session_game_results`

Values: `attempts: Int!`, `id: Int!`, `level: Int!`, `session_game_id: Int!`.

Relationships/helpers: `result: toad_session_games!`.

### `toad_session_games`

Values: `duration: Int!`, `game_id: uuid!`, `id: Int!`, `name: String!`, `points: Int!`, `position: Int`, `session_id: uuid!`, `started_at: timestamptz`.

Relationships/helpers: `results: [toad_session_game_results!]!`, `session: toad_sessions!`.

### `toad_sessions`

Values: `allowed_attempts: Int!`, `attempts: jsonb!`, `campaign_id: uuid!`, `candidate_id: Int`, `created_at: timestamptz!`, `id: uuid!`, `instructions: String`, `started_at: timestamptz`.

Relationships/helpers: `campaign: toad_campaigns!`, `candidate: user`, `games: [toad_session_games!]!`, `games_aggregate: toad_session_games_aggregate!`.

### `transaction`

Values: `amount: numeric!`, `attrs: jsonb!`, `auditId: Int`, `campus: String`, `createdAt: timestamptz!`, `eventId: Int`, `id: Int!`, `invalidatedAt: timestamptz`, `invalidationReason: String`, `isBonus: Boolean!`, `objectId: Int!`, `originEventId: Int`, `path: String!`, `type: String!`, `userId: Int!`, `userLogin: String`.

Relationships/helpers: `event: event`, `object: object`, `originEvent: event`, `pathByPath: path!`, `progress: progress`, `transaction_type: transaction_type!`, `user: user!`.

### `transaction_type`

Values: `type: String!`.

Relationships/helpers: `transactions: [transaction!]!`, `transactions_aggregate: transaction_aggregate!`.

### `user`

Values: `attrs: jsonb!`, `auditRatio: float8`, `auditsAssigned: numeric`, `avatarUrl: String`, `campus: String`, `createdAt: timestamptz!`, `discordId: String`, `discordLogin: String`, `email: String`, `firstName: String`, `githubId: Int`, `id: Int!`, `lastName: String`, `login: String!`, `profile: jsonb!`, `totalDown: numeric`, `totalUp: numeric`, `totalUpBonus: numeric`, `updatedAt: timestamptz!`.

Relationships/helpers: `audits: [audit!]!`, `audits_aggregate: audit_aggregate!`, `events: [event_user!]!`, `events_aggregate: event_user_aggregate!`, `groups: [group_user!]!`, `groupsByCaptainid: [group!]!`, `groupsByCaptainid_aggregate: group_aggregate!`, `groups_aggregate: group_user_aggregate!`, `labels: [label_user!]!`, `labels_aggregate: label_user_aggregate!`, `markdowns: [markdown!]!`, `matches: [match!]!`, `matches_aggregate: match_aggregate!`, `objectAvailabilities: [object_availability!]!`, `objectAvailabilities_aggregate: object_availability_aggregate!`, `objects: [object!]!`, `objects_aggregate: object_aggregate!`, `progresses: [progress!]!`, `progressesByPath: [progress_by_path_view!]!`, `progressesByPath_aggregate: progress_by_path_view_aggregate!`, `progresses_aggregate: progress_aggregate!`, `public: user_public_view`, `records: [record!]!`, `recordsByAuthorid: [record!]!`, `registrations: [registration_user!]!`, `registrations_aggregate: registration_user_aggregate!`, `results: [result!]!`, `results_aggregate: result_aggregate!`, `roles: [user_roles_view!]!`, `roles_aggregate: user_roles_view_aggregate!`, `sessions: [toad_sessions!]!`, `sessions_aggregate: toad_sessions_aggregate!`, `transactions: [transaction!]!`, `transactions_aggregate: transaction_aggregate!`, `user_roles: [user_role!]!`, `user_roles_aggregate: user_role_aggregate!`, `xps: [xp_view!]!`.

### `user_public_view`

Values: `avatarUrl: String`, `campus: String`, `canAccessPlatform: Boolean`, `canBeAuditor: Boolean`, `discordId: String`, `firstName: String`, `githubId: Int`, `id: Int`, `lastName: String`, `login: String`, `profile: jsonb`.

Relationships/helpers: `events: [event_user!]!`, `events_aggregate: event_user_aggregate!`, `labels: [label_user!]!`, `labels_aggregate: label_user_aggregate!`, `private: user`, `roles: [user_roles_view!]!`, `roles_aggregate: user_roles_view_aggregate!`.

### `user_role`

Values: `id: Int!`, `roleId: Int!`, `userId: Int!`.

Relationships/helpers: `role: role!`, `user: user!`.

### `user_roles_view`

Values: `createdAt: timestamptz`, `description: String`, `id: Int`, `name: String`, `slug: String`, `updatedAt: timestamptz`, `userId: Int`.

Relationships/helpers: `user: user`.

### `xp_view`

Values: `amount: numeric`, `originEventId: Int`, `path: String`, `userId: Int`.

Relationships/helpers: `event: event`, `pathByPath: path`, `user: user`.

## All root query entry points

These are schema-defined operations. Most list queries accept filters, ordering, distinct selection, limits, and offsets; inspect each signature below rather than assuming every operation supports them.

- `audit(distinct_on: [audit_select_column!], limit: Int, offset: Int, order_by: [audit_order_by!], where: audit_bool_exp): [audit!]!`
- `audit_aggregate(distinct_on: [audit_select_column!], limit: Int, offset: Int, order_by: [audit_order_by!], where: audit_bool_exp): audit_aggregate!`
- `audit_by_pk(id: Int!): audit`
- `audit_private(distinct_on: [audit_private_select_column!], limit: Int, offset: Int, order_by: [audit_private_order_by!], where: audit_private_bool_exp): [audit_private!]!`
- `event(distinct_on: [event_select_column!], limit: Int, offset: Int, order_by: [event_order_by!], where: event_bool_exp): [event!]!`
- `event_aggregate(distinct_on: [event_select_column!], limit: Int, offset: Int, order_by: [event_order_by!], where: event_bool_exp): event_aggregate!`
- `event_by_pk(id: Int!): event`
- `event_user(distinct_on: [event_user_select_column!], limit: Int, offset: Int, order_by: [event_user_order_by!], where: event_user_bool_exp): [event_user!]!`
- `event_user_aggregate(distinct_on: [event_user_select_column!], limit: Int, offset: Int, order_by: [event_user_order_by!], where: event_user_bool_exp): event_user_aggregate!`
- `event_user_by_pk(id: Int!): event_user`
- `event_user_view(distinct_on: [event_user_view_select_column!], limit: Int, offset: Int, order_by: [event_user_view_order_by!], where: event_user_view_bool_exp): [event_user_view!]!`
- `event_user_view_aggregate(distinct_on: [event_user_view_select_column!], limit: Int, offset: Int, order_by: [event_user_view_order_by!], where: event_user_view_bool_exp): event_user_view_aggregate!`
- `group(distinct_on: [group_select_column!], limit: Int, offset: Int, order_by: [group_order_by!], where: group_bool_exp): [group!]!`
- `group_aggregate(distinct_on: [group_select_column!], limit: Int, offset: Int, order_by: [group_order_by!], where: group_bool_exp): group_aggregate!`
- `group_by_pk(id: Int!): group`
- `group_user(distinct_on: [group_user_select_column!], limit: Int, offset: Int, order_by: [group_user_order_by!], where: group_user_bool_exp): [group_user!]!`
- `group_user_aggregate(distinct_on: [group_user_select_column!], limit: Int, offset: Int, order_by: [group_user_order_by!], where: group_user_bool_exp): group_user_aggregate!`
- `group_user_by_pk(id: Int!): group_user`
- `label(distinct_on: [label_select_column!], limit: Int, offset: Int, order_by: [label_order_by!], where: label_bool_exp): [label!]!`
- `label_aggregate(distinct_on: [label_select_column!], limit: Int, offset: Int, order_by: [label_order_by!], where: label_bool_exp): label_aggregate!`
- `label_by_pk(id: Int!): label`
- `label_user(distinct_on: [label_user_select_column!], limit: Int, offset: Int, order_by: [label_user_order_by!], where: label_user_bool_exp): [label_user!]!`
- `label_user_aggregate(distinct_on: [label_user_select_column!], limit: Int, offset: Int, order_by: [label_user_order_by!], where: label_user_bool_exp): label_user_aggregate!`
- `label_user_by_pk(id: Int!): label_user`
- `latest_progress(args: latest_progress_arguments!, distinct_on: [latest_progress_enum_name!], limit: Int, offset: Int, order_by: [latest_progress_order_by!], where: latest_progress_bool_exp_bool_exp): [latest_progress!]!`
- `markdown(distinct_on: [markdown_select_column!], limit: Int, offset: Int, order_by: [markdown_order_by!], where: markdown_bool_exp): [markdown!]!`
- `markdown_by_pk(name: String!): markdown`
- `match(distinct_on: [match_select_column!], limit: Int, offset: Int, order_by: [match_order_by!], where: match_bool_exp): [match!]!`
- `match_aggregate(distinct_on: [match_select_column!], limit: Int, offset: Int, order_by: [match_order_by!], where: match_bool_exp): match_aggregate!`
- `match_by_pk(id: Int!): match`
- `object(distinct_on: [object_select_column!], limit: Int, offset: Int, order_by: [object_order_by!], where: object_bool_exp): [object!]!`
- `object_aggregate(distinct_on: [object_select_column!], limit: Int, offset: Int, order_by: [object_order_by!], where: object_bool_exp): object_aggregate!`
- `object_availability(distinct_on: [object_availability_select_column!], limit: Int, offset: Int, order_by: [object_availability_order_by!], where: object_availability_bool_exp): [object_availability!]!`
- `object_availability_aggregate(distinct_on: [object_availability_select_column!], limit: Int, offset: Int, order_by: [object_availability_order_by!], where: object_availability_bool_exp): object_availability_aggregate!`
- `object_availability_by_pk(id: Int!): object_availability`
- `object_by_pk(id: Int!): object`
- `object_child(distinct_on: [object_child_select_column!], limit: Int, offset: Int, order_by: [object_child_order_by!], where: object_child_bool_exp): [object_child!]!`
- `object_child_aggregate(distinct_on: [object_child_select_column!], limit: Int, offset: Int, order_by: [object_child_order_by!], where: object_child_bool_exp): object_child_aggregate!`
- `object_child_by_pk(id: Int!): object_child`
- `object_type(distinct_on: [object_type_select_column!], limit: Int, offset: Int, order_by: [object_type_order_by!], where: object_type_bool_exp): [object_type!]!`
- `object_type_aggregate(distinct_on: [object_type_select_column!], limit: Int, offset: Int, order_by: [object_type_order_by!], where: object_type_bool_exp): object_type_aggregate!`
- `object_type_by_pk(type: String!): object_type`
- `path(distinct_on: [path_select_column!], limit: Int, offset: Int, order_by: [path_order_by!], where: path_bool_exp): [path!]!`
- `path_aggregate(distinct_on: [path_select_column!], limit: Int, offset: Int, order_by: [path_order_by!], where: path_bool_exp): path_aggregate!`
- `path_archive(distinct_on: [path_archive_select_column!], limit: Int, offset: Int, order_by: [path_archive_order_by!], where: path_archive_bool_exp): [path_archive!]!`
- `path_archive_aggregate(distinct_on: [path_archive_select_column!], limit: Int, offset: Int, order_by: [path_archive_order_by!], where: path_archive_bool_exp): path_archive_aggregate!`
- `path_archive_by_pk(id: Int!): path_archive`
- `path_by_pk(path: String!): path`
- `progress(distinct_on: [progress_select_column!], limit: Int, offset: Int, order_by: [progress_order_by!], where: progress_bool_exp): [progress!]!`
- `progress_aggregate(distinct_on: [progress_select_column!], limit: Int, offset: Int, order_by: [progress_order_by!], where: progress_bool_exp): progress_aggregate!`
- `progress_by_path_view(distinct_on: [progress_by_path_view_select_column!], limit: Int, offset: Int, order_by: [progress_by_path_view_order_by!], where: progress_by_path_view_bool_exp): [progress_by_path_view!]!`
- `progress_by_path_view_aggregate(distinct_on: [progress_by_path_view_select_column!], limit: Int, offset: Int, order_by: [progress_by_path_view_order_by!], where: progress_by_path_view_bool_exp): progress_by_path_view_aggregate!`
- `progress_by_pk(id: bigint!): progress`
- `record(distinct_on: [record_select_column!], limit: Int, offset: Int, order_by: [record_order_by!], where: record_bool_exp): [record!]!`
- `record_by_pk(id: Int!): record`
- `record_public_view(distinct_on: [record_public_view_select_column!], limit: Int, offset: Int, order_by: [record_public_view_order_by!], where: record_public_view_bool_exp): [record_public_view!]!`
- `record_public_view_aggregate(distinct_on: [record_public_view_select_column!], limit: Int, offset: Int, order_by: [record_public_view_order_by!], where: record_public_view_bool_exp): record_public_view_aggregate!`
- `record_type(distinct_on: [record_type_select_column!], limit: Int, offset: Int, order_by: [record_type_order_by!], where: record_type_bool_exp): [record_type!]!`
- `record_type_by_pk(type: String!): record_type`
- `registration(distinct_on: [registration_select_column!], limit: Int, offset: Int, order_by: [registration_order_by!], where: registration_bool_exp): [registration!]!`
- `registration_aggregate(distinct_on: [registration_select_column!], limit: Int, offset: Int, order_by: [registration_order_by!], where: registration_bool_exp): registration_aggregate!`
- `registration_by_pk(id: Int!): registration`
- `registration_user(distinct_on: [registration_user_select_column!], limit: Int, offset: Int, order_by: [registration_user_order_by!], where: registration_user_bool_exp): [registration_user!]!`
- `registration_user_aggregate(distinct_on: [registration_user_select_column!], limit: Int, offset: Int, order_by: [registration_user_order_by!], where: registration_user_bool_exp): registration_user_aggregate!`
- `registration_user_by_pk(id: Int!): registration_user`
- `registration_user_view(distinct_on: [registration_user_view_select_column!], limit: Int, offset: Int, order_by: [registration_user_view_order_by!], where: registration_user_view_bool_exp): [registration_user_view!]!`
- `registration_user_view_aggregate(distinct_on: [registration_user_view_select_column!], limit: Int, offset: Int, order_by: [registration_user_view_order_by!], where: registration_user_view_bool_exp): registration_user_view_aggregate!`
- `result(distinct_on: [result_select_column!], limit: Int, offset: Int, order_by: [result_order_by!], where: result_bool_exp): [result!]!`
- `result_aggregate(distinct_on: [result_select_column!], limit: Int, offset: Int, order_by: [result_order_by!], where: result_bool_exp): result_aggregate!`
- `result_by_pk(id: Int!): result`
- `role(distinct_on: [role_select_column!], limit: Int, offset: Int, order_by: [role_order_by!], where: role_bool_exp): [role!]!`
- `role_aggregate(distinct_on: [role_select_column!], limit: Int, offset: Int, order_by: [role_order_by!], where: role_bool_exp): role_aggregate!`
- `role_by_pk(id: Int!): role`
- `task(distinct_on: [task_select_column!], limit: Int, offset: Int, order_by: [task_order_by!], where: task_bool_exp): [task!]!`
- `task_by_pk(id: Int!): task`
- `timing(distinct_on: [timing_select_column!], limit: Int, offset: Int, order_by: [timing_order_by!], where: timing_bool_exp): [timing!]!`
- `timings(args: timings_args!, distinct_on: [timing_select_column!], limit: Int, offset: Int, order_by: [timing_order_by!], where: timing_bool_exp): timing`
- `toad_campaign_games(distinct_on: [toad_campaign_games_select_column!], limit: Int, offset: Int, order_by: [toad_campaign_games_order_by!], where: toad_campaign_games_bool_exp): [toad_campaign_games!]!`
- `toad_campaign_games_aggregate(distinct_on: [toad_campaign_games_select_column!], limit: Int, offset: Int, order_by: [toad_campaign_games_order_by!], where: toad_campaign_games_bool_exp): toad_campaign_games_aggregate!`
- `toad_campaign_games_by_pk(id: Int!): toad_campaign_games`
- `toad_campaigns(distinct_on: [toad_campaigns_select_column!], limit: Int, offset: Int, order_by: [toad_campaigns_order_by!], where: toad_campaigns_bool_exp): [toad_campaigns!]!`
- `toad_campaigns_by_pk(id: uuid!): toad_campaigns`
- `toad_games(distinct_on: [toad_games_select_column!], limit: Int, offset: Int, order_by: [toad_games_order_by!], where: toad_games_bool_exp): [toad_games!]!`
- `toad_games_aggregate(distinct_on: [toad_games_select_column!], limit: Int, offset: Int, order_by: [toad_games_order_by!], where: toad_games_bool_exp): toad_games_aggregate!`
- `toad_games_by_pk(id: uuid!): toad_games`
- `toad_session_game_results(distinct_on: [toad_session_game_results_select_column!], limit: Int, offset: Int, order_by: [toad_session_game_results_order_by!], where: toad_session_game_results_bool_exp): [toad_session_game_results!]!`
- `toad_session_game_results_by_pk(id: Int!): toad_session_game_results`
- `toad_session_games(distinct_on: [toad_session_games_select_column!], limit: Int, offset: Int, order_by: [toad_session_games_order_by!], where: toad_session_games_bool_exp): [toad_session_games!]!`
- `toad_session_games_aggregate(distinct_on: [toad_session_games_select_column!], limit: Int, offset: Int, order_by: [toad_session_games_order_by!], where: toad_session_games_bool_exp): toad_session_games_aggregate!`
- `toad_session_games_by_pk(id: Int!): toad_session_games`
- `toad_sessions(distinct_on: [toad_sessions_select_column!], limit: Int, offset: Int, order_by: [toad_sessions_order_by!], where: toad_sessions_bool_exp): [toad_sessions!]!`
- `toad_sessions_aggregate(distinct_on: [toad_sessions_select_column!], limit: Int, offset: Int, order_by: [toad_sessions_order_by!], where: toad_sessions_bool_exp): toad_sessions_aggregate!`
- `toad_sessions_by_pk(id: uuid!): toad_sessions`
- `transaction(distinct_on: [transaction_select_column!], limit: Int, offset: Int, order_by: [transaction_order_by!], where: transaction_bool_exp): [transaction!]!`
- `transaction_aggregate(distinct_on: [transaction_select_column!], limit: Int, offset: Int, order_by: [transaction_order_by!], where: transaction_bool_exp): transaction_aggregate!`
- `transaction_by_pk(id: Int!): transaction`
- `transaction_type(distinct_on: [transaction_type_select_column!], limit: Int, offset: Int, order_by: [transaction_type_order_by!], where: transaction_type_bool_exp): [transaction_type!]!`
- `transaction_type_aggregate(distinct_on: [transaction_type_select_column!], limit: Int, offset: Int, order_by: [transaction_type_order_by!], where: transaction_type_bool_exp): transaction_type_aggregate!`
- `transaction_type_by_pk(type: String!): transaction_type`
- `user(distinct_on: [user_select_column!], limit: Int, offset: Int, order_by: [user_order_by!], where: user_bool_exp): [user!]!`
- `user_aggregate(distinct_on: [user_select_column!], limit: Int, offset: Int, order_by: [user_order_by!], where: user_bool_exp): user_aggregate!`
- `user_by_pk(id: Int!): user`
- `user_public_view(distinct_on: [user_public_view_select_column!], limit: Int, offset: Int, order_by: [user_public_view_order_by!], where: user_public_view_bool_exp): [user_public_view!]!`
- `user_role(distinct_on: [user_role_select_column!], limit: Int, offset: Int, order_by: [user_role_order_by!], where: user_role_bool_exp): [user_role!]!`
- `user_role_aggregate(distinct_on: [user_role_select_column!], limit: Int, offset: Int, order_by: [user_role_order_by!], where: user_role_bool_exp): user_role_aggregate!`
- `user_role_by_pk(id: Int!): user_role`
- `user_roles_view(distinct_on: [user_roles_view_select_column!], limit: Int, offset: Int, order_by: [user_roles_view_order_by!], where: user_roles_view_bool_exp): [user_roles_view!]!`
- `user_roles_view_aggregate(distinct_on: [user_roles_view_select_column!], limit: Int, offset: Int, order_by: [user_roles_view_order_by!], where: user_roles_view_bool_exp): user_roles_view_aggregate!`
- `xp_view(distinct_on: [xp_view_select_column!], limit: Int, offset: Int, order_by: [xp_view_order_by!], where: xp_view_bool_exp): [xp_view!]!`

## Semantic enums

- `__TypeKind`: `ENUM`, `INPUT_OBJECT`, `INTERFACE`, `LIST`, `NON_NULL`, `OBJECT`, `SCALAR`, `UNION`
- `audit_closure_type_enum`: `autoFailed`, `canceled`, `expired`, `failed`, `invalidated`, `reassigned`, `succeeded`, `unused`
- `group_status_enum`: `audit`, `finished`, `setup`, `working`
- `group_user_select_column_group_user_aggregate_bool_exp_bool_and_arguments_columns`: `accepted`
- `group_user_select_column_group_user_aggregate_bool_exp_bool_or_arguments_columns`: `accepted`
- `latest_progress_enum_name`: `campus`, `createdAt`, `eventId`, `grade`, `id`, `isDone`, `parentId`, `path`, `updatedAt`, `userId`, `version`
- `match_select_column_match_aggregate_bool_exp_bool_and_arguments_columns`: `bet`, `confirmed`, `result`
- `match_select_column_match_aggregate_bool_exp_bool_or_arguments_columns`: `bet`, `confirmed`, `result`
- `path_status_enum`: `deleted`, `renamed`
- `progress_by_path_view_select_column_progress_by_path_view_aggregate_bool_exp_bool_and_arguments_columns`: `succeeded`
- `progress_by_path_view_select_column_progress_by_path_view_aggregate_bool_exp_bool_or_arguments_columns`: `succeeded`
- `progress_select_column_progress_aggregate_bool_exp_bool_and_arguments_columns`: `isDone`
- `progress_select_column_progress_aggregate_bool_exp_bool_or_arguments_columns`: `isDone`
- `result_select_column_result_aggregate_bool_exp_bool_and_arguments_columns`: `isLast`
- `result_select_column_result_aggregate_bool_exp_bool_or_arguments_columns`: `isLast`
- `transaction_select_column_transaction_aggregate_bool_exp_bool_and_arguments_columns`: `isBonus`
- `transaction_select_column_transaction_aggregate_bool_exp_bool_or_arguments_columns`: `isBonus`

## Other operation roots

Authenticated introspection defines 51 mutation entry points and 151 subscription entry points. None were executed. Subscription validation and schema permissions would be separate work.
