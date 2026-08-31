# Audit 5 — FC26 Traditional through Apply

The production adapter now exposes the real FC26 controller's solve and guarded apply intents to React. The
overlay renders an explicit “Apply (not submit)” action only after a validated solution; submit is not part of
this session. The FC26 presenter labels the backend `rating_sum` as `ratingSum` and deliberately leaves
`teamRating` unset rather than misrepresenting the sum. Existing `GuardianApplyController` continues to verify
the current snapshot hash and routes exactly one `SBC_APPLY` mutation through Action Guard.
