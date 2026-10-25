## Shared design

### Facts (Shared design)

- F-purpose: Deliver a seat reservation service for one seating area in which a
  booker holds a named seat for a fixed time through a tiny HTTP API, then
  confirms it, cancels it or lets it expire, so that one seat is never sold
  twice and every hold is released.
- C-public-port: Every operation and every observation of the service goes
  through the HTTP API. There is no command line interface and no other public
  port.
- C-hold-duration: One fixed hold duration applies to every seat. It is set when
  the service starts and defaults to 120 seconds. A hold cannot be extended or
  renewed.
- C-deadline-authoritative: The deadline is authoritative. A confirm or a cancel
  that arrives at or after the deadline is refused with the reason 'hold
  expired', and the seat is reported free. There is no grace window.
- C-hold-reference: Holding a seat returns a hold reference. Only the sender of
  that reference may confirm or cancel that hold. There are no accounts and no
  organizer override.
- C-demo-clock: The HTTP API offers one clearly marked demo-only operation that
  advances the clock, so that expiry is observable during a 90-minute
  demonstration.
- C-fixed-inventory: One event with one seating area is loaded when the service
  starts. The seat inventory cannot be changed while the service runs.
- C-in-memory: A single process holds all state in memory. Nothing survives a
  restart.
- C-structured-json: Every HTTP response body is structured JSON that a browser
  client can consume directly. No response is prose text.
- C-out-of-scope: Payment, accounts, waitlists, seat maps, a graphical user
  interface, several events, notifications, durable storage, hold extension and
  organizer override are out of scope.
- C-user-standards: TypeScript in strict mode, immutable data, pure functions,
  no 'any' and no unchecked type assertion, schema validation at the trust
  boundary, kebab-case file names, options objects for multi-parameter
  functions, and no explanatory comments in code.
- C-first-come: After a hold is released the seat goes to whoever asks first,
  including the previous holder. There is no queue and no fairness promise about
  who gets a released seat.
- D-lazy-expiry: Expiry is realized lazily: the stored seat record keeps a hold
  until a command replaces it, and one projection function compares the hold
  deadline with the injected clock on every read and on every command, so a hold
  whose deadline has passed is free at every observation. No background sweep
  and no timer writes to the store.
- D-lazy-expiry-evidence: An eager sweep needs a second writer whose run can lag
  behind the clock, which admits a confirm after the deadline. The Quint mutant
  that decides on the stored record instead of the projection violates the
  deadline property, so any command path that reads an unprojected record breaks
  the authoritative deadline.
- D-one-writer: One request handler at a time owns the seat store. The Node.js
  runtime runs the handler body to completion without interleaving, so a hold, a
  confirm and a cancel each read and write the store in one uninterrupted turn.
- D-public-report-hides-reference: The public seat report names the holder and
  the deadline but never the hold reference. The hold reference is returned
  once, in the response to the hold that created it. This resolves the brief's
  ambiguous phrase 'holder reference' and is what makes 'only the holder may
  confirm' observable.
- D-paradigm-functional: The design is functional: a pure total transition over
  immutable seat values in the domain, with the clock, the store, the hold
  reference generator and HTTP kept in a thin shell. The repository holds no
  production code, so there is no incumbent style to preserve, and the recorded
  user standards require immutable data and pure functions.
- D-checker-mapping: Quint with the Apalache backend covers the state-transition
  safety claims, because they are reachability properties of a small state
  machine. TLA+ with TLC covers the liveness claim, because weak fairness of the
  clock step cannot be expressed as a Quint invariant and Apalache temporal
  support is experimental. Agda covers totality and the local properties of the
  pure transition, because those are statements about all inputs rather than
  about a bounded run.
- D-http-surface: The HTTP surface is: GET /seats, GET /seats/{seatId}, POST
  /seats/{seatId}/holds, POST /seats/{seatId}/holds/{holdRef}/confirm, POST
  /seats/{seatId}/holds/{holdRef}/cancel, and the demo-only POST
  /demo/clock/advance. A granted hold answers 201, a successful confirm or
  cancel answers 200, a refusal answers 409, an unknown seat or hold reference
  answers 404, and a body that fails validation answers 400.
- D-node-http-server: The HTTP shell uses the Node.js built-in http module. No
  web framework is added, because the six routes above need none and every added
  dependency is a cost the requirement does not carry.
- D-zod-boundary: Zod parses every incoming request body and every path
  parameter at the HTTP boundary, and the response types are derived from the
  same schemas. The domain receives already-parsed values and never re-validates
  them.
- D-open-business-motivation: Open: no business motivation was supplied for this
  feature and the human confirmed that none exists. The benefit behind the
  outcomes stays unstated. Owner: the human.
- D-open-svelte-client: Open: a thin Svelte client on top of this API is out of
  scope for this feature. Whether it becomes a later value, a follow-up feature
  or work outside nWave delivery is undecided. Owner: the human. The design
  keeps every response as structured JSON so that such a client stays possible.
- D-restart-loses-state: A restart loses every hold and every sale. The service
  starts again from the fixed inventory with every seat free. This is accepted,
  not mitigated.
- D-clock-never-moves-back: The clock is assumed to move forward only. The demo
  advance operation accepts a positive number of seconds and refuses zero or a
  negative number, so the demonstration cannot move the clock backwards.
- D-simulation-is-not-verification: The Quint simulation run is labelled as
  simulation. Only the Apalache run is a bounded exhaustive check, and it is
  bounded: it explores runs of at most twelve steps over one seat, two bookers,
  a hold duration of two time units and a clock horizon of six.
- D-model-limits: The models establish properties of the design, not of a
  running service. They say nothing about elapsed wall-clock time, about the
  HTTP layer, about several processes, or about a restart. A tick in the TLA+
  slice is an abstract step, never a second.
- D-dependency-direction-law: Modules under src/domain import nothing from
  src/app and nothing from src/adapter. The dependency direction points inward,
  so the pure transition stays testable and the Agda proof keeps a matching
  runtime subject.
- D-demo-operation-marked: The demonstration-only nature of the clock operation
  is carried by its route path alone: it is reachable only under the /demo
  prefix. Its answer body is the current time alone, as {"now": \<whole
  seconds>}, and carries no field that marks the response as demonstration-only.
- T-build-metadata: The manifest, the lock file, the TypeScript configuration
  and the test runner configuration are test substrate, not product. The
  acceptance designer writes them before the first oracle runs, because every
  verification recipe begins by installing the declared dependencies and no
  oracle can execute without a runner. Craft changes none of them.
- T-domain-core: The pure seat values and the pure transition are the single
  owner of every seat rule. They hold the data the rules decide on.
- T-application-layer: The application layer wires the clock, the store and the
  hold reference generator to the pure transition and is the single caller that
  persists a new seat record.
- T-adapter-layer: The HTTP shell, the wire schemas, the in-memory store and the
  clock are the edge. They translate between the outside world and the pure core
  and hold no seat rule.
- T-composition-root: The composition root loads the fixed inventory and the
  hold duration, builds the adapters and starts the server. It is the only place
  that chooses concrete adapters.
- I-created-by-this-change: The repository holds no file at this path. This
  change creates it, so every consumer of it is created by this same change.
- R-greenfield: des code-fact answered an empty atom set over the repository
  root and an empty caller set for the seat operations, through the textsearch
  provider at noisy confidence, because the ast provider reported the target out
  of scope for a repository with no source file. The repository holds only
  documents, a licence and configuration, so no existing symbol can own any of
  these responsibilities.
- R-node-http: The Node.js built-in http module already owns HTTP request
  parsing and response writing. It is reused rather than wrapped in a framework.
- R-zod: Zod already owns schema parsing at a trust boundary and is the library
  the recorded user standards name. It is reused for the wire schemas rather
  than hand-written validation.
- R-fast-check: fast-check already owns generation, shrinking and replay for
  TypeScript properties. It is reused for every broad law rather than a
  hand-rolled generator.
- R-vitest: Vitest already owns test discovery and execution for TypeScript. It
  is reused as the native runner.
- B-driving-port: The driving port is the HTTP API served by the Node.js http
  server on a configured port. Every acceptance observation is made through it.
- B-driven-clock: The Clock port answers the current time in whole seconds. One
  adapter implements it: an advanceable clock seeded once from the system clock
  when the service starts, holding an offset that the demo advance operation
  increases.
- B-driven-store: The SeatStore port reads the record of one seat and writes a
  replacement record. The only adapter keeps a frozen map in process memory.
- B-driven-references: The HoldReferences port issues one fresh opaque hold
  reference. The adapter uses the runtime's random UUID generator.
- B-driven-config: The Configuration port answers the fixed seat inventory and
  the hold duration in seconds, both read once at start.
- B-dependency-direction: Dependencies point inward. src/adapter depends on
  src/app, src/app depends on src/domain, and src/domain depends on nothing in
  this repository. The ports are declared in src/app/ports.ts and implemented in
  src/adapter.
- B-fail-expired-condition: A confirm or a cancel arrives at or after the
  deadline of the hold it names.
- B-fail-expired-observation: HTTP 409 with reason code 'hold-expired', and the
  seat is reported free by the next observation.
- B-fail-held-condition: A hold is requested for a seat that is already held for
  somebody else.
- B-fail-held-observation: HTTP 409 with reason code 'seat-held', and the seat
  is still reported held for its current holder with its unchanged deadline.
- B-fail-sold-condition: A hold or a confirm is requested for a seat that is
  already sold.
- B-fail-sold-observation: HTTP 409 with reason code 'seat-sold', and the seat
  is still reported sold to its owner.
- B-fail-holder-condition: A confirm or a cancel carries a hold reference that
  is not the reference of the hold on that seat.
- B-fail-holder-observation: HTTP 404 with reason code 'no-such-hold', so a
  wrong reference cannot be told from an absent one and no reference can be
  guessed from the answer. No observation of the inventory changes.
- B-fail-seat-condition: A request names a seat identifier that is not in the
  fixed inventory.
- B-fail-seat-observation: HTTP 404 with reason code 'no-such-seat' and the
  identifier that was sent.
- B-fail-body-condition: A request body or a path parameter does not satisfy its
  schema: a missing booker name, a hold reference that is not a UUID, or an
  advance that is not a positive whole number of seconds.
- B-fail-body-observation: HTTP 400 with reason code 'invalid-request', the
  field path and what was expected, so the caller can repair the request without
  reading the source.
- B-fail-restart-condition: The process stops and starts again.
- B-fail-restart-observation: Every hold and every sale is lost. The service
  answers again from the fixed inventory with every seat free. No reader can
  tell a lost sale from a seat that was never sold.
- AT-dependency-direction: No module under src/domain contains an import whose
  specifier resolves into src/app or src/adapter, for every module under
  src/domain, including modules added after this change.
- P-no-existing-oracle: The repository holds no production code and no test, so
  there is no green oracle to observe before a move and no behaviour to
  preserve.
- A-no-second-party: This change creates the first version of the HTTP JSON
  contract. The repository holds no other producer and no other consumer of it.
  The only consumer is the acceptance oracle in the same deployable, which
  changes in the same commit, so it is covered by the primary oracle. The
  possible later Svelte client is undecided and has no locator.
- CT-no-independent-party: No party can change apart from the producer: there is
  no second deployable, no second release schedule and no persisted or wire
  datum that outlives the producer's version, because nothing survives a
  restart.
- ADR-context: A seat may be held, confirmed, cancelled or left to expire, and
  the human fixed the deadline as authoritative with no grace window. How expiry
  is realized decides whether that promise can be kept, and the decision is hard
  to reverse once the store has a second writer.
- ADR-decision: Realize expiry lazily through one projection applied on every
  read and every command, keep one writer for the seat store, and verify the
  resulting state machine with Quint and Apalache, the progress promise with
  TLA+ and TLC, and the pure transition with Agda.
- ADR-alt-sweep: A background sweep that releases expired holds on a timer.
  Rejected: it adds a second writer whose run can lag the clock, and the Quint
  mutant that decides on the unprojected record shows a confirm taking effect
  after its deadline.
- ADR-alt-eager-on-advance: Release expired holds eagerly inside the clock
  advance operation. Rejected: it keeps the deadline promise only while the
  clock moves through that one operation, so the promise would be false for the
  system clock in normal use.
- ADR-alt-grace: Accept a confirm shortly after the deadline through a grace
  window. Rejected: the human decided that there is no grace window.
- ADR-consequence-read-cost: Every read applies the projection, so a report is
  computed rather than stored. For one seating area this cost is not measurable;
  for a large inventory it would have to be measured.
- ADR-consequence-no-event: Nothing happens at the moment a hold expires. No
  notification and no event can be emitted at the deadline without adding the
  timer this decision rejects.
- ADR-consequence-clock-injected: The clock is a port, so the demonstration can
  move it. The same seam means the service trusts whoever holds the clock
  adapter.
- PO-shared-observation: Through the HTTP API a reader sees the whole fixed
  seating area: every seat of the configured inventory is listed exactly once
  and each is reported free, and the demo clock operation reports the time the
  service is using.
- PO-shared-stimulus: Start the service with the inventory ['s11','s12','s13']
  and a hold duration of 120 seconds on an ephemeral port, then send GET /seats
  and then POST /demo/clock/advance with 30 seconds followed by a second GET
  /seats.
- PO-shared-expected: The first GET /seats answers 200 with a JSON body listing
  exactly the three configured seat identifiers, each with status 'free' and
  with no holder and no deadline. The advance answers 200 with the body {"now":
  \<whole seconds>} and no other field, reporting a time thirty seconds later
  than the time reported before the call. The second GET /seats still lists the
  same three free seats, because moving the clock changes no seat that is free.
- PO-shared-falsifier: The oracle fails if the list is missing a configured
  seat, holds a seat that was never configured, reports any status other than
  'free', leaks a hold reference field, answers prose instead of JSON, if the
  advance answer carries any field besides now, or if the advance operation does
  not move the reported time by exactly the seconds it was given.
- O-seat-report: The report of one seat, as the HTTP API answers it: the seat
  identifier and either free, or held with the holder name and the deadline, or
  sold with the owner name.
- O-seat-report-blind: It never carries the hold reference, so it cannot tell
  two holds of the same booker with the same deadline apart, and it cannot tell
  a stored hold whose deadline has passed from a seat that was never held.
- O-inventory: The report of the whole seating area: the report of every
  configured seat, in the configured order.
- O-inventory-blind: It cannot tell which hold reference is current, how many
  holds a seat has had, or how long a sold seat has been sold.
- O-outcome: The outcome of one command, as the HTTP API answers it: the status
  code and either a granted hold with its reference and deadline, or a
  confirmation, or a cancellation, or a refusal with a machine reason code.
- O-outcome-blind: A refusal with reason no-such-hold cannot tell a wrong hold
  reference from one that never existed, which is deliberate so that no
  reference can be guessed from the answer.
- O-clock: The time the service is using, as the demo clock operation answers
  it, in whole seconds.
- O-clock-blind: It cannot tell a system clock from a demonstration offset, and
  it carries no time zone and no date.
- E-equality: Two service states are equal when the inventory observation and
  the clock observation agree on them. This deliberately makes a stored hold
  whose deadline has passed equal to a free seat, which is the lazy expiry claim
  written as an equality.
- G-walk-domain: A command walk over the fixed inventory: hold with a booker
  drawn from a closed set of three names, confirm or cancel with a hold
  reference drawn from the references already granted plus one reference that
  was never granted, and clock advances of whole seconds drawn from 1 to 300,
  all applied through the public service surface.
- G-walk-seed: fast-check chooses the seed and prints it with the shrink path on
  failure. A failing seed and path are pinned into the same property as a replay
  case, so the counterexample runs again on every later run.
- G-must-at-deadline: A confirm issued at exactly the deadline second of the
  hold it names.
- G-must-one-before: A confirm issued exactly one second before the deadline of
  the hold it names.
- G-must-wrong-ref: A confirm and a cancel carrying a hold reference that was
  never granted for that seat.
- G-must-held-seat: A hold requested for a seat that is already held.
- G-must-big-jump: A clock advance larger than several hold durations in one
  call.
- G-must-sold-seat: A hold and a confirm requested for a seat that is already
  sold.
- L-sold-is-absorbing-stmt: Once the inventory observation reports a seat sold
  to a booker, every later inventory observation reports that seat sold to the
  same booker, whatever commands and clock advances follow.
- L-sold-is-absorbing-oracle: The walk keeps its own record of the first booker
  each seat was ever sold to, built from the granted outcomes alone, and
  compares every later inventory observation with that record.
