# Corporate Ops: design notes

Layout. A 52px top bar carries the CSS mark, the product name, the search field and the Admin button. Below it a 216px sidebar and a fluid main column sit on an 8px rhythm inside a 1160px shell.
The ask card is the first thing in the right column, so the page opens on an action rather than a wall of text. Under 900px the sidebar becomes a wrapped row of category chips and the main column takes the full width.

Colour. DHL red #D40511 appears in four places only: the primary button, the active sidebar item, focus rings and the open accordion chevron. Everything else is white, #F3F5F7 page grey, #DCE1E6 hairlines and #14181C ink.
Status colour is limited to a green published chip and an amber waiting chip, because an admin queue needs scannable state rather than decoration.

Type. One family, Inter with a system stack fallback so the page still reads correctly offline from file://. Sizes stay tight: 34px heading, 14px body, 13px meta, 12.5px hints, with tabular figures on the counts so they do not jump when they change.

Admin view. The Admin button swaps the main column and hides the sidebar, which keeps one page and one source of truth. Pending questions, FAQ entries and the add form are three panels, and every action (answer, publish, unpublish, edit, delete, add) writes to the same in memory store before calling render().
That means the public list and the sidebar counts reflect admin work as soon as admin is closed. persist() is an empty hook where localStorage or an API call can go later.

Trade-offs. Deletes use an inline confirm step instead of a modal: quicker to build and kinder to keyboards, but less familiar. Re-rendering innerHTML rebuilds the lists, so focus is restored by hand after an accordion toggle or an edit, and text typed in the search field while an edit form is open would be lost. A version that has to survive that would keep form drafts in the store.
