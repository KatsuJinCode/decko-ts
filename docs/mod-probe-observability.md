# Event observation boundaries

An observed row difference needs comparable preparation. A control created,
updated and deleted has a different history from a probe only created and
deleted. Matching the final action alone is insufficient. The reducer now
requires the baseline and probe to have matching action prefixes for their
respective cards before comparing their row profiles.

The canonical Ruby 3.3.12 `probe-e34` control illustrates the problem: its
baseline delete inserts one card_changes row, while its probe delete inserts
seven. Their preparation differs by an update. This difference cannot establish
execution of the declared abstract asset callback. Historical completion
figures based on that difference remain historical and are not current callback
completeness evidence.

The generic planner also selects plain cards for abstract/lib declarations.
It does not establish membership in the actual abstract module. The reducer
therefore leaves these targets not-observed, even when their row counts differ.
This affects event attribution only: all raw oracle/port step comparisons and
their failures remain in the grade.

Matching action prefixes and concrete set membership are necessary checks;
they are not a general proof of named callback execution. Further work requires
nonmutating runtime callback observation and differential behavior controls.
The operation plan and capture must be versioned if that recording protocol or
its inputs change. No callback is credited merely because it is declared.

A separate CSS validation experiment provides a meaningful behavior control:
valid CSS creates/updates save in Ruby 3.3.12, and updating the same card shape
with an unfinished declaration returns a content validation error. Both port
adapters now save the valid controls through real LibSass. Their invalid-input
error is still exception-shaped rather than Ruby's field-shaped error; that
case remains nonconformant. These observations do not mark every style event
complete.