- L-sold-is-absorbing-fal: The law fails if any inventory observation reports a
  seat that was sold as free or held, or sold to a different booker.
- L-deadline-is-authoritative-stmt: A confirm or a cancel whose outcome
  observation is a success was sent strictly before the deadline the hold
  reported. At or after that deadline the outcome is a refusal with reason
  hold-expired and the seat report is free.
- L-deadline-is-authoritative-oracle: The walk reads the clock before each
  command and keeps the deadline the hold returned, then compares the two
  numbers itself without asking the service which branch it took.
- L-deadline-is-authoritative-fal: The law fails if a success is observed while
  the clock observation is greater than or equal to the reported deadline, or if
  a command sent before the deadline is refused with hold-expired.
- L-only-the-holder-acts-stmt: A confirm or a cancel carrying any value other
  than the hold reference the hold returned is refused, and the inventory
  observation after it equals the inventory observation before it.
- L-only-the-holder-acts-oracle: The walk keeps the reference each hold returned
  and sends a different one, then compares the inventory observation taken
  before the command with the one taken after it.
- L-only-the-holder-acts-fal: The law fails if a command with a reference that
  was never granted for that seat changes any inventory observation or is
  answered as a success.
- L-hold-only-on-free-stmt: A hold is granted only when the seat report before
  the command is free. For any other seat report the outcome is a refusal and
  the inventory observation does not change.
- L-hold-only-on-free-oracle: The walk reads the seat report immediately before
  every hold and decides itself whether a grant was allowed.
- L-hold-only-on-free-fal: The law fails if a hold is granted while the
  preceding seat report is held or sold, or if a refused hold changes the
  inventory observation.
- L-refusal-is-inert-stmt: After a command whose outcome observation is a
  refusal, the inventory observation and the clock observation are identical to
  the ones taken immediately before that command.
- L-refusal-is-inert-oracle: The walk takes the whole inventory observation and
  the clock observation before and after every command and compares the two
  snapshots field by field.
- L-refusal-is-inert-fal: The law fails if any refusal changes a status, a
  holder, a deadline or the reported time, including a refused hold that quietly
  refreshes the deadline of the existing hold.
- L-deadline-is-now-plus-duration-stmt: The deadline of a granted hold equals
  the clock observation taken at the moment of the grant plus the configured
  hold duration in seconds, for every seat and every booker.
- L-deadline-is-now-plus-duration-oracle: The walk reads the clock observation
  immediately before the hold and adds the configured duration itself, instead
  of reading the number the service returned.
- L-deadline-is-now-plus-duration-fal: The law fails if any granted deadline
  differs from the independently computed sum, for example because the duration
  is read from a second place or a grace window is added.
- L-report-is-idempotent-stmt: Two inventory observations taken without any
  command and without any clock advance between them are equal.
- L-report-is-idempotent-oracle: The walk takes the inventory observation twice
  in a row at arbitrary points of the walk and compares the two results.
- L-report-is-idempotent-fal: The law fails if reading the seating area changes
  it, for example because the report writes an expired hold back to the store.
- L-every-hold-is-released-stmt: For every granted hold, once the clock has been
  advanced past its deadline the seat report is free or sold, and never held.
- L-every-hold-is-released-oracle: The walk keeps every granted deadline and,
  after each clock advance, checks every seat whose deadline the new clock
  observation has passed.
- L-every-hold-is-released-fal: The law fails if any seat is still reported held
  while the clock observation is greater than or equal to the deadline that hold
  reported.
- L-wire-stmt: Every response body parses against its declared response schema,
  and every refusal body carries a machine reason code from the closed set
  hold-expired, seat-held, seat-sold, no-such-hold, no-such-seat,
  invalid-request, together with a human message.
- W-case-granted: A granted hold answers 201 with a hold reference and a
  deadline.
- W-case-confirmed: A successful confirm answers 200 with the seat sold to the
  holder.
- W-case-cancelled: A successful cancel answers 200 with the seat free.
- W-case-expired: A confirm at or after the deadline answers 409 with reason
  code hold-expired.
- W-case-held: A hold on a held seat answers 409 with reason code seat-held.
- W-case-sold: A hold or a confirm on a sold seat answers 409 with reason code
  seat-sold.
- W-case-no-hold: A confirm or a cancel with an unknown hold reference answers
  404 with reason code no-such-hold.
- W-case-no-seat: A request for an unknown seat answers 404 with reason code
  no-such-seat.
- W-finite-reason: The response shapes and the refusal reason codes are a closed
  finite set, so named cases cover the whole domain and generation would add no
  reachable case.
- CC-one-holder-prop: A seat record cannot represent two holders, two hold
  references or two deadlines at the same time.
- CC-one-holder-harm: Two holders on one seat would let two bookers both
  confirm, so one seat would be sold twice and one of the two bookers would
  arrive to an occupied seat.
- CC-one-holder-input: A seat identifier from the fixed inventory, a booker name
  parsed at the HTTP boundary, and one hold reference issued by the
  HoldReferences port.
- CC-one-holder-bypass: JSON.parse of an incoming body, an unchecked assertion,
  or any future writer that builds a seat record without the heldBy constructor
  can still build a wrong value. The HTTP boundary parses with Zod and the store
  accepts only values of the declared union, so the bypass needs new code to
  open.
- CC-sold-prop: The sold variant of the seat record carries an owner and nothing
  else, so no deadline and no hold reference exist on a sold seat for any rule
  to read.
- CC-sold-harm: A deadline on a sold seat would let the expiry projection
  release a seat that has been paid for, and the buyer would lose it.
- CC-sold-input: A held seat record whose hold reference matches the one
  presented, at a clock value strictly before its deadline.
- CC-sold-bypass: A later change that adds a deadline field to the sold variant
  would reopen it. The Quint mutant that applies the expiry projection to sold
  seats shows exactly that failure, so the regression has a counterexample on
  record.
- CC-ref-prop: A hold reference is an opaque branded value that only the
  HoldReferences port produces, so no caller can build one from a seat
  identifier or a booker name.
- CC-ref-harm: A guessable or constructible reference would let a second booker
  confirm or cancel somebody else's hold.
- CC-ref-input: No input: the port draws a fresh value from the runtime random
  UUID generator.
- CC-ref-bypass: An unchecked assertion from string to the branded type, which
  the recorded user standards forbid and the TypeScript configuration cannot
  prevent on its own.
- CC-proj-prop: Every command and every report reads the seat through the one
  projection that compares the deadline with the injected clock, so no code path
  can decide on an unprojected record.
- CC-proj-harm: A path that reads the stored record directly would accept a
  confirm after the deadline, which is the exact failure the human ruled out
  when deciding that the deadline is authoritative.
- CC-proj-input: A stored seat record and a clock value in whole seconds.
- CC-proj-bypass: A future caller that reads the SeatStore port directly instead
  of going through the application service. The architectural check on
  dependency direction does not catch this one, so it stays an open risk carried
  by review.
- AD-free: A seat that is free and can be held by anybody.
- AD-held: A seat held by exactly one booker, with exactly one hold reference
  and exactly one deadline that the clock has not yet reached.
- AD-sold: A seat sold to exactly one booker, with no deadline and no hold
  reference.
- AD-expired: A stored hold whose deadline the clock has reached, which every
  observation reports as free.
- EX-two-holders: A seat held for two bookers at once.
- EX-two-owners: A seat sold to two bookers, or sold to a second booker after a
  first sale.
- EX-sold-released: A sold seat returning to free or to held.
- EX-held-no-deadline: A held seat with no deadline or with a deadline the clock
  has already passed that is still reported held.
- EX-late-confirm: A confirm or a cancel taking effect at or after the deadline
  of the hold it names.
- EX-hold-on-taken: A hold granted on a seat that is already held or already
  sold.
- EX-silent-refusal: A refusal that changes the inventory observation or the
  reported time.
- UN-clock-back: What the service reports if the host clock moves backwards, for
  example after a time synchronisation step. The design assumes forward-only
  time and does not detect a backward jump.
- UN-clock-back-owner: The human, as a product decision about whether a backward
  clock must be detected at all.
- UN-demo-exposure: Whether the demonstration clock operation must be refused
  outside the workshop. It is always available in this design and anybody who
  can reach the API can move the clock.
- UN-demo-exposure-owner: The human, as a deployment and exposure decision.
- UN-client-shape: What a browser client needs in the wire format beyond the
  fields named here, which cannot be known until the Svelte question is decided.
- UN-client-shape-owner: The human, together with the later client decision.
- UN-concurrent-host: What happens if the service is ever run as more than one
  process or on a runtime that interleaves handler bodies. The single-writer
  argument rests on one process and on handler bodies that run to completion.
- UN-concurrent-host-owner: The architect, as an explicit limit of the current
  design that must be reopened before any second process is added.
- UN-restart-loss: The state after a restart: every hold and every sale is lost
  and no reader can tell a lost sale from a seat that was never sold.
- UN-restart-loss-owner: The human, who accepted in-memory state and no durable
  storage.
- MA-soldOwner: A ghost record of the first booker each seat was ever sold to.
  It exists only to state that a sale never changes, and has no counterpart in
  the service.
- MA-priorStored: A ghost snapshot of the seat records before the current step,
  so that a refusal can be compared with the state it was supposed to leave
  alone.
- MA-priorSold: A ghost snapshot of the sale record before the current step.
- MA-priorNextRef: A ghost snapshot of the reference counter before the current
  step, so that a refusal that quietly consumes a reference is visible.
- MA-atomicity: The Node.js runtime runs a request handler body to completion
  without interleaving another handler, so the read of the seat record, the
  decision and the write of the replacement happen in one uninterrupted turn of
  the event loop. There is one process and one store.
- MA-init-site: The initial state of the model: the configured inventory with
  every seat free and the clock at zero. In the service this is the composition
  root loading the inventory.
- MT-init: The service starts. The seating area is {stored} and the clock reads
  {clock}.
- MT-hold: A booker asks to hold the seat at time {clock}. Before the request
  the seating area was {priorStored}; after it the seating area is {stored}. The
  service answered {last}.
- MT-confirm: A booker presents a hold reference to confirm the seat at time
  {clock}. Before the request the seating area was {priorStored}; after it the
  seating area is {stored}. The service answered {last}.
- MT-cancel: A booker presents a hold reference to cancel the hold at time
  {clock}. Before the request the seating area was {priorStored}; after it the
  seating area is {stored}. The service answered {last}.
- MT-advance: The demonstration clock moves from {clock@pre} to {clock}. The
  stored seating area is {stored} and the service answered {last}.
- MP-SoldStable: A seat that has been sold stays sold to its first buyer for
  ever.
- MP-HeldIsActive: A seat reported as held always has a deadline that the clock
  has not yet reached.
- MP-AuthorizedOnly: Only a command carrying the hold reference of the current
  hold confirms or cancels it.
- MP-DeadlineAuthoritative: A confirm or a cancel that took effect happened
  strictly before the deadline of the hold it named.
- MP-HoldOnlyWhenFree: A hold is granted only on a seat that was free at that
  moment.
- MP-RefusalIsInert: A refused command leaves the seat records, the sale record
  and the reference counter unchanged.
- MW-NoConfirmOneTickBeforeDeadline: The predicate
  NoConfirmOneTickBeforeDeadline belongs to the model only. It is never a claim
  about the service: it is denied so that the checker produces the trace that
  illustrates it.
- MPW-NoConfirmOneTickBeforeDeadline: A witness that denies a confirm landing
  exactly one tick before the deadline, so that its counterexample is the trace
  where the confirm just succeeds.
- MW-NoConfirmExactlyAtDeadline: The predicate NoConfirmExactlyAtDeadline
  belongs to the model only. It is never a claim about the service: it is denied
  so that the checker produces the trace that illustrates it.
- MPW-NoConfirmExactlyAtDeadline: A witness that denies a refusal with reason
  hold expired issued at exactly the deadline, so that its counterexample is the
  confirm-against-expiry race at the deadline second.
- MW-NoSoldSeatAfterTheDeadline: The predicate NoSoldSeatAfterTheDeadline
  belongs to the model only. It is never a claim about the service: it is denied
  so that the checker produces the trace that illustrates it.
- MPW-NoSoldSeatAfterTheDeadline: A witness that denies a sold seat still being
  sold well after the old hold deadline, so that its counterexample shows that
  expiry never releases a sale.
- MW-NoSecondBookerRefused: The predicate NoSecondBookerRefused belongs to the
  model only. It is never a claim about the service: it is denied so that the
  checker produces the trace that illustrates it.
- MPW-NoSecondBookerRefused: A witness that denies a refusal with reason seat
  held, so that its counterexample shows a second booker turned away.
- MC-BOOKERS: A bound of the model. Two bookers, which is the smallest number
  that can compete for one seat.
- MC-HORIZON: A bound of the model. The clock ceiling of the model, set to six,
  which bounds an otherwise infinite state space.
- MC-REFS: A bound of the model. The hold references a command may present,
  including values that were never granted.
- MC-DELTAS: A bound of the model. The clock steps the demonstration operation
  may take, one or two time units.
- MU-m1-confirm-ignores-deadline: Confirm and cancel read the stored seat record
  instead of the lazily expired projection, so a hold can be confirmed at or
  after its deadline.
- MU-m2-hold-on-held-seat: A hold is granted on a seat that is already held for
  somebody else.
- MU-m3-cancel-ignores-reference: Cancel accepts any hold reference, so a booker
  who is not the holder cancels the hold.
- MU-m4-expiry-releases-sold-seat: The expiry projection is applied to sold
  seats as well, so a sold seat is reported free once the clock reaches twice
  the hold duration.
- MU-m5-refused-hold-extends-deadline: A refused hold still refreshes the
  deadline of the existing hold, so a refusal is not inert.
- MU-m6-holds-never-expire: The deadline is never treated as reached, so a hold
  is reported as held for ever.
- MQ-a1: One seat, two bookers, a hold duration of two time units and a clock
  ceiling of six. Apalache explored every run of at most twelve steps within
  those bounds.
- MQ-a2: Each command is one atomic step. Two requests never interleave inside
  the model, which matches one Node.js process running handler bodies to
  completion and matches nothing else.
- MQ-a3: Model time is a whole number with no unit. The model says nothing about
  seconds, about latency or about the real clock.
- MQ-a4: The model carries no HTTP layer, no body parsing and no transport
  failure.
- MT-remaining: A countdown of abstract ticks that replaces absolute time, so
  that the state space is finite without a clock ceiling. The service keeps a
  deadline instead; the two agree on the order of events and on nothing else.
- TT-hold: A booker holds the seat. The seating area becomes {status} held for
  {holder} with {remaining} ticks left.
- TT-confirm: The holder confirms. The seating area becomes {status} for
  {holder}.
- TT-cancel: The holder cancels. The seating area becomes {status} and the
  holder is {holder}.
- TT-tick: The clock moves one tick. The hold has {remaining} ticks left and the
  seating area is {status}.
- TT-tick-note: One tick is one abstract step of the clock. In the service the
  clock moves by itself and by the demonstration operation, and neither is
  atomic with a request.
- TP-released: A seat that is reported held eventually stops being reported
  held, whether by confirmation, by cancellation or by the deadline passing.
- TP-sold: A sold seat is still observed as sold in every state of the
  projection.
- TP-typeok-site: A shape invariant of the model's own variables. It has no
  counterpart in the service, where the TypeScript checker carries the same
  duty.
- TP-typeok: Every seat has a status from the closed set, a holder from the
  closed set and a countdown within its bounds.
- TC-bookers: Two model values standing for any two distinct bookers. The
  service accepts any parsed booker name.
- TC-nobooker: A model value standing for the absence of a holder. The service
  represents it by the free variant carrying no holder at all.
- TA-a1: Weak fairness of the clock tick: while some hold still has time left,
  the clock eventually moves. In the service that obligation belongs to the
  operating system clock in normal use and to the demonstration operation during
  the workshop.
- TA-a2: One seat, two bookers and a hold duration of two ticks. The whole state
  graph has nine distinct states, so the check is exhaustive within that
  projection.
- TA-a3: A tick is an abstract step and never a second. The check establishes
  order of events, never elapsed time.
- TA-a4: Deadlock checking is switched off, because a sold seat with no further
  command is a legitimate final state of this projection, where refusals are not
  modelled as steps.
- TA-a5: Hold references and refusal reasons are projected away; the Quint model
  carries them.
- MU-m7: A hold request on a seat that is already held renews that hold instead
  of being refused, so the clock keeps ticking while the seat is never released.
- AT-step: The pure transition takes a time, a command and a {SeatState}, and
  returns the next {SeatState} with its {Outcome}.
