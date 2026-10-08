# Decision records

Short records of the choices that are expensive to reverse. Each one states
what the situation was, what was decided, and what that costs — including
the cases where the answer is "this is a bounded gap, not a solved problem".

| Record | Decision |
| --- | --- |
| [0001](0001-byte-parity-against-ruby-oracle.md) | Byte parity against a Ruby oracle is the acceptance test. |
| [0002](0002-request-local-state-and-one-trip-rendering.md) | Request-local state, and one-trip rendering as an optional optimization. |
| [0003](0003-edge-native-driver-interfaces.md) | Edge-native SQL and blob driver interfaces; no vendor SDK in the engine. |
| [0004](0004-mods-compiled-into-the-view-registry.md) | Mods are compiled into the view registry rather than loaded at runtime. |
| [0005](0005-cql-match-semantics.md) | CQL `match`: one implementation, and fail loudly rather than return the wrong rows. |
| [0006](0006-gpl-derivative-work.md) | Licensing: a GPL-3.0-or-later derivative work. |

Numbering is stable. A superseded record is left in place with its status
changed rather than deleted, so the reasoning stays readable.