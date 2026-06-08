# Worked example

A short, fictional transcript and the summary it should produce. Note the Dutch line, which is translated to English in the output.

## Input transcript

```
[00:00:12] Sarah (PM): Thanks everyone for joining. Today is about the Q3 launch date.
[00:01:40] Tom (Eng): The API work is on track, but the migration script still fails on large tenants.
[00:03:05] Priya (Design): De nieuwe onboarding flow is af, ik stuur de specs vandaag door.
[00:04:22] Sarah (PM): Okay, so we hold the public date until the migration is stable. Tom, can you have a fix by Friday?
[00:04:55] Tom (Eng): Yes, Friday works.
[00:06:10] Sarah (PM): Decision then: soft launch June 20, public launch only after a clean migration run.
```

## Expected output

```markdown
Meeting: Q3 launch date review
Participants: Sarah (Product Manager), Tom (Engineering), Priya (Design)
Duration: 00:06
Source language: Dutch (one segment), translated to English

## Launch readiness

Sarah opened the meeting to settle the Q3 launch date [00:00:12]. Tom reported that the API work is on track, but the migration script still fails on large tenants, which is the main blocker [00:01:40]. Priya confirmed the new onboarding flow is finished and that she would send the specs over the same day [00:03:05].

## Launch timing

To avoid shipping on an unstable migration, Sarah set the public launch to follow a clean migration run rather than a fixed calendar date, and asked Tom for a fix by Friday, which he accepted [00:04:22].

## Decisions

A soft launch was set for June 20, with the public launch gated on a successful, clean migration run rather than a fixed date.

## Action items

| Owner | Task                                              | Deadline |
|-------|---------------------------------------------------|----------|
| Tom   | Fix the migration script failure on large tenants | Friday   |
| Priya | Send the onboarding flow specs                    | Same day |
```