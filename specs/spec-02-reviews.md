# Spec 02 — Reviews and roles

## Goal

Let people rate and comment on catalog titles, with moderation, **from the title detail panel**.

## Data

The data lives in `data/app.db`, a database **separate** from the catalog, created by versioned migrations.

- `users`: `id`, `email` (personal data), `display_name`, `role` (`user` or `moderator`), `created_at`.
- `reviews`: `id`, `user_id`, `title_kind` (`movie` or `show`), `title_id` (catalog id), `rating` (integer from 1 to 5), `body` (0 to 2000 characters), `status` (`visible` or `hidden`), `created_at`.

## Roles

| Action | Anonymous | `user` | `moderator` |
|---|---|---|---|
| Read visible reviews | yes | yes | yes |
| Write a review | no | yes, one per title | yes |
| Edit their own review | no | yes | yes |
| Hide or delete any review | no | no | yes |
| See hidden reviews | no | only their own | yes |

Identity is simulated with the `X-User-Id` header, because authentication is not the goal of the course. A missing header means anonymous. In the UI, a **user selector** ("Anonymous" plus the users from `GET /api/users`) sets that header.

## Domain rules

- The rating is an integer between 1 and 5. The domain rejects any other value.
- A title that does not exist in the catalog cannot be reviewed.
- A user cannot have two reviews of the same title.
- **The email never leaves the public API.** Only `display_name` is shown.

## Interfaces

- API:
  - `GET /api/titles/:kind/:id/reviews`
  - `POST /api/titles/:kind/:id/reviews`
  - `PATCH /api/reviews/:id`
  - `POST /api/reviews/:id/hide`
  - `DELETE /api/reviews/:id`
  - `GET /api/users`, which returns only `id`, `displayName` and `role`
- UI, in the detail panel:
  - the list of reviews with author and stars;
  - a form with the user selector, a 1–5 rating, and text with a character counter;
  - edit, hide and delete buttons, shown only when the selected user is allowed to use them.
- API errors (400, 403, 404, 409) are shown to the person in plain language, in an `aria-live` region.

## Acceptance criteria

- Tests per role for each row of the permission table: one allowed case and one denied case.
- A rating of 0 or 6 is rejected with a 400, and the UI explains why.
- No API response contains an `email` field.
- Review text is rendered as text, never as HTML: a review containing `<img onerror=…>` shows literally.
