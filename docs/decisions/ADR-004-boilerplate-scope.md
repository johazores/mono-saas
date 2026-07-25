# ADR-004: Define the boilerplate core and keep business domains outside it

- **Status:** Accepted
- **Date:** 2026-07-25
- **Roadmap task:** T-004

## Context

The project vision lists many possible products: SaaS, CRM, ERP, ecommerce, marketplaces, booking, school systems, membership platforms, community products, dashboards, portals, events, and subscription businesses.

Attempting to model every vertical inside the boilerplate would create generic entities with unclear ownership and excessive configuration. That would conflict with the project's primary engineering principles: less code, fewer abstractions, simple modules, and maintainable architecture.

The boilerplate should provide infrastructure and reusable product foundations. Consuming applications should own their business-specific models and workflows.

## Decision

The Mono SaaS boilerplate provides a focused platform core. It does not attempt to become a universal business framework.

## Included in the core

### Identity and access

- provider-agnostic member authentication;
- replaceable administrator authentication;
- users and external identity links;
- tenants, organizations, teams, memberships, and invitations;
- role-based access control and policy enforcement;
- ownership transfer and impersonation controls.

### SaaS operations

- provider-neutral products, prices, checkout, subscriptions, and invoices;
- tenant billing entitlements;
- feature flags and plan access;
- tenant configuration and encrypted secrets;
- audit logs;
- notifications and delivery adapters;
- webhook ingestion, signature validation, idempotency, and delivery logs;
- modular integration registration.

### Content and presentation

- reusable CMS content types, pages, taxonomies, media metadata, and public read APIs;
- configurable site identity and theme tokens;
- public, member, and administration application shells;
- shared UI primitives.

### Platform foundations

- tenant-scoped database access;
- API response, validation, and error conventions;
- object-storage abstraction;
- structured logging and health checks;
- testing foundations;
- documented deployment boundaries.

## Excluded from the core

The consuming product owns domain entities and workflows such as:

- CRM leads, opportunities, pipelines, and sales processes;
- ERP inventory, purchasing, accounting, and manufacturing;
- ecommerce carts, fulfillment, shipping, and catalog-specific rules beyond the generic billing core;
- marketplace sellers, listings, commissions, escrow, and disputes;
- booking resources, schedules, availability, and reservations;
- school students, guardians, classes, grades, and attendance;
- community posts, feeds, moderation, and reputation;
- event registrations, venues, sessions, and ticketing;
- industry-specific compliance and reporting.

Example modules and starter applications may demonstrate these domains, but their models must not be required by the core packages.

## Extension rule

A capability belongs in the core only when all of these are true:

1. It is required by several materially different SaaS products.
2. Its ownership and security boundary are stable across those products.
3. It can be expressed without business-domain terminology.
4. It does not force unused tables, routes, or UI into consuming products.
5. Its abstraction is simpler than implementing it independently in each product.

If these conditions are not met, the capability belongs in an optional module or consuming application.

## Module requirements

Optional modules must:

- register settings, permissions, routes, webhooks, and navigation explicitly;
- depend on published core interfaces rather than internal implementation files;
- avoid schema fields that name one external provider;
- be removable without breaking unrelated core behavior;
- include their own migrations, tests, and documentation.

## Consequences

### Positive

- The core remains understandable and reusable.
- Product teams can model their domain directly rather than through vague generic records.
- Security-critical abstractions receive more attention than broad feature coverage.
- Optional modules can evolve independently.

### Negative

- A consuming product still requires domain implementation work.
- The repository will not provide a complete CRM, ERP, or marketplace out of the box.
- Module boundaries must be enforced during code review.

## Review guideline

Every feature PR should identify whether it changes:

- the platform core;
- an optional module; or
- a consuming product.

A feature that introduces domain-specific terminology into the core must reference this ADR and justify why it meets the extension rule.