- AT-step-note: The transition is a pure function of its arguments. It performs
  no effect, so atomicity is a question for its single caller in the application
  service, not for the function.
- AT-view: The expiry projection takes a time and a {SeatState} and returns the
  {SeatState} every observation sees.
- AP-sold-is-absorbing: For every time, every command and every booker, applying
  the transition to a sold seat returns that same sold seat.
- AP-confirm-respects-deadline: For every time, hold, reference and booker, if
  the outcome of a confirm on a held seat is a confirmation, then the time is
  strictly less than the deadline.
- AP-confirm-only-by-the-holder: For every time, hold, reference and booker, if
  the outcome of a confirm on a held seat is a confirmation, then the reference
  presented equals the reference of the hold.
- AP-cancel-respects-deadline: For every time, hold and reference, if the
  outcome of a cancel on a held seat is a cancellation, then the time is
  strictly less than the deadline.
- AP-cancel-only-by-the-holder: For every time, hold and reference, if the
  outcome of a cancel on a held seat is a cancellation, then the reference
  presented equals the reference of the hold.
- AP-hold-only-when-free: For every time, booker, reference, duration and seat
  state, if the outcome of a hold is a grant, then the projection of that seat
  state at that time is free.
- AP-view-is-idempotent: For every time and every seat state, applying the
  expiry projection twice gives the same result as applying it once.
- AA-a1: The module is accepted with the safe flag, so it holds no postulate, no
  hole and no unchecked termination. Totality of the transition is therefore
  checked, not asserted.
- AA-a2: Bookers, references and times are natural numbers. The service uses
  strings and branded UUID values; the proof covers the ordering and equality
  those stand for, not their encoding.
- AA-a3: The proof covers the pure transition alone. It says nothing about the
  store, the HTTP shell, concurrency or elapsed time.
- AA-a4: The Agda definitions are a second writing of the same transition. Their
  agreement with the TypeScript implementation is an obligation the crafter
  carries, not a checked fact.
- MU-m8: The transition reads the stored seat record instead of the expiry
  projection when confirming, so an expired hold can be confirmed. Agda refuses
  the module: the deadline property no longer holds.
- SUBJ-shared: The seating area is reported through the HTTP API: every
  configured seat appears exactly once with its current status, and the
  demonstration clock reports the time the service is using.
- SUBJ-v1: A booker holds a free seat through the HTTP API and the seat is then
  reported as held for that booker until a stated deadline.
- SUBJ-v2: The holder confirms their held seat through the HTTP API before its
  deadline and the seat is then reported as sold to that holder.
- SUBJ-v3: A second booker is refused a seat that is held or sold, and only the
  holder of the hold reference can confirm it, so one seat is never sold twice.
- SUBJ-v4: An unconfirmed hold is released, at once when the holder cancels and
  automatically when its deadline passes, and the seat is then reported free,
  while a sold seat is never released.
- CL-fairness: Weak fairness of the clock step: while some hold still has time
  left, the clock eventually moves. The operating system clock carries that
  obligation in normal use and the demonstration operation carries it during the
  workshop. Finite-state checking proves neither real scheduling nor elapsed
  seconds.
- CL-bound: Apalache explored every run of at most twelve steps over one seat,
  two bookers, a hold duration of two time units and a clock ceiling of six.
  Outside those bounds the safety claim is not checked.
- CL-oneproc: One process, one seat store, and request handler bodies that run
  to completion without interleaving.
- CL-dnb: No production code exists yet. Every runtime axis is designed and not
  built, and the acceptance oracles are the only thing that will move it.
- CLS-0-safety: Every observation of the seating area reports each configured
  seat exactly once and never reports a hold whose deadline has passed as held.
- CLS-0-inhab: A configured inventory and a hold duration produce a service
  whose seating-area report can actually be built and answered.
- CLS-0-input: The seat identifiers and hold duration the composition root reads
  when the process starts.
- CLS-0-reach: A reader reaches that report through GET /seats on the real HTTP
  port, with no private entry point.
- CLS-0-reach-input: An HTTP GET request for /seats on the port the service
  listens on.
- CLS-0-live-na: Reporting the seating area is one synchronous request and one
  answer. It carries no progress obligation, so there is nothing for a temporal
  property to say about it.
- CLS-1-safety: A hold is granted only on a seat that is free at that moment,
  and the seat is then held for exactly one booker with exactly one deadline.
- CLS-1-inhab: A free seat and a booker name produce a granted hold carrying a
  reference and a deadline.
- CLS-1-input: A seat identifier from the configured inventory and a booker name
  parsed from the request body.
- CLS-1-reach: The booker reaches the grant through POST /seats/{seatId}/holds
  and sees the result through GET /seats/{seatId}.
- CLS-1-reach-input: An HTTP POST to /seats/{seatId}/holds carrying a booker
  name.
- CLS-1-live-na: Granting a hold is one synchronous request and one answer. The
  promise that the hold is later released belongs to the fourth value, not to
  this one.
- CLS-2-safety: A confirmation takes effect only strictly before the deadline
  and only for the holder of the hold reference, and the resulting sale never
  changes.
- CLS-2-inhab: A held seat and its own hold reference, presented before the
  deadline, produce a sale to the holder.
- CLS-2-input: The hold reference returned by the hold that created the hold,
  and a clock value strictly below its deadline.
- CLS-2-reach: The holder reaches the sale through POST
  /seats/{seatId}/holds/{holdRef}/confirm and sees it through GET
  /seats/{seatId}.
- CLS-2-reach-input: An HTTP POST to /seats/{seatId}/holds/{holdRef}/confirm.
- CLS-2-live-na: Confirming is one synchronous request and one answer, and a
  sale is final, so no progress obligation remains after it.
- CLS-3-safety: No seat is ever sold to two bookers: a hold is refused on a held
  or sold seat, a confirmation is refused for anyone but the holder, and every
  refusal leaves the seating area unchanged.
- CLS-3-inhab: A held or sold seat and a second booker produce a refusal
  carrying a machine reason code.
- CLS-3-input: A seat identifier whose current report is held or sold, and a
  booker name or hold reference that is not the holder's.
- CLS-3-reach: The second booker reaches the refusal through the same public
  hold and confirm routes any booker uses, and sees the unchanged seat through
  GET /seats/{seatId}.
- CLS-3-reach-input: An HTTP POST to the hold or confirm route for a seat that
  another booker already holds or owns.
- CLS-3-live-na: A refusal is immediate and final. The human decided that there
  is no queue and no fairness promise about who gets a released seat, so no
  booker is owed eventual success.
- CLS-4-safety: An unconfirmed hold is released by cancellation or by the
  deadline passing, and a sold seat is never released by either.
- CLS-4-inhab: A held seat whose deadline the clock has passed, or whose holder
  cancels, produces a free seat report that a new hold can use.
- CLS-4-input: A held seat together with either its own hold reference for a
  cancellation or a clock value at or beyond its deadline.
- CLS-4-reach: The release is reached through POST
  /seats/{seatId}/holds/{holdRef}/cancel or through the demonstration clock
  operation, and is observed through GET /seats/{seatId}.
- CLS-4-reach-input: An HTTP POST to the cancel route, or an HTTP POST to
  /demo/clock/advance with enough seconds to pass the deadline.
- CLS-4-live: Every hold eventually stops being reported as held, whether by
  confirmation, by cancellation or by the deadline passing.
- CL-live-bound: One seat, two bookers and a hold duration of two ticks, over a
  state graph of nine states. A tick is an abstract step and never a second, so
  elapsed time remains an unchecked runtime obligation.
- SC-sc-confirm-just-in-time: The confirm that just makes it: the booker
  confirms one tick before the deadline and the seat becomes sold.
- SC-sc-confirm-at-deadline: The confirm against expiry at the deadline second:
  the booker holds the seat, the clock reaches the deadline, the booker confirms
  with the right reference and is refused because the hold expired.
- SC-sc-cancel-at-deadline: The same race for a cancellation: the holder cancels
  at the deadline second and is refused because the hold has already expired.
- SC-sc-sold-survives-deadline: The clock runs well past the old deadline and
  the sold seat is still sold, so expiry never releases a sale.
- SC-sc-second-booker-refused: A second booker asks for a seat that is held and
  is refused, and the first booker keeps the seat.
- SC-sc-mutant-late-confirm: What a service that reads the stored record instead
  of the expiry projection does: it accepts a confirmation after the deadline
  and sells a seat it had already reported free.
- SC-sc-mutant-expiry-steals-sale: What a service that applies expiry to sold
  seats does: it reports a paid seat as free once enough time has passed.
- SC-sc-mutant-double-hold: What a service that grants a hold on a held seat
  does: it hands the same seat to a second booker while the first still holds
  it.
- D-agda-mutant-rejected: Agda refuses the mutant module
  docs/feature/last-seat/model/SeatSafetyMutant.agda, which drops the expiry
  projection from the confirm path, so the deadline property of the pure
  transition is falsifiable and not vacuous. The typed model grammar accepts a
  kill only from a state-model checker, so this rejection is carried by the
  module and its recorded run instead of a kill row.
- D-substrate-policy: package.json declares "type": "module" and engines.node
  matching the installed Node v24.9.0, and pins exact versions, with no range
  prefix, for typescript, vitest, fast-check, zod and @types/node.
  package-lock.json is committed so that the installation step is reproducible.
  Production source lives under src/ and tsconfig.json carries the strict
  settings the recorded user standards name, including strict, noImplicitAny,
  strictNullChecks, noUnusedLocals, noUnusedParameters, noImplicitReturns and
  noFallthroughCasesInSwitch. vitest.config.ts includes tests/**/*.test.ts and
  nothing else. No script beyond what the verification argv already calls is
  needed.
- W-case-invalid-booker: A hold whose body does not name the booker answers 400
  with reason code invalid-request and the path of the field that failed.
- W-case-invalid-holdref: A confirm or a cancel whose path carries a hold
  reference that is not a UUID answers 400 with reason code invalid-request and
  the path of the field that failed.
- W-case-invalid-advance: A demo clock advance whose body does not carry a
  positive whole number of seconds answers 400 with reason code invalid-request
  and the path of the field that failed.
- D-one-clock-adapter: The composition root in src/main.ts wires exactly one
  clock adapter, the advanceable clock of the Clock port, seeded from the system
  clock at start with a zero offset. No separate production clock adapter ships,
  because that clock with a zero offset already answers the system time and a
  second adapter nothing calls would be a name with no caller.
- D-cancel-on-sold-reason-undeclared: A cancel presented for a seat that is
  already sold is refused and changes nothing. The reason code of that refusal
  is undeclared: the oracle asserts the refusal and that the seat report and the
  seating area are unchanged, and asserts no reason code for it.
- D-schema-refusal-coverage: Each schema refusal of the wire is a case of its
  own: a hold that does not name the booker, a confirm or cancel path parameter
  that is not a UUID, and a demo clock advance that is not a positive whole
  number of seconds. Value 1 carries the missing booker case and the advance
  case, because the hold route and the demo clock route ship in value 1. Value 2
  and value 4 carry the non-UUID hold reference case, because the confirm route
  ships in value 2 and the cancel route ships in value 4, and a path parameter
  of a route that does not yet exist cannot be refused for its shape.
- D-shared-obligation-in-value-1: The shared walking-skeleton obligation is
  discharged inside the value 1 oracle at
  tests/acceptance/hold-a-free-seat.test.ts, which carries it as an acceptance
  obligation of value 1: before any command GET /seats lists every configured
  seat exactly once, free, with no holder and no deadline, the demo clock
  operation answers {"now": \<whole seconds>}, and an advance moves the reported
  time by exactly the seconds it was given. No separate shared oracle file
  ships.
- D-wire-contract-pinned: The wire contract is: the service starts with 'node
  src/main.ts' and reads the seat inventory from SEAT_INVENTORY, the hold
  duration from HOLD_DURATION_SECONDS and the listening port from PORT, bound to
  127.0.0.1. A seat report carries seatId, status, the holder of a held seat or
  the owner of a sold seat, and the deadline of a held seat. A successful
  confirm and a successful cancel answer 200 with the report of that seat. A
  refusal answers {reason, message}. The demo clock answers {now}. There is no
  read-only clock route. No seat report and no seating-area answer carries a
  hold reference.

### Targets (Shared design)

| Path | Decision | Reason |
|---|---|---|
| `src/domain/seat-state.ts` | CREATE_NEW | T-domain-core |
| `src/domain/seat-transition.ts` | CREATE_NEW | T-domain-core |
| `src/app/ports.ts` | CREATE_NEW | T-application-layer |
| `src/app/seat-service.ts` | CREATE_NEW | T-application-layer |
| `src/adapter/http/wire.ts` | CREATE_NEW | T-adapter-layer |
| `src/adapter/http/seat-routes.ts` | CREATE_NEW | T-adapter-layer |
| `src/adapter/memory/in-memory-seat-store.ts` | CREATE_NEW | T-adapter-layer |
| `src/adapter/clock.ts` | CREATE_NEW | T-adapter-layer |
| `src/main.ts` | CREATE_NEW | T-composition-root |

### Paradigm (Shared design)

functional

### Decisions (Shared design)

D-lazy-expiry, D-lazy-expiry-evidence, D-one-writer,
D-public-report-hides-reference, D-paradigm-functional, D-checker-mapping,
D-http-surface, D-node-http-server, D-zod-boundary, D-open-business-motivation,
D-open-svelte-client, D-restart-loses-state, D-clock-never-moves-back,
D-simulation-is-not-verification, D-model-limits, D-dependency-direction-law,
D-demo-operation-marked, D-agda-mutant-rejected, D-substrate-policy,
D-one-clock-adapter, D-cancel-on-sold-reason-undeclared,
D-schema-refusal-coverage, D-shared-obligation-in-value-1,
D-wire-contract-pinned

### Oracle (Shared design)

tests/acceptance/hold-a-free-seat.test.ts

### Acceptance supports (Shared design)

```json
[
  "package-lock.json",
  "package.json",
  "tests/acceptance/support/seat-api-client.ts",
  "tests/acceptance/support/start-test-service.ts",
  "tsconfig.json",
  "vitest.config.ts"
]
```

### Oracle verification index (Shared design)

```json
1
```

### Purpose (Shared design)

F-purpose

### Constraints (Shared design)

C-public-port, C-hold-duration, C-deadline-authoritative, C-hold-reference,
C-demo-clock, C-fixed-inventory, C-in-memory, C-structured-json, C-out-of-scope,
C-user-standards, C-first-come

### Inherits (Shared design)

None

### Boundaries (Shared design)

```json
{
  "driving_port": {
    "ref": "B-driving-port"
  },
  "driven_ports": [
    {
      "ref": "B-driven-clock"
    },
    {
      "ref": "B-driven-store"
    },
    {
      "ref": "B-driven-references"
    },
    {
      "ref": "B-driven-config"
    }
  ],
  "dependency_direction": {
    "ref": "B-dependency-direction"
  },
  "failures": [
    {
      "condition": {
        "ref": "B-fail-expired-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-expired-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-held-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-held-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-sold-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-sold-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-holder-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-holder-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-seat-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-seat-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-body-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-body-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-restart-condition"
      },
      "outcome": "Indeterminate",
      "observation": {
        "ref": "B-fail-restart-observation"
      }
    }
  ],
  "applicability": "applicable"
}
```

### Public oracle (Shared design)

```json
{
  "observation": {
    "ref": "PO-shared-observation"
  },
  "stimulus": {
    "ref": "PO-shared-stimulus"
  },
  "expected": {
    "ref": "PO-shared-expected"
  },
  "falsifier": {
    "ref": "PO-shared-falsifier"
  }
}
```

### Architectural tests (Shared design)

```json
{
  "obligations": [
    {
      "id": "arch-dependency-direction",
      "obligation": {
        "ref": "AT-dependency-direction"
      },
      "oracle": "tests/architecture/dependency-direction.test.ts",
      "verification_index": 3
    }
  ],
  "applicability": "applicable"
}
```

### Contract tests (Shared design)

```json
{
  "reason": {
    "ref": "CT-no-independent-party"
  },
  "applicability": "not_applicable"
}
```

### Prefactoring (Shared design)

```json
{
  "reason": {
    "ref": "P-no-existing-oracle"
  },
  "applicability": "not_applicable"
}
```

### Agreement analysis (Shared design)

```json
{
  "reason": {
    "ref": "A-no-second-party"
  },
  "applicability": "not_applicable"
}
```

### Reuse analysis (Shared design)

| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| repository source tree | `docs/feature/last-seat/brief.md:1` | CREATE_NEW | R-greenfield |
| node:http createServer | `package.json:1` | REUSE | R-node-http |
| zod | `package.json:1` | REUSE | R-zod |
| fast-check | `package.json:1` | REUSE | R-fast-check |
| vitest | `package.json:1` | REUSE | R-vitest |

### Impact closure (Shared design)

```json
{
  "items": [
    {
      "kind": "manifest",
      "locator": "package.json",
      "decision": "UNCHANGED_COMPATIBLE",
      "reason": {
        "ref": "T-build-metadata"
      }
    },
    {
      "kind": "lock",
      "locator": "package-lock.json",
      "decision": "UNCHANGED_COMPATIBLE",
      "reason": {
        "ref": "T-build-metadata"
      }
    },
    {
      "kind": "build_metadata",
      "locator": "tsconfig.json",
      "decision": "UNCHANGED_COMPATIBLE",
      "reason": {
        "ref": "T-build-metadata"
      }
    },
    {
      "kind": "discovery",
      "locator": "vitest.config.ts",
      "decision": "UNCHANGED_COMPATIBLE",
      "reason": {
        "ref": "T-build-metadata"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/domain/seat-state.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "I-created-by-this-change"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/domain/seat-transition.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "I-created-by-this-change"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/app/ports.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "I-created-by-this-change"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/app/seat-service.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "I-created-by-this-change"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/adapter/http/wire.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "I-created-by-this-change"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/adapter/http/seat-routes.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "I-created-by-this-change"
      }
    },
    {
      "kind": "runtime",
      "locator": "src/adapter/memory/in-memory-seat-store.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "I-created-by-this-change"
      }
    },
    {
      "kind": "runtime",
      "locator": "src/adapter/clock.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "I-created-by-this-change"
      }
    },
    {
      "kind": "runtime",
      "locator": "src/main.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "I-created-by-this-change"
      }
    }
  ],
  "applicability": "applicable"
}
```

### Adr (Shared design)

```json
{
  "context": {
    "ref": "ADR-context"
  },
  "decision": {
    "ref": "ADR-decision"
  },
  "alternatives": [
    {
      "ref": "ADR-alt-sweep"
    },
    {
      "ref": "ADR-alt-eager-on-advance"
    },
    {
      "ref": "ADR-alt-grace"
    }
  ],
  "consequences": [
    {
      "ref": "ADR-consequence-read-cost"
    },
    {
      "ref": "ADR-consequence-no-event"
    },
    {
      "ref": "ADR-consequence-clock-injected"
    }
  ],
  "status": "proposed",
  "applicability": "applicable"
}
```

### Architect handoff (Shared design)

