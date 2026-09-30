# Phase One Handbook: Inventory Management System

This handbook explains **everything that was built in phase one**, starting from a freshly installed
Fedora laptop: what was installed, which commands were run, how the app works, how its parts talk
to each other, and how to change things safely.

It is written for someone who is **not a programmer**. Technical words are explained the first
time they appear, and there is a [glossary](01-overview.md#glossary) you can come back to. Commands
are shown in grey boxes: copy them into the **Konsole** terminal app and press Enter.

## What phase one delivers, in one paragraph

A website where people can **create an account**, **confirm their email address**, **sign in** with a
password or with **Google**, protect the account with a **6-digit code from a phone app** (two-factor
authentication), **recover** if they lose that phone, and **reset a forgotten password** by email.
It runs in **containers** (sealed boxes, each holding one program), so it can be moved to any Linux
server and started with one command. The inventory screens themselves (products, stock) are phase two.

## Chapters

| # | Chapter | Read it when you want to… |
| --- | --- | --- |
| 1 | [Overview and glossary](01-overview.md) | understand the big picture and the vocabulary |
| 2 | [Setup from a fresh Fedora install](02-setup-from-fresh-fedora.md) | see every command that was run, or rebuild a machine |
| 3 | [Technologies and packages](03-technologies.md) | know what each tool is, and why it was chosen |
| 4 | [User flows](04-user-flows.md) | see what users experience at each step (with screenshots) |
| 5 | [Backend logic and security](05-backend-logic.md) | understand what happens behind each click |
| 6 | [Database and Prisma](06-database-and-prisma.md) | understand the tables, and how to change them |
| 7 | [Containers and storage](07-containers-and-storage.md) | know how many containers there are, and where data lives |
| 8 | [Networking, domain and HTTPS](08-networking-domain-https.md) | understand ports, domains, Let's Encrypt and firewalls |
| 9 | [Configuration (`.env`)](09-configuration.md) | change a setting |
| 10 | [Running in production](10-operations.md) | deploy, update, back up, restore, move servers |
| 11 | [Making changes](11-making-changes.md) | fix or change something without breaking it |
| 12 | [Testing and CI/CD](12-testing-and-ci.md) | check that everything still works |
| 13 | [Troubleshooting](13-troubleshooting.md) | something isn't working |
| 14 | [Design, dev vs containers, how to test](14-design-and-local-testing.md) | understand the folder design and test the app yourself |

## The five commands you'll use most

```bash
cd ~/Projects/inventory-management-system   # go to the project folder (always first)
npm run services:up                         # start the database + test inbox (development)
npm run dev                                 # run the app for development → http://localhost:3000
podman compose up -d --build                # production: build and start everything
./scripts/backup-db.sh                      # save a copy of the database
```

## Where things are

| What | Where |
| --- | --- |
| The project (all code and settings) | `~/Projects/inventory-management-system` |
| Settings and secrets | `.env` in the project folder (never shared or committed) |
| Database files | the folder named in `POSTGRES_DATA_DIR` (currently `./data/postgres`) |
| Database backups | `./backups/` |
| Code on GitHub | https://github.com/AmmadIrshad/Inventory-management-system |
| Screenshots used in these docs | `docs/screenshots/` |
