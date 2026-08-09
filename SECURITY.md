# Security Policy

This repository is public, and the SafetyIQ platform it builds handles employee
records, signed HR documents, payroll data, and client proposals. We take
reports seriously and we would rather hear about a problem early than tidily.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** A public issue
tells everyone else about the flaw at the same moment it tells us.

Use GitHub's private vulnerability reporting instead:

> Repository → **Security** tab → **Report a vulnerability**

That opens a private channel visible only to the maintainers. If the tab is not
available to you, open a normal issue containing only the words "security
report — please contact me" and no technical detail, and a maintainer will
follow up privately.

## What to include

Whatever you have is welcome. The most useful reports contain:

- What the flaw allows someone to do, in one sentence
- The affected route, table, policy, or file
- Steps to reproduce, or the request that demonstrates it
- Whether you accessed any real data (and please stop if you did)

## Scope

In scope: authentication and session handling, Row Level Security policies and
tenant isolation, server actions and API routes, the AI gateway, and anything
that discloses data across user or company boundaries.

Out of scope: findings from automated scanners with no demonstrated impact,
missing hardening headers with no exploit path, denial of service through sheer
volume, and social engineering of staff.

## Please do not

Access, modify, or delete data belonging to anyone else; degrade the service for
real users; or run automated scans against production. If a proof of concept
requires any of these, describe it rather than performing it.

## Response

We aim to acknowledge a report within **3 business days** and to give an initial
assessment within **10 business days**. Fixes are prioritized by real
exploitability rather than by scanner severity label.

Thank you for reporting responsibly.