```json
{
  "sections": [
    {
      "kind": "laws",
      "scope": "shared",
      "status": {
        "payload": {
          "observations": [
            {
              "id": "obs-seat-report",
              "description": {
                "ref": "O-seat-report"
              },
              "result_type": "SeatReport JSON object",
              "cannot_distinguish": {
                "ref": "O-seat-report-blind"
              }
            },
            {
              "id": "obs-inventory",
              "description": {
                "ref": "O-inventory"
              },
              "result_type": "array of SeatReport",
              "cannot_distinguish": {
                "ref": "O-inventory-blind"
              }
            },
            {
              "id": "obs-outcome",
              "description": {
                "ref": "O-outcome"
              },
              "result_type": "HTTP status and OutcomeBody JSON",
              "cannot_distinguish": {
                "ref": "O-outcome-blind"
              }
            },
            {
              "id": "obs-clock",
              "description": {
                "ref": "O-clock"
              },
              "result_type": "integer seconds",
              "cannot_distinguish": {
                "ref": "O-clock-blind"
              }
            }
          ],
          "equality": {
            "under": [
              "obs-inventory",
              "obs-clock"
            ],
            "definition": {
              "ref": "E-equality"
            }
          },
          "constructors": [
            {
              "id": "ctor-start",
              "signature": "start(options: {inventory: readonly SeatId[]; holdDurationSeconds: number; clock: Clock; references: HoldReferences}): SeatService"
            },
            {
              "id": "ctor-hold",
              "signature": "hold(options: {seatId: SeatId; booker: BookerName}): Outcome"
            },
            {
              "id": "ctor-confirm",
              "signature": "confirm(options: {seatId: SeatId; holdRef: HoldRef}): Outcome"
            },
            {
              "id": "ctor-cancel",
              "signature": "cancel(options: {seatId: SeatId; holdRef: HoldRef}): Outcome"
            },
            {
              "id": "ctor-advance",
              "signature": "advanceClock(options: {seconds: number}): number"
            }
          ],
          "generators": [
            {
              "id": "gen-walk",
              "domain": {
                "ref": "G-walk-domain"
              },
              "size_bound": 40,
              "seed_policy": {
                "ref": "G-walk-seed"
              },
              "must_include": [
                {
                  "ref": "G-must-at-deadline"
                },
                {
                  "ref": "G-must-one-before"
                },
                {
                  "ref": "G-must-wrong-ref"
                },
                {
                  "ref": "G-must-held-seat"
                },
                {
                  "ref": "G-must-big-jump"
                },
                {
                  "ref": "G-must-sold-seat"
                }
              ],
              "depth_bound": 8
            }
          ],
          "laws": [
            {
              "id": "law-sold-is-absorbing",
              "statement": {
                "ref": "L-sold-is-absorbing-stmt"
              },
              "kind": "invariant",
              "layer": "domain",
              "owner": "CREATE_NEW:src/domain/seat-transition.ts::step",
              "uses": [
                "obs-inventory",
                "ctor-hold",
                "ctor-confirm",
                "ctor-cancel",
                "ctor-advance"
              ],
              "treatment": {
                "generator": "gen-walk",
                "independent_observation": {
                  "ref": "L-sold-is-absorbing-oracle"
                },
                "falsifier": {
                  "description": {
                    "ref": "L-sold-is-absorbing-fal"
                  }
                },
                "tag": "broad"
              },
              "evidence": {
                "tag": "to_run"
              }
            },
            {
              "id": "law-deadline-is-authoritative",
              "statement": {
                "ref": "L-deadline-is-authoritative-stmt"
              },
              "kind": "invariant",
              "layer": "application",
              "owner": "CREATE_NEW:src/app/seat-service.ts::confirm",
              "uses": [
                "obs-outcome",
                "obs-seat-report",
                "obs-clock",
                "ctor-hold",
                "ctor-confirm",
                "ctor-cancel",
                "ctor-advance"
              ],
              "treatment": {
                "generator": "gen-walk",
                "independent_observation": {
                  "ref": "L-deadline-is-authoritative-oracle"
                },
                "falsifier": {
                  "description": {
                    "ref": "L-deadline-is-authoritative-fal"
                  }
                },
                "tag": "broad"
              },
              "evidence": {
                "tag": "to_run"
              }
            },
            {
              "id": "law-only-the-holder-acts",
              "statement": {
                "ref": "L-only-the-holder-acts-stmt"
              },
              "kind": "invariant",
              "layer": "application",
              "owner": "CREATE_NEW:src/app/seat-service.ts::cancel",
              "uses": [
                "obs-outcome",
                "obs-inventory",
                "ctor-hold",
                "ctor-confirm",
                "ctor-cancel"
              ],
              "treatment": {
                "generator": "gen-walk",
                "independent_observation": {
                  "ref": "L-only-the-holder-acts-oracle"
                },
                "falsifier": {
                  "description": {
                    "ref": "L-only-the-holder-acts-fal"
                  }
                },
                "tag": "broad"
              },
              "evidence": {
                "tag": "to_run"
              }
            },
            {
              "id": "law-hold-only-on-free",
              "statement": {
                "ref": "L-hold-only-on-free-stmt"
              },
              "kind": "invariant",
              "layer": "application",
              "owner": "CREATE_NEW:src/app/seat-service.ts::hold",
              "uses": [
                "obs-outcome",
                "obs-seat-report",
                "obs-inventory",
                "ctor-hold"
              ],
              "treatment": {
                "generator": "gen-walk",
                "independent_observation": {
                  "ref": "L-hold-only-on-free-oracle"
                },
                "falsifier": {
                  "description": {
                    "ref": "L-hold-only-on-free-fal"
                  }
                },
                "tag": "broad"
              },
              "evidence": {
                "tag": "to_run"
              }
            },
            {
              "id": "law-refusal-is-inert",
              "statement": {
                "ref": "L-refusal-is-inert-stmt"
              },
              "kind": "invariant",
              "layer": "application",
              "owner": "CREATE_NEW:src/app/seat-service.ts::seatService",
              "uses": [
                "obs-outcome",
                "obs-inventory",
                "obs-clock",
                "ctor-hold",
                "ctor-confirm",
                "ctor-cancel"
              ],
              "treatment": {
                "generator": "gen-walk",
                "independent_observation": {
                  "ref": "L-refusal-is-inert-oracle"
                },
                "falsifier": {
                  "description": {
                    "ref": "L-refusal-is-inert-fal"
                  }
                },
                "tag": "broad"
              },
              "evidence": {
                "tag": "to_run"
              }
            },
            {
              "id": "law-deadline-is-now-plus-duration",
              "statement": {
                "ref": "L-deadline-is-now-plus-duration-stmt"
              },
              "kind": "invariant",
              "layer": "application",
              "owner": "CREATE_NEW:src/app/seat-service.ts::hold",
              "uses": [
                "obs-outcome",
                "obs-clock",
                "ctor-hold",
                "ctor-advance"
              ],
              "treatment": {
                "generator": "gen-walk",
                "independent_observation": {
                  "ref": "L-deadline-is-now-plus-duration-oracle"
                },
                "falsifier": {
                  "description": {
                    "ref": "L-deadline-is-now-plus-duration-fal"
                  }
                },
                "tag": "broad"
              },
              "evidence": {
                "tag": "to_run"
              }
            },
            {
              "id": "law-report-is-idempotent",
              "statement": {
                "ref": "L-report-is-idempotent-stmt"
              },
              "kind": "idempotence",
              "layer": "domain",
              "owner": "CREATE_NEW:src/domain/seat-transition.ts::view",
              "uses": [
                "obs-inventory"
              ],
              "treatment": {
                "generator": "gen-walk",
                "independent_observation": {
                  "ref": "L-report-is-idempotent-oracle"
                },
                "falsifier": {
                  "description": {
                    "ref": "L-report-is-idempotent-fal"
                  }
                },
                "tag": "broad"
              },
              "evidence": {
                "tag": "to_run"
              }
            },
            {
              "id": "law-every-hold-is-released",
              "statement": {
                "ref": "L-every-hold-is-released-stmt"
              },
              "kind": "invariant",
              "layer": "infrastructure",
              "owner": "CREATE_NEW:src/domain/seat-transition.ts::view",
              "uses": [
                "obs-seat-report",
                "obs-clock",
                "ctor-hold",
                "ctor-advance"
              ],
              "treatment": {
                "generator": "gen-walk",
                "independent_observation": {
                  "ref": "L-every-hold-is-released-oracle"
                },
                "falsifier": {
                  "description": {
                    "ref": "L-every-hold-is-released-fal"
                  }
                },
                "tag": "broad"
              },
              "evidence": {
                "tag": "to_run"
              }
            },
            {
              "id": "law-wire-shape",
              "statement": {
                "ref": "L-wire-stmt"
              },
              "kind": "invariant",
              "layer": "adapter",
              "owner": "CREATE_NEW:src/adapter/http/wire.ts::responseSchemas",
              "uses": [
                "obs-outcome",
                "obs-seat-report",
                "obs-inventory"
              ],
              "treatment": {
                "cases": [
                  {
                    "ref": "W-case-granted"
                  },
                  {
                    "ref": "W-case-confirmed"
                  },
                  {
                    "ref": "W-case-cancelled"
                  },
                  {
                    "ref": "W-case-expired"
                  },
                  {
                    "ref": "W-case-held"
                  },
                  {
                    "ref": "W-case-sold"
                  },
                  {
                    "ref": "W-case-no-hold"
                  },
                  {
                    "ref": "W-case-no-seat"
                  },
                  {
                    "ref": "W-case-invalid-booker"
                  },
                  {
                    "ref": "W-case-invalid-holdref"
                  },
                  {
                    "ref": "W-case-invalid-advance"
                  }
                ],
                "reason": {
                  "ref": "W-finite-reason"
                },
                "tag": "finite"
              },
              "evidence": {
                "tag": "to_run"
              }
            }
          ],
          "refuted": []
        },
        "tag": "applicable"
      }
    },
    {
      "kind": "construction",
      "scope": "shared",
      "status": {
        "payload": {
          "claims": [
            {
              "id": "cc-one-holder",
              "proposition": {
                "ref": "CC-one-holder-prop"
              },
              "harm": {
                "ref": "CC-one-holder-harm"
              },
              "owner": "CREATE_NEW:src/domain/seat-state.ts::SeatState",
              "admitted_input": {
                "ref": "CC-one-holder-input"
              },
              "constructor": "CREATE_NEW:src/domain/seat-state.ts::heldBy",
              "consumer": "CREATE_NEW:src/app/seat-service.ts::seatService",
              "public_observation": {
                "ref": "O-seat-report"
              },
              "bypass": [
                {
                  "ref": "CC-one-holder-bypass"
                }
              ],
              "strength": "gradual_checker"
            },
            {
              "id": "cc-sold-has-no-deadline",
              "proposition": {
                "ref": "CC-sold-prop"
              },
              "harm": {
                "ref": "CC-sold-harm"
              },
              "owner": "CREATE_NEW:src/domain/seat-state.ts::SeatState",
              "admitted_input": {
                "ref": "CC-sold-input"
              },
              "constructor": "CREATE_NEW:src/domain/seat-state.ts::soldTo",
              "consumer": "CREATE_NEW:src/domain/seat-transition.ts::view",
              "public_observation": {
                "ref": "O-seat-report"
              },
              "bypass": [
                {
                  "ref": "CC-sold-bypass"
                }
              ],
              "strength": "gradual_checker"
            },
            {
              "id": "cc-opaque-reference",
              "proposition": {
                "ref": "CC-ref-prop"
              },
              "harm": {
                "ref": "CC-ref-harm"
              },
              "owner": "CREATE_NEW:src/app/ports.ts::HoldRef",
              "admitted_input": {
                "ref": "CC-ref-input"
              },
              "constructor": "CREATE_NEW:src/adapter/clock.ts::uuidHoldReferences",
              "consumer": "CREATE_NEW:src/app/seat-service.ts::hold",
              "public_observation": {
                "ref": "O-outcome"
              },
              "bypass": [
                {
                  "ref": "CC-ref-bypass"
                }
              ],
              "strength": "gradual_checker"
            },
            {
              "id": "cc-single-projection",
              "proposition": {
                "ref": "CC-proj-prop"
              },
              "harm": {
                "ref": "CC-proj-harm"
              },
              "owner": "CREATE_NEW:src/domain/seat-transition.ts::view",
              "admitted_input": {
                "ref": "CC-proj-input"
              },
              "constructor": "CREATE_NEW:src/domain/seat-transition.ts::view",
              "consumer": "CREATE_NEW:src/adapter/http/seat-routes.ts::seatRoutes",
              "public_observation": {
                "ref": "O-inventory"
              },
              "bypass": [
                {
                  "ref": "CC-proj-bypass"
                }
              ],
              "strength": "centralised"
            }
          ],
          "admitted": [
            {
              "ref": "AD-free"
            },
            {
              "ref": "AD-held"
            },
            {
              "ref": "AD-sold"
            },
            {
              "ref": "AD-expired"
            }
          ],
          "excluded": [
            {
              "ref": "EX-two-holders"
            },
            {
              "ref": "EX-two-owners"
            },
            {
              "ref": "EX-sold-released"
            },
            {
              "ref": "EX-held-no-deadline"
            },
            {
              "ref": "EX-late-confirm"
            },
            {
              "ref": "EX-hold-on-taken"
            },
            {
              "ref": "EX-silent-refusal"
            }
          ],
          "unknown": [
            {
              "state": {
                "ref": "UN-clock-back"
              },
              "risk_owner": {
                "ref": "UN-clock-back-owner"
              }
            },
            {
              "state": {
                "ref": "UN-demo-exposure"
              },
              "risk_owner": {
                "ref": "UN-demo-exposure-owner"
              }
            },
            {
              "state": {
                "ref": "UN-client-shape"
              },
              "risk_owner": {
                "ref": "UN-client-shape-owner"
              }
            },
            {
              "state": {
                "ref": "UN-concurrent-host"
              },
              "risk_owner": {
                "ref": "UN-concurrent-host-owner"
              }
            },
            {
              "state": {
                "ref": "UN-restart-loss"
              },
              "risk_owner": {
                "ref": "UN-restart-loss-owner"
              }
            }
          ]
        },
        "tag": "applicable"
      }
    },
    {
      "kind": "model",
      "scope": "shared",
      "status": {
        "payload": {
          "models": [
            {
              "id": "seat-quint",
              "language": "quint",
              "path": "docs/feature/last-seat/model/seat.qnt:1",
              "source": {
                "path": "docs/feature/last-seat/model/seat.qnt",
                "sha256": "2380528fb52260a60c124fa9a27cab295d2138d7b4a3e01d879ca470b8abdff6"
              },
              "atoms": [
                {
                  "name": "stored",
                  "symbol": "stored",
                  "site": {
                    "at": "CREATE_NEW:src/adapter/memory/in-memory-seat-store.ts::records",
                    "tag": "located"
                  },
                  "tag": "state"
                },
                {
                  "name": "clock",
                  "symbol": "clock",
                  "site": {
                    "at": "CREATE_NEW:src/adapter/clock.ts::advanceableClock",
                    "tag": "located"
                  },
                  "tag": "state"
                },
                {
                  "name": "nextRef",
                  "symbol": "nextRef",
                  "site": {
                    "at": "CREATE_NEW:src/adapter/clock.ts::uuidHoldReferences",
                    "tag": "located"
                  },
                  "tag": "state"
                },
                {
                  "name": "last",
                  "symbol": "last",
                  "site": {
                    "at": "CREATE_NEW:src/adapter/http/wire.ts::OutcomeBody",
                    "tag": "located"
                  },
                  "tag": "state"
                },
                {
                  "name": "soldOwner",
                  "symbol": "soldOwner",
                  "site": {
                    "reason": {
                      "ref": "MA-soldOwner"
                    },
                    "tag": "model_only"
                  },
                  "tag": "state"
                },
                {
                  "name": "priorStored",
                  "symbol": "priorStored",
                  "site": {
                    "reason": {
                      "ref": "MA-priorStored"
                    },
                    "tag": "model_only"
                  },
                  "tag": "state"
                },
                {
                  "name": "priorSold",
                  "symbol": "priorSold",
                  "site": {
                    "reason": {
                      "ref": "MA-priorSold"
                    },
                    "tag": "model_only"
                  },
                  "tag": "state"
                },
                {
                  "name": "priorNextRef",
                  "symbol": "priorNextRef",
                  "site": {
                    "reason": {
                      "ref": "MA-priorNextRef"
                    },
                    "tag": "model_only"
                  },
                  "tag": "state"
                },
                {
                  "name": "init",
                  "symbol": "init",
                  "site": {
                    "reason": {
                      "ref": "MA-init-site"
                    },
                    "tag": "model_only"
                  },
                  "template": {
                    "ref": "MT-init"
                  },
                  "atomicity": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::seatService",
                    "note": {
                      "ref": "MA-atomicity"
                    }
                  },
                  "tag": "action"
                },
                {
                  "name": "anyHold",
                  "symbol": "hold",
                  "site": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::hold",
                    "tag": "located"
                  },
                  "template": {
                    "ref": "MT-hold"
                  },
                  "atomicity": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::seatService",
                    "note": {
                      "ref": "MA-atomicity"
                    }
                  },
                  "tag": "action"
                },
                {
                  "name": "anyConfirm",
                  "symbol": "confirm",
                  "site": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::confirm",
                    "tag": "located"
                  },
                  "template": {
                    "ref": "MT-confirm"
                  },
                  "atomicity": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::seatService",
                    "note": {
                      "ref": "MA-atomicity"
                    }
                  },
                  "tag": "action"
                },
                {
                  "name": "anyCancel",
                  "symbol": "cancel",
                  "site": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::cancel",
                    "tag": "located"
                  },
                  "template": {
                    "ref": "MT-cancel"
                  },
                  "atomicity": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::seatService",
                    "note": {
                      "ref": "MA-atomicity"
                    }
                  },
                  "tag": "action"
                },
                {
                  "name": "anyAdvance",
                  "symbol": "advanceClock",
                  "site": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::advanceClock",
                    "tag": "located"
                  },
                  "template": {
                    "ref": "MT-advance"
                  },
                  "atomicity": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::seatService",
                    "note": {
                      "ref": "MA-atomicity"
                    }
                  },
                  "tag": "action"
                },
                {
                  "name": "SoldStable",
                  "symbol": "SoldStable",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "MP-SoldStable"
                  },
                  "tag": "property"
                },
                {
                  "name": "HeldIsActive",
                  "symbol": "HeldIsActive",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "MP-HeldIsActive"
                  },
                  "tag": "property"
                },
                {
                  "name": "AuthorizedOnly",
                  "symbol": "AuthorizedOnly",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "MP-AuthorizedOnly"
                  },
                  "tag": "property"
                },
                {
                  "name": "DeadlineAuthoritative",
                  "symbol": "DeadlineAuthoritative",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "MP-DeadlineAuthoritative"
                  },
                  "tag": "property"
                },
                {
                  "name": "HoldOnlyWhenFree",
                  "symbol": "HoldOnlyWhenFree",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "MP-HoldOnlyWhenFree"
                  },
                  "tag": "property"
                },
                {
                  "name": "RefusalIsInert",
                  "symbol": "RefusalIsInert",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "MP-RefusalIsInert"
                  },
                  "tag": "property"
                },
                {
                  "name": "NoConfirmOneTickBeforeDeadline",
                  "symbol": "NoConfirmOneTickBeforeDeadline",
                  "site": {
                    "reason": {
                      "ref": "MW-NoConfirmOneTickBeforeDeadline"
                    },
                    "tag": "model_only"
                  },
                  "statement": {
                    "ref": "MPW-NoConfirmOneTickBeforeDeadline"
                  },
                  "tag": "property"
                },
                {
                  "name": "NoConfirmExactlyAtDeadline",
                  "symbol": "NoConfirmExactlyAtDeadline",
                  "site": {
                    "reason": {
                      "ref": "MW-NoConfirmExactlyAtDeadline"
                    },
                    "tag": "model_only"
                  },
                  "statement": {
                    "ref": "MPW-NoConfirmExactlyAtDeadline"
                  },
                  "tag": "property"
                },
                {
                  "name": "NoSoldSeatAfterTheDeadline",
                  "symbol": "NoSoldSeatAfterTheDeadline",
                  "site": {
                    "reason": {
                      "ref": "MW-NoSoldSeatAfterTheDeadline"
                    },
                    "tag": "model_only"
                  },
                  "statement": {
                    "ref": "MPW-NoSoldSeatAfterTheDeadline"
                  },
                  "tag": "property"
                },
                {
                  "name": "NoSecondBookerRefused",
                  "symbol": "NoSecondBookerRefused",
                  "site": {
                    "reason": {
                      "ref": "MW-NoSecondBookerRefused"
                    },
                    "tag": "model_only"
                  },
                  "statement": {
                    "ref": "MPW-NoSecondBookerRefused"
                  },
                  "tag": "property"
                },
                {
                  "name": "SEATS",
                  "symbol": "SEATS",
                  "site": {
                    "at": "CREATE_NEW:src/main.ts::configuration",
                    "tag": "located"
                  },
                  "tag": "constant"
                },
                {
                  "name": "BOOKERS",
                  "symbol": "BOOKERS",
                  "site": {
                    "reason": {
                      "ref": "MC-BOOKERS"
                    },
                    "tag": "model_only"
                  },
                  "tag": "constant"
                },
                {
                  "name": "HOLD_DURATION",
                  "symbol": "HOLD_DURATION",
                  "site": {
                    "at": "CREATE_NEW:src/main.ts::configuration",
                    "tag": "located"
                  },
                  "tag": "constant"
                },
                {
                  "name": "HORIZON",
                  "symbol": "HORIZON",
                  "site": {
                    "reason": {
                      "ref": "MC-HORIZON"
                    },
                    "tag": "model_only"
                  },
                  "tag": "constant"
                },
                {
                  "name": "REFS",
                  "symbol": "REFS",
                  "site": {
                    "reason": {
                      "ref": "MC-REFS"
                    },
                    "tag": "model_only"
                  },
                  "tag": "constant"
                },
                {
                  "name": "DELTAS",
                  "symbol": "DELTAS",
                  "site": {
                    "reason": {
                      "ref": "MC-DELTAS"
                    },
                    "tag": "model_only"
                  },
                  "tag": "constant"
                }
              ],
              "exclusions": [
                {
                  "ref": "EX-two-owners"
                },
                {
                  "ref": "EX-sold-released"
                },
                {
                  "ref": "EX-late-confirm"
                },
                {
                  "ref": "EX-hold-on-taken"
                },
                {
                  "ref": "EX-silent-refusal"
                }
              ],
              "assumptions": [
                {
                  "ref": "MQ-a1"
                },
                {
                  "ref": "MQ-a2"
                },
                {
                  "ref": "MQ-a3"
                },
                {
                  "ref": "MQ-a4"
                }
              ],
              "mutants": [
                {
                  "id": "m1-confirm-ignores-deadline",
                  "description": {
                    "ref": "MU-m1-confirm-ignores-deadline"
                  },
                  "kills": [
                    {
                      "property": "DeadlineAuthoritative",
                      "run": "m1-kill"
                    }
                  ]
                },
                {
                  "id": "m2-hold-on-held-seat",
                  "description": {
                    "ref": "MU-m2-hold-on-held-seat"
                  },
                  "kills": [
                    {
                      "property": "HoldOnlyWhenFree",
                      "run": "m2-kill"
                    }
                  ]
                },
                {
                  "id": "m3-cancel-ignores-reference",
                  "description": {
                    "ref": "MU-m3-cancel-ignores-reference"
                  },
                  "kills": [
                    {
                      "property": "AuthorizedOnly",
                      "run": "m3-kill"
                    }
                  ]
                },
                {
                  "id": "m4-expiry-releases-sold-seat",
                  "description": {
                    "ref": "MU-m4-expiry-releases-sold-seat"
                  },
                  "kills": [
                    {
                      "property": "SoldStable",
                      "run": "m4-kill"
                    }
                  ]
                },
                {
                  "id": "m5-refused-hold-extends-deadline",
                  "description": {
                    "ref": "MU-m5-refused-hold-extends-deadline"
                  },
                  "kills": [
                    {
                      "property": "RefusalIsInert",
                      "run": "m5-kill"
                    }
                  ]
                },
                {
                  "id": "m6-holds-never-expire",
                  "description": {
                    "ref": "MU-m6-holds-never-expire"
                  },
                  "kills": [
                    {
                      "property": "HeldIsActive",
                      "run": "m6-kill"
                    }
                  ]
                }
              ]
            },
            {
              "id": "seat-liveness-tla",
              "language": "tla",
              "path": "docs/feature/last-seat/model/SeatLiveness.tla:1",
              "source": {
                "path": "docs/feature/last-seat/model/SeatLiveness.tla",
                "sha256": "e9acc13e0480895a5c76b9e18f55a0628e0f345f984c429c6b245dd708e9329b"
              },
              "atoms": [
                {
                  "name": "status",
                  "symbol": "status",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-state.ts::SeatState",
                    "tag": "located"
                  },
                  "tag": "state"
                },
                {
                  "name": "holder",
                  "symbol": "holder",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-state.ts::heldBy",
                    "tag": "located"
                  },
                  "tag": "state"
                },
                {
                  "name": "remaining",
                  "symbol": "remaining",
                  "site": {
                    "reason": {
                      "ref": "MT-remaining"
                    },
                    "tag": "model_only"
                  },
                  "tag": "state"
                },
                {
                  "name": "Hold",
                  "symbol": "hold",
                  "site": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::hold",
                    "tag": "located"
                  },
                  "template": {
                    "ref": "TT-hold"
                  },
                  "atomicity": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::seatService",
                    "note": {
                      "ref": "MA-atomicity"
                    }
                  },
                  "tag": "action"
                },
                {
                  "name": "Confirm",
                  "symbol": "confirm",
                  "site": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::confirm",
                    "tag": "located"
                  },
                  "template": {
                    "ref": "TT-confirm"
                  },
                  "atomicity": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::seatService",
                    "note": {
                      "ref": "MA-atomicity"
                    }
                  },
                  "tag": "action"
                },
                {
                  "name": "Cancel",
                  "symbol": "cancel",
                  "site": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::cancel",
                    "tag": "located"
                  },
                  "template": {
                    "ref": "TT-cancel"
                  },
                  "atomicity": {
                    "at": "CREATE_NEW:src/app/seat-service.ts::seatService",
                    "note": {
                      "ref": "MA-atomicity"
                    }
                  },
                  "tag": "action"
                },
                {
                  "name": "Tick",
                  "symbol": "advanceClock",
                  "site": {
                    "at": "CREATE_NEW:src/adapter/clock.ts::advanceableClock",
                    "tag": "located"
                  },
                  "template": {
                    "ref": "TT-tick"
                  },
                  "atomicity": {
                    "at": "CREATE_NEW:src/adapter/clock.ts::advanceableClock",
                    "note": {
                      "ref": "TT-tick-note"
                    }
                  },
                  "tag": "action"
                },
                {
                  "name": "EveryHoldIsReleased",
                  "symbol": "EveryHoldIsReleased",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::view",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "TP-released"
                  },
                  "tag": "property"
                },
                {
                  "name": "SoldIsAbsorbing",
                  "symbol": "SoldIsAbsorbing",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::view",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "TP-sold"
                  },
                  "tag": "property"
                },
                {
                  "name": "TypeOK",
                  "symbol": "TypeOK",
                  "site": {
                    "reason": {
                      "ref": "TP-typeok-site"
                    },
                    "tag": "model_only"
                  },
                  "statement": {
                    "ref": "TP-typeok"
                  },
                  "tag": "property"
                },
                {
                  "name": "HoldTicks",
                  "symbol": "holdDurationSeconds",
                  "site": {
                    "at": "CREATE_NEW:src/main.ts::configuration",
                    "tag": "located"
                  },
                  "tag": "constant"
                },
                {
                  "name": "Seats",
                  "symbol": "inventory",
                  "site": {
                    "at": "CREATE_NEW:src/main.ts::configuration",
                    "tag": "located"
                  },
                  "tag": "constant"
                },
                {
                  "name": "Bookers",
                  "symbol": "BookerName",
                  "site": {
                    "reason": {
                      "ref": "TC-bookers"
                    },
                    "tag": "model_only"
                  },
                  "tag": "constant"
                },
                {
                  "name": "NoBooker",
                  "symbol": "NoBooker",
                  "site": {
                    "reason": {
                      "ref": "TC-nobooker"
                    },
                    "tag": "model_only"
                  },
                  "tag": "constant"
                }
              ],
              "exclusions": [
                {
                  "ref": "EX-held-no-deadline"
                }
              ],
              "assumptions": [
                {
                  "ref": "TA-a1"
                },
                {
                  "ref": "TA-a2"
                },
                {
                  "ref": "TA-a3"
                },
                {
                  "ref": "TA-a4"
                },
                {
                  "ref": "TA-a5"
                }
              ],
              "mutants": [
                {
                  "id": "m7-hold-renews-existing-hold",
                  "description": {
                    "ref": "MU-m7"
                  },
                  "kills": [
                    {
                      "property": "EveryHoldIsReleased",
                      "run": "tlc-liveness-mutant"
                    }
                  ]
                }
              ]
            },
            {
              "id": "seat-agda",
              "language": "agda",
              "path": "docs/feature/last-seat/model/SeatSafety.agda:1",
              "source": {
                "path": "docs/feature/last-seat/model/SeatSafety.agda",
                "sha256": "aef471a9acb0967424baf7bc1666a9ac0ce9b6ce022c83faf41b14a792ca7eb1"
              },
              "atoms": [
                {
                  "name": "SeatState",
                  "symbol": "SeatState",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-state.ts::SeatState",
                    "tag": "located"
                  },
                  "tag": "state"
                },
                {
                  "name": "Hold",
                  "symbol": "Hold",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-state.ts::Hold",
                    "tag": "located"
                  },
                  "tag": "state"
                },
                {
                  "name": "Outcome",
                  "symbol": "Outcome",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-state.ts::Outcome",
                    "tag": "located"
                  },
                  "tag": "state"
                },
                {
                  "name": "step",
                  "symbol": "step",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "template": {
                    "ref": "AT-step"
                  },
                  "atomicity": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "note": {
                      "ref": "AT-step-note"
                    }
                  },
                  "tag": "action"
                },
                {
                  "name": "view",
                  "symbol": "view",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::view",
                    "tag": "located"
                  },
                  "template": {
                    "ref": "AT-view"
                  },
                  "atomicity": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::view",
                    "note": {
                      "ref": "AT-step-note"
                    }
                  },
                  "tag": "action"
                },
                {
                  "name": "sold-is-absorbing",
                  "symbol": "sold-is-absorbing",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "AP-sold-is-absorbing"
                  },
                  "tag": "property"
                },
                {
                  "name": "confirm-respects-deadline",
                  "symbol": "confirm-respects-deadline",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "AP-confirm-respects-deadline"
                  },
                  "tag": "property"
                },
                {
                  "name": "confirm-only-by-the-holder",
                  "symbol": "confirm-only-by-the-holder",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "AP-confirm-only-by-the-holder"
                  },
                  "tag": "property"
                },
                {
                  "name": "cancel-respects-deadline",
                  "symbol": "cancel-respects-deadline",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "AP-cancel-respects-deadline"
                  },
                  "tag": "property"
                },
                {
                  "name": "cancel-only-by-the-holder",
                  "symbol": "cancel-only-by-the-holder",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "AP-cancel-only-by-the-holder"
                  },
                  "tag": "property"
                },
                {
                  "name": "hold-only-when-free",
                  "symbol": "hold-only-when-free",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "AP-hold-only-when-free"
                  },
                  "tag": "property"
                },
                {
                  "name": "view-is-idempotent",
                  "symbol": "view-is-idempotent",
                  "site": {
                    "at": "CREATE_NEW:src/domain/seat-transition.ts::step",
                    "tag": "located"
                  },
                  "statement": {
                    "ref": "AP-view-is-idempotent"
                  },
                  "tag": "property"
                }
              ],
              "exclusions": [
                {
                  "ref": "EX-sold-released"
                },
                {
                  "ref": "EX-late-confirm"
                }
              ],
              "assumptions": [
                {
                  "ref": "AA-a1"
                },
                {
                  "ref": "AA-a2"
                },
                {
                  "ref": "AA-a3"
                },
                {
                  "ref": "AA-a4"
                }
              ],
              "mutants": []
            }
          ]
        },
        "tag": "applicable"
      }
    },
    {
      "kind": "closure",
      "scope": "shared",
      "status": {
        "payload": {
          "closures": [
            {
              "subject": {
                "ref": "SUBJ-shared"
              },
              "safety": {
                "statement": {
                  "ref": "CLS-0-safety"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-bound"
                  },
                  {
                    "ref": "CL-oneproc"
                  },
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [
                  "qv-safety-12"
                ],
                "laws": [
                  "law-report-is-idempotent",
                  "law-every-hold-is-released"
                ],
                "basis": {
                  "model_id": "seat-quint",
                  "properties": [
                    "HeldIsActive",
                    "SoldStable"
                  ],
                  "proof": "passed",
                  "proof_note": null,
                  "fairness": null,
                  "tag": "checked"
                },
                "tag": "claim"
              },
              "inhabitation": {
                "statement": {
                  "ref": "CLS-0-inhab"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [],
                "laws": [
                  "law-wire-shape"
                ],
                "basis": {
                  "admitted_input": {
                    "ref": "CLS-0-input"
                  },
                  "producer": "CREATE_NEW:src/main.ts::startService",
                  "consumer": "CREATE_NEW:src/adapter/http/seat-routes.ts::seatRoutes",
                  "public_observation": {
                    "ref": "O-inventory"
                  },
                  "bootstrap": null,
                  "tag": "path"
                },
                "tag": "claim"
              },
              "public_reachability": {
                "statement": {
                  "ref": "CLS-0-reach"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [],
                "laws": [],
                "basis": {
                  "admitted_input": {
                    "ref": "CLS-0-reach-input"
                  },
                  "producer": "CREATE_NEW:src/adapter/http/seat-routes.ts::seatRoutes",
                  "consumer": "CREATE_NEW:src/adapter/http/wire.ts::InventoryBody",
                  "public_observation": {
                    "ref": "O-inventory"
                  },
                  "bootstrap": null,
                  "tag": "path"
                },
                "tag": "claim"
              },
              "liveness": {
                "reason": {
                  "ref": "CLS-0-live-na"
                },
                "tag": "not_applicable"
              }
            },
            {
              "subject": {
                "ref": "SUBJ-v1"
              },
              "safety": {
                "statement": {
                  "ref": "CLS-1-safety"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-bound"
                  },
                  {
                    "ref": "CL-oneproc"
                  },
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [
                  "qv-safety-12"
                ],
                "laws": [
                  "law-hold-only-on-free",
                  "law-deadline-is-now-plus-duration"
                ],
                "basis": {
                  "model_id": "seat-quint",
                  "properties": [
                    "HoldOnlyWhenFree",
                    "HeldIsActive"
                  ],
                  "proof": "passed",
                  "proof_note": null,
                  "fairness": null,
                  "tag": "checked"
                },
                "tag": "claim"
              },
              "inhabitation": {
                "statement": {
                  "ref": "CLS-1-inhab"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [],
                "laws": [
                  "law-deadline-is-now-plus-duration"
                ],
                "basis": {
                  "admitted_input": {
                    "ref": "CLS-1-input"
                  },
                  "producer": "CREATE_NEW:src/app/seat-service.ts::hold",
                  "consumer": "CREATE_NEW:src/adapter/http/seat-routes.ts::seatRoutes",
                  "public_observation": {
                    "ref": "O-outcome"
                  },
                  "bootstrap": null,
                  "tag": "path"
                },
                "tag": "claim"
              },
              "public_reachability": {
                "statement": {
                  "ref": "CLS-1-reach"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [],
                "laws": [],
                "basis": {
                  "admitted_input": {
                    "ref": "CLS-1-reach-input"
                  },
                  "producer": "CREATE_NEW:src/adapter/http/seat-routes.ts::seatRoutes",
                  "consumer": "CREATE_NEW:src/adapter/http/wire.ts::HoldGrantedBody",
                  "public_observation": {
                    "ref": "O-seat-report"
                  },
                  "bootstrap": null,
                  "tag": "path"
                },
                "tag": "claim"
              },
              "liveness": {
                "reason": {
                  "ref": "CLS-1-live-na"
                },
                "tag": "not_applicable"
              }
            },
            {
              "subject": {
                "ref": "SUBJ-v2"
              },
              "safety": {
                "statement": {
                  "ref": "CLS-2-safety"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-bound"
                  },
                  {
                    "ref": "CL-oneproc"
                  },
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [
                  "qv-safety-12"
                ],
                "laws": [
                  "law-deadline-is-authoritative",
                  "law-only-the-holder-acts",
                  "law-sold-is-absorbing"
                ],
                "basis": {
                  "model_id": "seat-quint",
                  "properties": [
                    "DeadlineAuthoritative",
                    "AuthorizedOnly",
                    "SoldStable"
                  ],
                  "proof": "passed",
                  "proof_note": null,
                  "fairness": null,
                  "tag": "checked"
                },
                "tag": "claim"
              },
              "inhabitation": {
                "statement": {
                  "ref": "CLS-2-inhab"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [],
                "laws": [
                  "law-deadline-is-authoritative"
                ],
                "basis": {
                  "admitted_input": {
                    "ref": "CLS-2-input"
                  },
                  "producer": "CREATE_NEW:src/app/seat-service.ts::confirm",
                  "consumer": "CREATE_NEW:src/adapter/http/seat-routes.ts::seatRoutes",
                  "public_observation": {
                    "ref": "O-outcome"
                  },
                  "bootstrap": null,
                  "tag": "path"
                },
                "tag": "claim"
              },
              "public_reachability": {
                "statement": {
                  "ref": "CLS-2-reach"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [],
                "laws": [],
                "basis": {
                  "admitted_input": {
                    "ref": "CLS-2-reach-input"
                  },
                  "producer": "CREATE_NEW:src/adapter/http/seat-routes.ts::seatRoutes",
                  "consumer": "CREATE_NEW:src/adapter/http/wire.ts::SeatSoldBody",
                  "public_observation": {
                    "ref": "O-seat-report"
                  },
                  "bootstrap": null,
                  "tag": "path"
                },
                "tag": "claim"
              },
              "liveness": {
                "reason": {
                  "ref": "CLS-2-live-na"
                },
                "tag": "not_applicable"
              }
            },
            {
              "subject": {
                "ref": "SUBJ-v3"
              },
              "safety": {
                "statement": {
                  "ref": "CLS-3-safety"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-bound"
                  },
                  {
                    "ref": "CL-oneproc"
                  },
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [
                  "qv-safety-12"
                ],
                "laws": [
                  "law-sold-is-absorbing",
                  "law-hold-only-on-free",
                  "law-only-the-holder-acts",
                  "law-refusal-is-inert"
                ],
                "basis": {
                  "model_id": "seat-quint",
                  "properties": [
                    "SoldStable",
                    "HoldOnlyWhenFree",
                    "AuthorizedOnly",
                    "RefusalIsInert"
                  ],
                  "proof": "passed",
                  "proof_note": null,
                  "fairness": null,
                  "tag": "checked"
                },
                "tag": "claim"
              },
              "inhabitation": {
                "statement": {
                  "ref": "CLS-3-inhab"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [],
                "laws": [
                  "law-wire-shape"
                ],
                "basis": {
                  "admitted_input": {
                    "ref": "CLS-3-input"
                  },
                  "producer": "CREATE_NEW:src/app/seat-service.ts::seatService",
                  "consumer": "CREATE_NEW:src/adapter/http/wire.ts::RefusalBody",
                  "public_observation": {
                    "ref": "O-outcome"
                  },
                  "bootstrap": null,
                  "tag": "path"
                },
                "tag": "claim"
              },
              "public_reachability": {
                "statement": {
                  "ref": "CLS-3-reach"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [],
                "laws": [],
                "basis": {
                  "admitted_input": {
                    "ref": "CLS-3-reach-input"
                  },
                  "producer": "CREATE_NEW:src/adapter/http/seat-routes.ts::seatRoutes",
                  "consumer": "CREATE_NEW:src/adapter/http/wire.ts::OutcomeBody",
                  "public_observation": {
                    "ref": "O-seat-report"
                  },
                  "bootstrap": null,
                  "tag": "path"
                },
                "tag": "claim"
              },
              "liveness": {
                "reason": {
                  "ref": "CLS-3-live-na"
                },
                "tag": "not_applicable"
              }
            },
            {
              "subject": {
                "ref": "SUBJ-v4"
              },
              "safety": {
                "statement": {
                  "ref": "CLS-4-safety"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-bound"
                  },
                  {
                    "ref": "CL-oneproc"
                  },
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [
                  "qv-safety-12"
                ],
                "laws": [
                  "law-every-hold-is-released",
                  "law-sold-is-absorbing",
                  "law-deadline-is-authoritative"
                ],
                "basis": {
                  "model_id": "seat-quint",
                  "properties": [
                    "HeldIsActive",
                    "SoldStable",
                    "DeadlineAuthoritative"
                  ],
                  "proof": "passed",
                  "proof_note": null,
                  "fairness": null,
                  "tag": "checked"
                },
                "tag": "claim"
              },
              "inhabitation": {
                "statement": {
                  "ref": "CLS-4-inhab"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [],
                "laws": [
                  "law-every-hold-is-released",
                  "law-report-is-idempotent"
                ],
                "basis": {
                  "admitted_input": {
                    "ref": "CLS-4-input"
                  },
                  "producer": "CREATE_NEW:src/domain/seat-transition.ts::view",
                  "consumer": "CREATE_NEW:src/adapter/http/seat-routes.ts::seatRoutes",
                  "public_observation": {
                    "ref": "O-seat-report"
                  },
                  "bootstrap": null,
                  "tag": "path"
                },
                "tag": "claim"
              },
              "public_reachability": {
                "statement": {
                  "ref": "CLS-4-reach"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [],
                "laws": [],
                "basis": {
                  "admitted_input": {
                    "ref": "CLS-4-reach-input"
                  },
                  "producer": "CREATE_NEW:src/adapter/http/seat-routes.ts::seatRoutes",
                  "consumer": "CREATE_NEW:src/adapter/http/wire.ts::SeatFreeBody",
                  "public_observation": {
                    "ref": "O-seat-report"
                  },
                  "bootstrap": null,
                  "tag": "path"
                },
                "tag": "claim"
              },
              "liveness": {
                "statement": {
                  "ref": "CLS-4-live"
                },
                "design": "PASS",
                "design_note": null,
                "runtime": "DESIGNED_NOT_BUILT",
                "runtime_note": null,
                "assumptions": [
                  {
                    "ref": "CL-fairness"
                  },
                  {
                    "ref": "CL-live-bound"
                  },
                  {
                    "ref": "CL-dnb"
                  }
                ],
                "runs": [
                  "tlc-liveness-fair"
                ],
                "laws": [
                  "law-every-hold-is-released"
                ],
                "basis": {
                  "model_id": "seat-liveness-tla",
                  "properties": [
                    "EveryHoldIsReleased"
                  ],
                  "proof": "passed",
                  "proof_note": null,
                  "fairness": {
                    "ref": "CL-fairness"
                  },
                  "tag": "checked"
                },
                "tag": "claim"
              }
            }
          ]
        },
        "tag": "applicable"
      }
    },
    {
      "kind": "scenarios",
      "scope": "shared",
      "status": {
        "payload": {
          "scenarios": [
            {
              "id": "sc-confirm-just-in-time",
              "title": {
                "ref": "SC-sc-confirm-just-in-time"
              },
              "source_run": "w1-confirm-just-in-time",
              "kind": "example",
              "review": {
                "tag": "pending"
              }
            },
            {
              "id": "sc-confirm-at-deadline",
              "title": {
                "ref": "SC-sc-confirm-at-deadline"
              },
              "source_run": "w2-confirm-at-deadline",
              "kind": "example",
              "review": {
                "tag": "pending"
              }
            },
            {
              "id": "sc-cancel-at-deadline",
              "title": {
                "ref": "SC-sc-cancel-at-deadline"
              },
              "source_run": "w5-cancel-at-deadline",
              "kind": "example",
              "review": {
                "tag": "pending"
              }
            },
            {
              "id": "sc-sold-survives-deadline",
              "title": {
                "ref": "SC-sc-sold-survives-deadline"
              },
              "source_run": "w3-sold-survives-deadline",
              "kind": "example",
              "review": {
                "tag": "pending"
              }
            },
            {
              "id": "sc-second-booker-refused",
              "title": {
                "ref": "SC-sc-second-booker-refused"
              },
              "source_run": "w4-second-booker-refused",
              "kind": "example",
              "review": {
                "tag": "pending"
              }
            },
            {
              "id": "sc-mutant-late-confirm",
              "title": {
                "ref": "SC-sc-mutant-late-confirm"
              },
              "source_run": "m1-kill",
              "kind": "mutant",
              "review": {
                "tag": "pending"
              }
            },
            {
              "id": "sc-mutant-expiry-steals-sale",
              "title": {
                "ref": "SC-sc-mutant-expiry-steals-sale"
              },
              "source_run": "m4-kill",
              "kind": "mutant",
              "review": {
                "tag": "pending"
              }
            },
            {
              "id": "sc-mutant-double-hold",
              "title": {
                "ref": "SC-sc-mutant-double-hold"
              },
              "source_run": "m2-kill",
              "kind": "mutant",
              "review": {
                "tag": "pending"
              }
            }
          ]
        },
        "tag": "applicable"
      }
    }
  ]
}
```

