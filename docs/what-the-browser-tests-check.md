# What the browser tests check

These tests open the real app in a real browser (Chromium) and do what a person would do: tap, type, reload, go offline. They run on every change. Most also check three screen sizes (phone, tablet, desktop) and that nothing scrolls sideways.

The story keys in the headings, such as GRO-02, are the Linear issues each section comes from.

This page is for reading, not for running. Each line is one thing the app is checked for. A test fails if this page and the browser tests disagree about which features are covered, so a new feature test needs a new line here.

For the technical list, run `pnpm tests:list`. For what only a person can check, see [manual-checks.md](manual-checks.md).

## The whole app (FND-01, FND-04, FND-05, MIG-04, SET-01)

- The site loads, and a visitor who is not signed in gets nothing from the data. <!-- AC-FND-01.2 AC-MIG-04.2 AC-MIG-04.3 AC-MIG-04.6 -->
- A signed-in person who is not the owner is refused everywhere. An expired or tampered sign-in is refused. <!-- AC-MIG-04.2 AC-MIG-04.3 AC-MIG-04.6 -->
- Navigation fits each screen: bottom tabs on a phone, a side rail on a tablet, a sidebar on a desktop, in light and dark themes. <!-- AC-FND-04.1 AC-FND-04.2 AC-FND-04.3 AC-FND-04.4 AC-FND-04.5 -->
- On a phone, Settings is found under More. <!-- AC-FND-04.1 -->
- The app can be installed on a phone, and the opening screen still loads with no signal, with a message. Private data is never kept for offline use, except the grocery list. <!-- AC-FND-05.2 AC-FND-05.3 -->
- Saving a reading uses the time zone chosen in Settings. <!-- AC-SET-01.5 -->
- Most of the tests below run against the real server and a real database, not pretend ones. <!-- AC-OPS-04.3 -->

## Easy to use for everyone (SET-02)

- An automatic scan finds no accessibility problems on any main screen, in light and dark themes. <!-- AC-SET-02.1 AC-SET-02.4 -->
- Everything can be reached and used with the keyboard alone, and shows where you are. <!-- AC-SET-02.2 -->
- Every button and link is big enough to tap on a phone. <!-- AC-SET-02.3 -->
- A button is disabled while it saves and shows a spinner, and only one request is sent. <!-- AC-SET-02.7 -->
- Each screen has its own tab title, and every menu item has an icon. <!-- AC-SET-02.8 -->
- A slow screen shows placeholder bars, not bare text. <!-- AC-SET-02.9 -->
- Tapping anywhere on a Home tile opens its screen. <!-- AC-SET-02.10 -->
- The delete confirmation fades in and out, and with reduced motion it does not animate. <!-- AC-SET-02.6 -->

## Try it without signing in, the demo (DEM-01, DEM-02)

- The demo page shows its ribbon, talks to no server, and fits every screen size. <!-- AC-DEM-01.1 AC-DEM-01.2 AC-DEM-01.4 -->
- The demo walks through importing a sample mileage sheet, also without any server. <!-- AC-DEM-02.1 AC-DEM-02.2 AC-DEM-02.3 -->

## Home (DSH-01, DSH-02)

- Home shows the latest weight, workouts, giving and odometer, with quick actions, in one column on a phone and a grid on wider screens. <!-- AC-DSH-01.1 AC-DSH-01.2 AC-DSH-01.3 AC-DSH-01.4 -->
- A "This week" card on top shows miles, workouts, weight change and giving, with "No data" where there is nothing, in one column on a phone and two on wider screens. <!-- AC-DSH-02.6 -->

## Car: odometer and mileage (MIL-01, MIL-03, MIL-04)

- Logging a reading: the box is ready to type in, there is no date to fill in, and the reading is still there after a reload. <!-- AC-MIL-01.1 -->
- A reading lower than the last one asks you to confirm first. <!-- AC-MIL-01.2 -->
- A reading can be edited and deleted. <!-- AC-MIL-01.4 -->
- The mileage chart is drawn, has a text version, and fits every screen size. <!-- AC-MIL-03.4 -->
- A mileage spreadsheet can be imported, and importing the same file again adds nothing. <!-- AC-MIL-04.1 AC-MIL-04.4 -->
- A file with the wrong columns is refused with a clear message, and the preview marks rows that differ from the sheet. <!-- AC-MIL-04.3 -->

