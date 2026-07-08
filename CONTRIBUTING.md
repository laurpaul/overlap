# Contributing

Bug reports and session exports are the most useful contributions. If a
session produced surprising behavior, attach the reconstruction CSV.

For code: `npm test` and `npm run lint` must pass, and mechanics changes
must include an A/B comparison on fixed seeds (see MC_RUN_PLAN.md for the
method). If your change alters simulation outcomes, say so in the PR and
update VERIFY.md's reference values in the same commit.

Keep the two-actor design constraint: Artemis and ILRS are always both
present. New actors join as a third party, not as a replacement.
