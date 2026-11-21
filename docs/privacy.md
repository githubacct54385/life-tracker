# Privacy note

What Life Tracker stores about a person, who can see it, and how it is deleted. It is a plain description, not legal advice. It applies once per-person data ships (ADR-0026). Until then there is one person, the owner.

## What is stored

| About | What | Why |
|---|---|---|
| Your account | Your Google email address, your role (admin or user), when you were invited, when you joined, your last sign-in time | To let you in, and so an admin can see who uses the app |
| Your data | The weights, workouts, odometer readings, maintenance records and documents, giving entries, grocery list items and settings you enter | The app's purpose |
| Documents | Files you attach to a car service, kept in private storage | ADR-0024 |
| A request for access | The email and optional message (up to 200 characters) you send, until the owner answers or 30 days pass | So the owner can decide |
| An admin audit log | Which admin did what and when, by user id. It holds no health data and no email | To see who changed access |

The app stores no password (Google handles sign-in) and no raw uploaded spreadsheets or health exports (AGENTS.md, hard rule 5). Your data never appears in logs or telemetry (hard rule 6).

## Who can see it

- **You** see your own data and nobody else's.
- **An admin** sees the list of people: email, role, status, joined date and last sign-in. An admin cannot open anyone's health, mileage, giving or documents through the app.
- **The person who runs the database** can in principle read any table with the database admin login. That login is used only to apply migrations and is held in GitHub and Cloudflare secrets, never in the repository.
- Nothing is shared with other services except what sign-in and hosting need (Google for sign-in; Cloudflare and Neon for hosting and the database; Resend for a notice emailed to the owner, which holds no message text).

## Deleting your data

- **Yourself:** Settings, "Delete my data" (SET-09). You confirm by typing your email. The app deletes all your rows and your documents, ends your session and shows a confirmation with the date. In version 1 this is for people who are not admins.
- **An admin:** can remove your access (reversible, keeps your data) or delete your data (permanent). An admin cannot do this to their own data or another admin's.
- **Request for access:** a declined or unanswered request is deleted (after 30 days at most).

## Backups

Neon keeps point-in-time history for a restore window (the length depends on the plan, see [docs/backup-and-restore.md](backup-and-restore.md)). **Deleted data can remain in those backups until the window passes.** It cannot be reached through the app after deletion.

## Questions or a deletion request

Ask the person who invited you. They can delete your data from the Admin page.