### Product change (Shared design)

Product change: required

### Verification (Shared design)

Verification command:

```sh
npm ci
```

Verification command:

```sh
npx vitest run tests/acceptance/hold-a-free-seat.test.ts
```

Verification command:

```sh
npx tsc --noEmit
```

Verification command:

```sh
npx vitest run tests/architecture/dependency-direction.test.ts
```

Verification command:

```sh
npx vitest run tests/acceptance/confirm-a-held-seat.test.ts
```

Verification command:

```sh
npx vitest run tests/acceptance/one-seat-is-never-sold-twice.test.ts
```

Verification command:

```sh
npx vitest run tests/acceptance/every-hold-is-released.test.ts
```

## Value 1

### Facts (Value 1)

- V1-purpose: Deliver the first value of Last Seat: a booker holds a free seat
  through the HTTP API and the seat is then reported as held for that booker,
  with a stated deadline, until that deadline.
- V1-t1: The shared slice created this file. This value extends it because held
  and free seat values and the hold record live here, so the hold a booker
  receives has one owner.
- V1-t2: The shared slice created this file. This value extends it because the
  hold branch of the pure transition decides whether a seat may be held and what
  hold it produces.
- V1-t3: The shared slice created this file. This value extends it because the
  hold operation reads the clock, asks the references port for one reference and
  writes the replacement record.
