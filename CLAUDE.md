# Ghar

AI house-design & cost estimator for India (an Indian take on Drafted.ai). See `README.md`
for the flow, endpoints, and how to run. Don't restate here what the code/README already say.

## Current product stage — Pre-PMF / validation

This product is early-stage and still testing product-market fit. Few or no customers.
Do **not** design it as if it were a mature high-scale product.

Assume: very small user base · requirements change often · features may be deleted entirely ·
developer time is scarcer than compute · fast feedback from real users beats architectural
completeness.

**North star: optimize for the cost of *changing* the product, not the theoretical quality of
the final architecture.**

## Engineering priorities (in order)

1. Speed of iteration
2. Simplicity
3. Low operational / maintenance burden
4. Correctness for current requirements
5. Scalability & extensibility — only when actually required

## Principles

- Prefer the simplest solution that meets the current requirement. Apply YAGNI aggressively.
- Don't add a service, database, queue, cache, background worker, abstraction layer,
  dependency, or deployment component without a concrete *current* requirement that needs it.
  First ask: "What current requirement makes this necessary?" No answer → don't add it.
- Prefer boring, well-supported tech over custom/sophisticated solutions.
- Some duplication (WET) is fine when removing it would force a premature abstraction.
- Write straightforward code that's easy to delete or change. Avoid speculative
  configurability and extensibility.
- When multiple implementations are reasonable, prefer the one with the fewest concepts,
  files, dependencies, and operational components.
- When proposing architecture, distinguish "needed now" from "could be useful later" —
  surface the foresight, but do **not** implement the latter.

## Non-negotiable exception

Never trade away security, data integrity, or obvious correctness for speed. Keep
irreversible decisions deliberate. Everything else should bias toward reversible, low-cost
decisions.