## Car: maintenance (MIL-05, MIL-06, MIL-07, MIL-08, MIL-09)

- A service can be logged: type, date, place, cost. A new place is offered next time, and a service done at home needs no place. <!-- AC-MIL-05.1 AC-MIL-05.2 AC-MIL-05.3 AC-MIL-05.4 -->
- The odometer starts at the latest reading, and a date in the future is refused. <!-- AC-MIL-05.5 AC-MIL-05.6 AC-MIL-05.9 -->
- A service can be edited and deleted. <!-- AC-MIL-05.8 -->
- The summary shows when each type was last done and the miles since. With no services it says what to do next. <!-- AC-MIL-06.2 AC-MIL-06.3 AC-MIL-06.6 -->
- The history can be narrowed to one type or one place, with the total of what is shown. <!-- AC-MIL-06.1 AC-MIL-06.4 -->
- A place can be renamed, and removed only when no service uses it. <!-- AC-MIL-06.5 -->
- Every view fits phone, tablet and desktop. The form is a sheet from the bottom on a phone and a side panel on a computer. <!-- AC-MIL-06.7 AC-MIL-06.8 AC-MIL-06.9 -->
- "Service due" shows each tracked service with its state in words, fits phone, tablet and desktop, and the interval form can be filled in and saved from the keyboard. <!-- AC-MIL-09.8 -->
- A photo or PDF can be attached to a service and is still there after a reload. Other file types are refused. <!-- AC-MIL-07.2 AC-MIL-07.3 AC-MIL-07.5 -->
- Documents are private: without the owner's sign-in none can be read, added or removed. <!-- AC-MIL-07.2 -->
- Deleting a document or a service removes the stored files. <!-- AC-MIL-07.6 -->
- A large PDF shows its size first and goes through whole. <!-- AC-MIL-07.10 AC-MIL-07.11 -->
- A photo opens full screen, and Download saves it under a made-up name. <!-- AC-MIL-07.12 AC-MIL-07.13 -->
- Several files can be chosen at once, and the list fits a phone. <!-- AC-MIL-07.14 AC-MIL-07.17 AC-MIL-07.18 AC-MIL-07.19 AC-MIL-08.9 -->

## Health (HLT-01, HLT-02, HLT-04, HLT-05)

- Weight: a weight is saved, a second one on the same day asks before replacing, and it can be deleted. The chart has a text version. <!-- AC-HLT-01.1 AC-HLT-01.2 AC-HLT-01.3 -->
- Workouts: a timed workout and a push-up count can be saved, listed, edited and counted. Push-ups ask how many, not how long. <!-- AC-HLT-02.1 AC-HLT-02.3 AC-HLT-02.4 -->
- Health shows the history, weekly and monthly totals and the streak. <!-- AC-HLT-04.1 AC-HLT-04.2 AC-HLT-04.3 -->
- A weekly goal of workouts can be set on Health. A bad number is refused, and the goal is still there after a reload. <!-- AC-HLT-05.6 -->
- The weekly workout chart is drawn for the last 12 weeks, has a table of the same numbers, and fits every screen size. <!-- AC-HLT-05.7 -->

## Giving (GIV-01, GIV-02, GIV-03, GIV-04)

- A regular gift keeps its default description, appears in the totals, and can be edited and deleted. Gifts are listed by month. <!-- AC-GIV-01.1 AC-GIV-02.3 -->
- A special contribution has a description and no month, and is totalled on its own. <!-- AC-GIV-02.1 AC-GIV-02.2 -->
- Giving shows the year's totals and marks a month with no gift. <!-- AC-GIV-03.2 AC-GIV-03.3 -->
- The giving chart and its table fit every screen size. <!-- AC-GIV-04.6 -->

## Groceries (GRO-01, GRO-02)

- Items are added and sorted into store sections, ticked off, moved, and kept after a reload. Finish trip clears the list. <!-- AC-GRO-01.1 AC-GRO-01.2 AC-GRO-01.3 AC-GRO-01.5 -->
- The grocery list fits every screen size, and every tap target is big enough. <!-- AC-GRO-01.7 -->
- With no signal the list opens from the saved copy, changes show at once, and they reach the server when the signal returns. <!-- AC-GRO-02.1 AC-GRO-02.2 AC-GRO-02.3 AC-GRO-02.7 -->
