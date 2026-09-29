# Todo 008 phase 4 access scope

Recorded before implementation/source inspection at `/tmp/todo-008-access-scope-manifest.md`; copied here for the audit trail.

Allowed reads:

- `/private/tmp/todo-008-trajectory/validator-packet.json`
- `/private/tmp/todo-008-trajectory/{pi-packages,buzz,ssmp}/**`
- current production `pi-tether` source, contracts, and tests
- this pre-registered protocol

Forbidden and not read:

- `pi-tether/experiments/trajectory-acceptance/labels/**`
- any `final-gold.json`
- agreement reports
- existing rubrics
- prior Mom maps/results
- parent conversation

Directory listings and Git commit subjects were not used as evidence. No forbidden file content is an input to the harness, classifier, observations, or predictions.
