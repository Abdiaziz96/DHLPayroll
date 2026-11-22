# DHL Payroll Answers

A small internal page where colleagues can ask a payroll question and read the ones Emma gets asked most often, plus an admin page where she answers the queue and manages the FAQ.

Built as a demo. No backend, no database, no build step, no framework. Static files only.

## Try it

Double-click `index.html`. That is the whole setup. Both pages work straight off the disk because there is no build and no network request anywhere.

The `Admin` button in the top right corner opens `admin.html`.

## Put it on Vercel

The folder is ready to deploy as is.

**Drag and drop:** go to vercel.com, create a new project, and drop this folder in. Vercel serves `index.html` at the root and `admin.html` at `/admin`. Nothing to configure.

**Command line:**

```
cd dhl-payroll-faq
npx.cmd vercel
```

`.vercelignore` keeps `designs/`, `tests/` and the markdown files out of the deployment, so the live site is only the pages, the CSS and the JS.

## What is in here

| Path | What it is |
| --- | --- |
| `index.html` | The public page. Ask box, search, FAQ accordion. |
| `admin.html` | The admin page. Question queue and answer management. |
| `assets/css/site.css` | Design tokens, base styles, everything on the public page. |
| `assets/css/admin.css` | The admin page only. |
| `assets/js/store.js` | All the data. Seed content, reads and writes, local storage. |
| `assets/js/public.js` | Public page behaviour. |
| `assets/js/admin.js` | Admin page behaviour. |
| `vercel.json` | Clean URLs and a few security headers. |
| `tests/run-tests.mjs` | 51 automated checks, driven in a real headless browser. |
| `designs/` | The three design templates this was chosen from. Not deployed. |

## How the demo stores data

Everything lives in the browser under the local storage key `dhl-payroll-faq.v1`. Both pages read and write the same store, so an edit in admin shows up on the public page immediately.

The honest limitation, and it matters: **local storage is per browser, per device.** A question a colleague types on their own laptop is saved on their laptop and nowhere else, so it will not appear in Emma's admin on hers. Two tabs on the same machine stay in step. Two machines do not.

That is the price of having no backend. It is fine for showing Emma how it would work. It is not fine for real use.

The admin page has Export and Import buttons so a demo can be moved between machines by hand.

## What is deliberately missing

- **No submissions to a server.** The send button saves locally and shows a confirmation.
- **No login.** The Admin link opens the page directly. There is a placeholder for a passphrase gate, nothing behind it.
- **No real policy wording.** Pay dates, cut-off times, rates and premiums in the seed answers are example figures. The footer says so on every page.

## Adding a backend later

`assets/js/store.js` is the only file that would change. It exposes one flat API (`listFaqs`, `saveFaq`, `deleteFaq`, `setPublished`, `addQuestion`, `answerQuestion`, `deleteQuestion`) and everything else calls that. Replace the bodies with `fetch` calls against an API or a Supabase table and both pages keep working unchanged. The `commit()` function is the single write path.

## Running the checks

```
node tests/run-tests.mjs
```

Drives the real pages in headless Edge over the DevTools protocol: the accordion, the one-at-a-time rule, search and the empty state, sending a question, the admin queue, answering, publishing, unpublishing, editing, deleting, adding, category filters, the round trip from admin back to the public page, and a no-horizontal-overflow check at 320, 390, 768 and 1440 pixels.

It also rewrites the screenshots in `tests/_shots/`. Exit code 0 means everything passed.