- V1-t4: The shared slice created this file. This value extends it because the
  request schema for a hold and the response shape of a granted hold and of a
  held seat report.
- V1-t5: The shared slice created this file. This value extends it because the
  POST route for a hold and the seat report route that must now answer a held
  seat.
- V1-decision: Value 1 changes no shared decision. It extends the modules the
  shared slice created, keeps the one expiry projection, the one writer and the
  declared HTTP surface, and adds no new port. Its oracle also carries the
  shared walking-skeleton obligation and the two schema refusals its shipped
  routes can reach.
- V1-prefactoring: Value 1 adds behaviour to modules the shared slice created
  and moves no behaviour between them, so there is no preserving move to observe
  before and after.
- V1-archtests: The dependency-direction check is declared once at the shared
  scope and governs every module under src/domain, including the ones value 1
  adds. A second copy of the same law would give it two owners.
- V1-adr: The load-bearing decision, how expiry is realized, is recorded once in
  the shared record. Value 1 takes no architectural decision of its own.
- V1-obs: Through the HTTP API a booker holds a free seat and sees that seat
  reported as held for them, with a deadline, for as long as the deadline has
  not been reached, while the other seats of the seating area are unchanged.
- V1-sti: Start the service with the inventory ['s11','s12','s13'], a hold
  duration of 120 seconds and a clock the test controls, on an ephemeral port.
  Read GET /seats before any command and read the current time T from the
  demonstration clock operation. Send POST /seats/s12/holds with the body
  {"booker":"A"}. Then send GET /seats/s12, then advance the clock by 119
  seconds and send GET /seats/s12 again, and then send GET /seats. Finally send
  POST /demo/clock/advance once with zero seconds and once with a number of
  seconds that is not whole, and send POST /seats/s11/holds with a body that
  names no booker.
- V1-exp: The GET /seats taken before any command answers 200 and lists exactly
  s11, s12 and s13, each with status free, with no holder and no deadline. The
  demonstration clock answers 200 with the body {"now": \<whole seconds>} and no
  other field. The hold answers 201 with a hold reference in UUID form and a
  deadline equal to T plus 120, where the test adds the duration it configured
  to the time it read, and does not take the service's word for it. The first
  GET /seats/s12 answers 200 with status held, holder 'A' and the same deadline,
  and with no hold reference field anywhere in the body. The advance of 119
  seconds moves the reported time by exactly 119 seconds, and the seat is still
  reported held for 'A' with the same deadline. GET /seats lists exactly s11,
  s12 and s13, with s11 and s13 still free. The advance of zero seconds, the
  advance of a number that is not whole, and the hold that names no booker each
  answer 400 with reason code invalid-request and the path of the field that
  failed, and none of them moves the reported time or changes any seat.
- V1-fal: The oracle fails if the seating area read before any command is
  missing a configured seat or reports one as anything but free, if the
  demonstration clock answer carries any field besides now, if an advance does
  not move the reported time by exactly the seconds it was given, if the
  deadline differs from the independently computed sum, if the held report does
  not name the booker, if any response body carries the hold reference after the
  hold itself, if s11 or s13 changes, if the seat stops being reported held
  before its deadline is reached, or if an advance of zero seconds, an advance
  of a number that is not whole or a hold that names no booker is accepted.

### Targets (Value 1)

| Path | Decision | Reason |
|---|---|---|
| `src/domain/seat-state.ts` | EXTEND | V1-t1 |
| `src/domain/seat-transition.ts` | EXTEND | V1-t2 |
| `src/app/seat-service.ts` | EXTEND | V1-t3 |
| `src/adapter/http/wire.ts` | EXTEND | V1-t4 |
| `src/adapter/http/seat-routes.ts` | EXTEND | V1-t5 |

### Paradigm (Value 1)

functional

### Decisions (Value 1)

D-lazy-expiry, D-lazy-expiry-evidence, D-one-writer,
D-public-report-hides-reference, D-paradigm-functional, D-checker-mapping,
D-http-surface, D-node-http-server, D-zod-boundary, D-open-business-motivation,
D-open-svelte-client, D-restart-loses-state, D-clock-never-moves-back,
D-simulation-is-not-verification, D-model-limits, D-dependency-direction-law,
D-demo-operation-marked, D-agda-mutant-rejected, V1-decision,
D-substrate-policy, D-schema-refusal-coverage, D-shared-obligation-in-value-1,
D-wire-contract-pinned, D-one-clock-adapter

### Oracle (Value 1)

tests/acceptance/hold-a-free-seat.test.ts

### Acceptance supports (Value 1)

```json
[
  "package-lock.json",
  "package.json",
  "tests/acceptance/support/seat-api-client.ts",
  "tests/acceptance/support/start-test-service.ts",
  "tsconfig.json",
  "vitest.config.ts"
]
```

### Oracle verification index (Value 1)

```json
2
```

### Purpose (Value 1)

V1-purpose

### Constraints (Value 1)

C-public-port, C-hold-duration, C-deadline-authoritative, C-hold-reference,
C-demo-clock, C-fixed-inventory, C-in-memory, C-structured-json, C-out-of-scope,
C-user-standards, C-first-come

### Inherits (Value 1)

obs-seat-report, obs-inventory, obs-outcome, obs-clock, ctor-start, ctor-hold,
ctor-confirm, ctor-cancel, ctor-advance, gen-walk, law-sold-is-absorbing,
law-deadline-is-authoritative, law-only-the-holder-acts, law-hold-only-on-free,
law-refusal-is-inert, law-deadline-is-now-plus-duration,
law-report-is-idempotent, law-every-hold-is-released, law-wire-shape,
cc-one-holder, cc-sold-has-no-deadline, cc-opaque-reference,
cc-single-projection, seat-quint, seat-liveness-tla, seat-agda,
arch-dependency-direction

### Boundaries (Value 1)

```json
{
  "driving_port": {
    "ref": "B-driving-port"
  },
  "driven_ports": [
    {
      "ref": "B-driven-clock"
    },
    {
      "ref": "B-driven-store"
    },
    {
      "ref": "B-driven-references"
    },
    {
      "ref": "B-driven-config"
    }
  ],
  "dependency_direction": {
    "ref": "B-dependency-direction"
  },
  "failures": [
    {
      "condition": {
        "ref": "B-fail-held-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-held-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-seat-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-seat-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-body-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-body-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-restart-condition"
      },
      "outcome": "Indeterminate",
      "observation": {
        "ref": "B-fail-restart-observation"
      }
    }
  ],
  "applicability": "applicable"
}
```

### Public oracle (Value 1)

```json
{
  "observation": {
    "ref": "V1-obs"
  },
  "stimulus": {
    "ref": "V1-sti"
  },
  "expected": {
    "ref": "V1-exp"
  },
  "falsifier": {
    "ref": "V1-fal"
  }
}
```

### Architectural tests (Value 1)

```json
{
  "obligations": [],
  "applicability": "applicable"
}
```

### Contract tests (Value 1)

```json
{
  "reason": {
    "ref": "CT-no-independent-party"
  },
  "applicability": "not_applicable"
}
```

### Prefactoring (Value 1)

```json
{
  "reason": {
    "ref": "V1-prefactoring"
  },
  "applicability": "not_applicable"
}
```

### Agreement analysis (Value 1)

```json
{
  "reason": {
    "ref": "A-no-second-party"
  },
  "applicability": "not_applicable"
}
```

### Reuse analysis (Value 1)

| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| seat-state | `src/domain/seat-state.ts:1` | EXTEND | V1-t1 |
| seat-transition | `src/domain/seat-transition.ts:1` | EXTEND | V1-t2 |
| seat-service | `src/app/seat-service.ts:1` | EXTEND | V1-t3 |
| wire | `src/adapter/http/wire.ts:1` | EXTEND | V1-t4 |
| seat-routes | `src/adapter/http/seat-routes.ts:1` | EXTEND | V1-t5 |

### Impact closure (Value 1)

```json
{
  "items": [
    {
      "kind": "public_interface",
      "locator": "src/domain/seat-state.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V1-t1"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/domain/seat-transition.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V1-t2"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/app/seat-service.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V1-t3"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/adapter/http/wire.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V1-t4"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/adapter/http/seat-routes.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V1-t5"
      }
    }
  ],
  "applicability": "applicable"
}
```

### Adr (Value 1)

```json
{
  "reason": {
    "ref": "V1-adr"
  },
  "applicability": "not_applicable"
}
```

### Product change (Value 1)

Product change: required

### Verification (Value 1)

Verification command:

```sh
npm ci
```

Verification command:

```sh
npx tsc --noEmit
```

Verification command:

```sh
npx vitest run tests/acceptance/hold-a-free-seat.test.ts
```

## Value 2

### Facts (Value 2)

- V2-purpose: Deliver the second value of Last Seat: the holder confirms their
  held seat through the HTTP API before its deadline and the seat is then
  reported as sold to that holder, for good.
- V2-t1: The shared slice created this file. This value extends it because the
  sold seat value is added here, carrying an owner and deliberately no deadline.
- V2-t2: The shared slice created this file. This value extends it because the
  confirm branch of the pure transition compares the presented reference and the
  deadline and produces the sale.
- V2-t3: The shared slice created this file. This value extends it because the
  confirm operation reads the clock and writes the sold record.
- V2-t4: The shared slice created this file. This value extends it because the
  response shape of a confirmation and of a sold seat report.
- V2-t5: The shared slice created this file. This value extends it because the
  POST confirm route carrying the hold reference in its path.
- V2-decision: Value 2 changes no shared decision. It extends the modules the
  shared slice created, keeps the one expiry projection, the one writer and the
  declared HTTP surface, and adds no new port.
- V2-prefactoring: Value 2 adds behaviour to modules the shared slice created
  and moves no behaviour between them, so there is no preserving move to observe
  before and after.
- V2-archtests: The dependency-direction check is declared once at the shared
  scope and governs every module under src/domain, including the ones value 2
  adds. A second copy of the same law would give it two owners.
- V2-adr: The load-bearing decision, how expiry is realized, is recorded once in
  the shared record. Value 2 takes no architectural decision of its own.
- V2-obs: Through the HTTP API the holder of a seat confirms it before the
  deadline and sees the seat reported as sold to them, and the seat stays sold
  to them after the clock has passed the deadline the hold had.
- V2-sti: Start the service with the inventory ['s11','s12','s13'], a hold
  duration of 120 seconds and a clock the test controls. Hold s12 for booker 'A'
  and keep the hold reference the response returned. Advance the clock by 119
  seconds, so that one second of the hold is left. Send POST
  /seats/s12/holds/{holdRef}/confirm. Send GET /seats/s12. Then advance the
  clock by 600 seconds and send GET /seats/s12 again.
- V2-exp: The confirmation answers 200 and names 'A' as the owner. Both GET
  /seats/s12 answers report status sold with owner 'A', and neither carries a
  deadline or a hold reference. The second report, taken long after the deadline
  the hold had, is identical to the first.
- V2-fal: The oracle fails if the confirmation one second before the deadline is
  refused, if the sold report still carries a deadline or a hold reference, or
  if the seat is reported as anything but sold to 'A' after the clock has passed
  the old deadline.

### Targets (Value 2)

| Path | Decision | Reason |
|---|---|---|
| `src/domain/seat-state.ts` | EXTEND | V2-t1 |
| `src/domain/seat-transition.ts` | EXTEND | V2-t2 |
| `src/app/seat-service.ts` | EXTEND | V2-t3 |
| `src/adapter/http/wire.ts` | EXTEND | V2-t4 |
| `src/adapter/http/seat-routes.ts` | EXTEND | V2-t5 |

### Paradigm (Value 2)

functional

### Decisions (Value 2)

D-lazy-expiry, D-lazy-expiry-evidence, D-one-writer,
D-public-report-hides-reference, D-paradigm-functional, D-checker-mapping,
D-http-surface, D-node-http-server, D-zod-boundary, D-open-business-motivation,
D-open-svelte-client, D-restart-loses-state, D-clock-never-moves-back,
D-simulation-is-not-verification, D-model-limits, D-dependency-direction-law,
D-demo-operation-marked, D-agda-mutant-rejected, V2-decision,
D-substrate-policy, D-schema-refusal-coverage, D-wire-contract-pinned,
D-one-clock-adapter

### Oracle (Value 2)

tests/acceptance/confirm-a-held-seat.test.ts

### Acceptance supports (Value 2)

```json
[
  "package-lock.json",
  "package.json",
  "tests/acceptance/support/seat-api-client.ts",
  "tests/acceptance/support/start-test-service.ts",
  "tsconfig.json",
  "vitest.config.ts"
]
```

### Oracle verification index (Value 2)

```json
2
```

### Purpose (Value 2)

V2-purpose

### Constraints (Value 2)

C-public-port, C-hold-duration, C-deadline-authoritative, C-hold-reference,
C-demo-clock, C-fixed-inventory, C-in-memory, C-structured-json, C-out-of-scope,
C-user-standards, C-first-come

### Inherits (Value 2)

obs-seat-report, obs-inventory, obs-outcome, obs-clock, ctor-start, ctor-hold,
ctor-confirm, ctor-cancel, ctor-advance, gen-walk, law-sold-is-absorbing,
law-deadline-is-authoritative, law-only-the-holder-acts, law-hold-only-on-free,
law-refusal-is-inert, law-deadline-is-now-plus-duration,
law-report-is-idempotent, law-every-hold-is-released, law-wire-shape,
cc-one-holder, cc-sold-has-no-deadline, cc-opaque-reference,
cc-single-projection, seat-quint, seat-liveness-tla, seat-agda,
arch-dependency-direction

### Boundaries (Value 2)

```json
{
  "driving_port": {
    "ref": "B-driving-port"
  },
  "driven_ports": [
    {
      "ref": "B-driven-clock"
    },
    {
      "ref": "B-driven-store"
    },
    {
      "ref": "B-driven-references"
    },
    {
      "ref": "B-driven-config"
    }
  ],
  "dependency_direction": {
    "ref": "B-dependency-direction"
  },
  "failures": [
    {
      "condition": {
        "ref": "B-fail-expired-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-expired-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-sold-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-sold-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-holder-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-holder-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-seat-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-seat-observation"
      }
    }
  ],
  "applicability": "applicable"
}
```

### Public oracle (Value 2)

```json
{
  "observation": {
    "ref": "V2-obs"
  },
  "stimulus": {
    "ref": "V2-sti"
  },
  "expected": {
    "ref": "V2-exp"
  },
  "falsifier": {
    "ref": "V2-fal"
  }
}
```

### Architectural tests (Value 2)

```json
{
  "obligations": [],
  "applicability": "applicable"
}
```

### Contract tests (Value 2)

```json
{
  "reason": {
    "ref": "CT-no-independent-party"
  },
  "applicability": "not_applicable"
}
```

### Prefactoring (Value 2)

```json
{
  "reason": {
    "ref": "V2-prefactoring"
  },
  "applicability": "not_applicable"
}
```

### Agreement analysis (Value 2)

```json
{
  "reason": {
    "ref": "A-no-second-party"
  },
  "applicability": "not_applicable"
}
```

### Reuse analysis (Value 2)

| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| seat-state | `src/domain/seat-state.ts:1` | EXTEND | V2-t1 |
| seat-transition | `src/domain/seat-transition.ts:1` | EXTEND | V2-t2 |
| seat-service | `src/app/seat-service.ts:1` | EXTEND | V2-t3 |
| wire | `src/adapter/http/wire.ts:1` | EXTEND | V2-t4 |
| seat-routes | `src/adapter/http/seat-routes.ts:1` | EXTEND | V2-t5 |

### Impact closure (Value 2)

```json
{
  "items": [
    {
      "kind": "public_interface",
      "locator": "src/domain/seat-state.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V2-t1"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/domain/seat-transition.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V2-t2"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/app/seat-service.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V2-t3"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/adapter/http/wire.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V2-t4"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/adapter/http/seat-routes.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V2-t5"
      }
    }
  ],
  "applicability": "applicable"
}
```

### Adr (Value 2)

```json
{
  "reason": {
    "ref": "V2-adr"
  },
  "applicability": "not_applicable"
}
```

### Product change (Value 2)

Product change: required

### Verification (Value 2)

Verification command:

```sh
npm ci
```

Verification command:

```sh
npx tsc --noEmit
```

Verification command:

```sh
npx vitest run tests/acceptance/confirm-a-held-seat.test.ts
```

## Value 3

### Facts (Value 3)

- V3-purpose: Deliver the third value of Last Seat: every hold and every
  confirmation that would give one seat to a second booker is refused, and only
  the sender of the hold reference may confirm, so one seat is never sold twice.
- V3-t1: The shared slice created this file. This value extends it because every
  refusal decision is taken here, on the projected seat, and no refusal writes
  to the store.
- V3-t2: The shared slice created this file. This value extends it because the
  refusal body with its machine reason code and its human message.
- V3-t3: The shared slice created this file. This value extends it because the
  mapping from each refusal reason to its HTTP status.
- V3-decision: Value 3 changes no shared decision. It extends the modules the
  shared slice created, keeps the one expiry projection, the one writer and the
  declared HTTP surface, and adds no new port.
- V3-prefactoring: Value 3 adds behaviour to modules the shared slice created
  and moves no behaviour between them, so there is no preserving move to observe
  before and after.
- V3-archtests: The dependency-direction check is declared once at the shared
  scope and governs every module under src/domain, including the ones value 3
  adds. A second copy of the same law would give it two owners.
- V3-adr: The load-bearing decision, how expiry is realized, is recorded once in
  the shared record. Value 3 takes no architectural decision of its own.
- V3-obs: Through the HTTP API a second booker is refused a seat that is held or
  sold, a confirmation carrying a reference that was never granted is refused,
  every refusal leaves the whole seating area exactly as it was, and the seat
  ends up sold to one booker only.
- V3-sti: Start the service with the inventory ['s11','s12','s13'] and a hold
  duration of 120 seconds. Hold s12 for 'A' and keep the reference. Read GET
  /seats. Send POST /seats/s12/holds with {"booker":"B"}. Send POST
  /seats/s12/holds/{a freshly generated UUID that was never granted}/confirm.
  Read GET /seats again. Confirm s12 with A's own reference. Read GET /seats.
  Send POST /seats/s12/holds with {"booker":"B"} once more and POST
  /seats/s12/holds/{A's reference}/confirm once more. Read GET /seats a final
  time.
- V3-exp: B's first hold answers 409 with reason code seat-held. The
  confirmation with the never-granted reference answers 404 with reason code
  no-such-hold. The GET /seats taken after those two refusals is byte-for-byte
  the GET /seats taken before them. A's confirmation answers 200 and the seat is
  then sold to 'A'. B's second hold and the repeated confirmation both answer
  409 with reason code seat-sold, and the final GET /seats is byte-for-byte the
  one taken straight after the sale.
- V3-fal: The oracle fails if any refusal changes a status, a holder or a
  deadline anywhere in the seating area, if booker 'B' ever receives a grant or
  a sale for s12, if a repeated confirmation with A's own reference succeeds a
  second time, or if the refusal for a never-granted reference can be told apart
  from the refusal for a wrong one.

### Targets (Value 3)

| Path | Decision | Reason |
|---|---|---|
| `src/app/seat-service.ts` | EXTEND | V3-t1 |
| `src/adapter/http/wire.ts` | EXTEND | V3-t2 |
| `src/adapter/http/seat-routes.ts` | EXTEND | V3-t3 |

### Paradigm (Value 3)

functional

### Decisions (Value 3)

D-lazy-expiry, D-lazy-expiry-evidence, D-one-writer,
D-public-report-hides-reference, D-paradigm-functional, D-checker-mapping,
D-http-surface, D-node-http-server, D-zod-boundary, D-open-business-motivation,
D-open-svelte-client, D-restart-loses-state, D-clock-never-moves-back,
D-simulation-is-not-verification, D-model-limits, D-dependency-direction-law,
D-demo-operation-marked, D-agda-mutant-rejected, V3-decision,
D-substrate-policy, D-wire-contract-pinned, D-one-clock-adapter,
D-cancel-on-sold-reason-undeclared

### Oracle (Value 3)

tests/acceptance/one-seat-is-never-sold-twice.test.ts

### Acceptance supports (Value 3)

```json
[
  "package-lock.json",
  "package.json",
  "tests/acceptance/support/seat-api-client.ts",
  "tests/acceptance/support/start-test-service.ts",
  "tsconfig.json",
  "vitest.config.ts"
]
```

### Oracle verification index (Value 3)

```json
2
```

### Purpose (Value 3)

V3-purpose

### Constraints (Value 3)

C-public-port, C-hold-duration, C-deadline-authoritative, C-hold-reference,
C-demo-clock, C-fixed-inventory, C-in-memory, C-structured-json, C-out-of-scope,
C-user-standards, C-first-come

### Inherits (Value 3)

obs-seat-report, obs-inventory, obs-outcome, obs-clock, ctor-start, ctor-hold,
ctor-confirm, ctor-cancel, ctor-advance, gen-walk, law-sold-is-absorbing,
law-deadline-is-authoritative, law-only-the-holder-acts, law-hold-only-on-free,
law-refusal-is-inert, law-deadline-is-now-plus-duration,
law-report-is-idempotent, law-every-hold-is-released, law-wire-shape,
cc-one-holder, cc-sold-has-no-deadline, cc-opaque-reference,
cc-single-projection, seat-quint, seat-liveness-tla, seat-agda,
arch-dependency-direction

### Boundaries (Value 3)

```json
{
  "driving_port": {
    "ref": "B-driving-port"
  },
  "driven_ports": [
    {
      "ref": "B-driven-clock"
    },
    {
      "ref": "B-driven-store"
    },
    {
      "ref": "B-driven-references"
    },
    {
      "ref": "B-driven-config"
    }
  ],
  "dependency_direction": {
    "ref": "B-dependency-direction"
  },
  "failures": [
    {
      "condition": {
        "ref": "B-fail-expired-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-expired-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-held-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-held-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-sold-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-sold-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-holder-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-holder-observation"
      }
    }
  ],
  "applicability": "applicable"
}
```

### Public oracle (Value 3)

```json
{
  "observation": {
    "ref": "V3-obs"
  },
  "stimulus": {
    "ref": "V3-sti"
  },
  "expected": {
    "ref": "V3-exp"
  },
  "falsifier": {
    "ref": "V3-fal"
  }
}
```

### Architectural tests (Value 3)

```json
{
  "obligations": [],
  "applicability": "applicable"
}
```

### Contract tests (Value 3)

```json
{
  "reason": {
    "ref": "CT-no-independent-party"
  },
  "applicability": "not_applicable"
}
```

### Prefactoring (Value 3)

```json
{
  "reason": {
    "ref": "V3-prefactoring"
  },
  "applicability": "not_applicable"
}
```

### Agreement analysis (Value 3)

```json
{
  "reason": {
    "ref": "A-no-second-party"
  },
  "applicability": "not_applicable"
}
```

### Reuse analysis (Value 3)

| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| seat-service | `src/app/seat-service.ts:1` | EXTEND | V3-t1 |
| wire | `src/adapter/http/wire.ts:1` | EXTEND | V3-t2 |
| seat-routes | `src/adapter/http/seat-routes.ts:1` | EXTEND | V3-t3 |

### Impact closure (Value 3)

```json
{
  "items": [
    {
      "kind": "public_interface",
      "locator": "src/app/seat-service.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V3-t1"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/adapter/http/wire.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V3-t2"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/adapter/http/seat-routes.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V3-t3"
      }
    }
  ],
  "applicability": "applicable"
}
```

### Adr (Value 3)

```json
{
  "reason": {
    "ref": "V3-adr"
  },
  "applicability": "not_applicable"
}
```

### Product change (Value 3)

Product change: required

### Verification (Value 3)

Verification command:

```sh
npm ci
```

Verification command:

```sh
npx tsc --noEmit
```

Verification command:

```sh
npx vitest run tests/acceptance/one-seat-is-never-sold-twice.test.ts
```

## Value 4

### Facts (Value 4)

- V4-purpose: Deliver the fourth value of Last Seat: an unconfirmed hold is
  released at once when the holder cancels and automatically when its deadline
  passes, the seat is then free for anybody, and a sold seat is never released.
- V4-t1: The shared slice created this file. This value extends it because the
  expiry projection and the cancel branch of the pure transition live here.
- V4-t2: The shared slice created this file. This value extends it because the
  cancel operation and the clock reading every command makes.
- V4-t3: The shared slice created this file. This value extends it because the
  advanceable clock the demonstration operation moves.
- V4-t4: The shared slice created this file. This value extends it because the
  response shape of a cancellation and of the demonstration clock operation.
- V4-t5: The shared slice created this file. This value extends it because the
  POST cancel route and the demonstration clock route.
- V4-decision: Value 4 changes no shared decision. It extends the modules the
  shared slice created, keeps the one expiry projection, the one writer and the
  declared HTTP surface, and adds no new port.
- V4-prefactoring: Value 4 adds behaviour to modules the shared slice created
  and moves no behaviour between them, so there is no preserving move to observe
  before and after.
- V4-archtests: The dependency-direction check is declared once at the shared
  scope and governs every module under src/domain, including the ones value 4
  adds. A second copy of the same law would give it two owners.
- V4-adr: The load-bearing decision, how expiry is realized, is recorded once in
  the shared record. Value 4 takes no architectural decision of its own.
- V4-obs: Through the HTTP API a hold ends in every way it can: the holder
  cancels and the seat is free at once, nobody acts and the seat is free the
  moment the deadline is reached, a confirmation sent at that same moment is
  refused because the hold expired, the freed seat can be held by anybody, and a
  sold seat stays sold however far the clock moves.
- V4-sti: Start the service with the inventory ['s11','s12','s13'] and a hold
  duration of 120 seconds. Hold s12 for 'A', then send POST
  /seats/s12/holds/{holdRef}/cancel after advancing the clock by 10 seconds, and
  read GET /seats/s12. Hold s12 for 'A' again, advance the clock by exactly 120
  seconds so that the clock equals the deadline, read GET /seats/s12 and send
  POST /seats/s12/holds/{the second holdRef}/confirm. Then hold s12 for 'B' and
  read GET /seats/s12. Separately hold s11 for 'A', confirm it, advance the
  clock by 3600 seconds and read GET /seats/s11.
- V4-exp: The cancellation answers 200 and s12 is reported free well before its
  deadline. At exactly the deadline second s12 is reported free, and the
  confirmation sent at that same second answers 409 with reason code
  hold-expired. Booker 'B' is then granted s12 with a new reference and a new
  deadline. Seat s11 is reported sold to 'A' after the clock has moved 3600
  seconds past its old deadline.
- V4-fal: The oracle fails if s12 is still reported held after the cancellation,
  if it is still reported held at the deadline second, if the confirmation at
  the deadline second succeeds, if booker 'B' is refused the released seat, or
  if s11 is reported as anything but sold to 'A' after the clock advance.

### Targets (Value 4)

| Path | Decision | Reason |
|---|---|---|
| `src/domain/seat-transition.ts` | EXTEND | V4-t1 |
| `src/app/seat-service.ts` | EXTEND | V4-t2 |
| `src/adapter/clock.ts` | EXTEND | V4-t3 |
| `src/adapter/http/wire.ts` | EXTEND | V4-t4 |
| `src/adapter/http/seat-routes.ts` | EXTEND | V4-t5 |

### Paradigm (Value 4)

functional

### Decisions (Value 4)

D-lazy-expiry, D-lazy-expiry-evidence, D-one-writer,
D-public-report-hides-reference, D-paradigm-functional, D-checker-mapping,
D-http-surface, D-node-http-server, D-zod-boundary, D-open-business-motivation,
D-open-svelte-client, D-restart-loses-state, D-clock-never-moves-back,
D-simulation-is-not-verification, D-model-limits, D-dependency-direction-law,
D-demo-operation-marked, D-agda-mutant-rejected, V4-decision,
D-substrate-policy, D-schema-refusal-coverage, D-wire-contract-pinned,
D-one-clock-adapter, D-cancel-on-sold-reason-undeclared

### Oracle (Value 4)

tests/acceptance/every-hold-is-released.test.ts

### Acceptance supports (Value 4)

```json
[
  "package-lock.json",
  "package.json",
  "tests/acceptance/support/seat-api-client.ts",
  "tests/acceptance/support/start-test-service.ts",
  "tsconfig.json",
  "vitest.config.ts"
]
```

### Oracle verification index (Value 4)

```json
2
```

### Purpose (Value 4)

V4-purpose

### Constraints (Value 4)

C-public-port, C-hold-duration, C-deadline-authoritative, C-hold-reference,
C-demo-clock, C-fixed-inventory, C-in-memory, C-structured-json, C-out-of-scope,
C-user-standards, C-first-come

### Inherits (Value 4)

obs-seat-report, obs-inventory, obs-outcome, obs-clock, ctor-start, ctor-hold,
ctor-confirm, ctor-cancel, ctor-advance, gen-walk, law-sold-is-absorbing,
law-deadline-is-authoritative, law-only-the-holder-acts, law-hold-only-on-free,
law-refusal-is-inert, law-deadline-is-now-plus-duration,
law-report-is-idempotent, law-every-hold-is-released, law-wire-shape,
cc-one-holder, cc-sold-has-no-deadline, cc-opaque-reference,
cc-single-projection, seat-quint, seat-liveness-tla, seat-agda,
arch-dependency-direction

### Boundaries (Value 4)

```json
{
  "driving_port": {
    "ref": "B-driving-port"
  },
  "driven_ports": [
    {
      "ref": "B-driven-clock"
    },
    {
      "ref": "B-driven-store"
    },
    {
      "ref": "B-driven-references"
    },
    {
      "ref": "B-driven-config"
    }
  ],
  "dependency_direction": {
    "ref": "B-dependency-direction"
  },
  "failures": [
    {
      "condition": {
        "ref": "B-fail-expired-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-expired-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-sold-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-sold-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-holder-condition"
      },
      "outcome": "Refusal",
      "observation": {
        "ref": "B-fail-holder-observation"
      }
    },
    {
      "condition": {
        "ref": "B-fail-restart-condition"
      },
      "outcome": "Indeterminate",
      "observation": {
        "ref": "B-fail-restart-observation"
      }
    }
  ],
  "applicability": "applicable"
}
```

### Public oracle (Value 4)

```json
{
  "observation": {
    "ref": "V4-obs"
  },
  "stimulus": {
    "ref": "V4-sti"
  },
  "expected": {
    "ref": "V4-exp"
  },
  "falsifier": {
    "ref": "V4-fal"
  }
}
```

### Architectural tests (Value 4)

```json
{
  "obligations": [],
  "applicability": "applicable"
}
```

### Contract tests (Value 4)

```json
{
  "reason": {
    "ref": "CT-no-independent-party"
  },
  "applicability": "not_applicable"
}
```

### Prefactoring (Value 4)

```json
{
  "reason": {
    "ref": "V4-prefactoring"
  },
  "applicability": "not_applicable"
}
```

### Agreement analysis (Value 4)

```json
{
  "reason": {
    "ref": "A-no-second-party"
  },
  "applicability": "not_applicable"
}
```

### Reuse analysis (Value 4)

| Symbol | Locator | Decision | Reason |
|---|---|---|---|
| seat-transition | `src/domain/seat-transition.ts:1` | EXTEND | V4-t1 |
| seat-service | `src/app/seat-service.ts:1` | EXTEND | V4-t2 |
| clock | `src/adapter/clock.ts:1` | EXTEND | V4-t3 |
| wire | `src/adapter/http/wire.ts:1` | EXTEND | V4-t4 |
| seat-routes | `src/adapter/http/seat-routes.ts:1` | EXTEND | V4-t5 |

### Impact closure (Value 4)

```json
{
  "items": [
    {
      "kind": "public_interface",
      "locator": "src/domain/seat-transition.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V4-t1"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/app/seat-service.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V4-t2"
      }
    },
    {
      "kind": "runtime",
      "locator": "src/adapter/clock.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V4-t3"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/adapter/http/wire.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V4-t4"
      }
    },
    {
      "kind": "public_interface",
      "locator": "src/adapter/http/seat-routes.ts",
      "decision": "CHANGED",
      "reason": {
        "ref": "V4-t5"
      }
    }
  ],
  "applicability": "applicable"
}
```

### Adr (Value 4)

```json
{
  "reason": {
    "ref": "V4-adr"
  },
  "applicability": "not_applicable"
}
```

### Product change (Value 4)

Product change: required

### Verification (Value 4)

Verification command:

```sh
npm ci
```

Verification command:

```sh
npx tsc --noEmit
```

Verification command:

```sh
npx vitest run tests/acceptance/every-hold-is-released.test.ts
```
