# Claim Prep

Photograph or upload a receipt; the app reads it on the phone, codes it with **your own** accounts and projects, and gets it into an email to Oracle's receipt address. A web app (PWA): it installs from the browser on Android, iPhone or a computer, and works offline.

**Open it:** https://maj8.github.io/claim-prep/

## For each person
1. Open the link on your phone. Android (Chrome): ⋮ → **Install app** / **Add to Home screen**. iPhone (Safari): Share → **Add to Home Screen**.
2. Setup asks for your name, university email and the **last four digits** of your university card (the full number is never needed).
3. Add the accounts (cost centre, analysis code, SOF) and projects (number, task, expenditure organisation, approver) you charge to, or load a list your administrator sends you.
4. Add a **Trip** when you travel: receipts dated during it go on the trip's account with its business reason.
5. Take a photo (or add PDFs / Word files, several at once; on Android you can also *Share → Claim Prep* from email or Files). Check, then **Send to Oracle**: Oracle's address is copied, the share sheet opens with the receipt and the coding, you pick Outlook and paste the address into *To*.

What's automatic: supplier, date, total, currency, VAT, sterling estimate, what it was for (with Oracle's expense type, itemisation and detail code), who paid (card or cash), which meal (from the time printed), the trip, the account, the description. After you send a receipt, that supplier's coding is remembered.

Each receipt also shows **For Oracle**: every field in the order Oracle asks for it, including the full account string (e.g. `10-10019-431303-MJAMESYY-NDRI-9999999`), tap to copy. **Download coding sheet** gives a CSV in the layout administrators use.

## Privacy
Receipts, text and codes are stored only in the browser on the person's own device (IndexedDB). No server, no accounts. Outside requests: the exchange-rate lookup (currency + date, frankfurter.dev) and the email the person chooses to send.

## Codes list for a department
Setup → Accounts and projects → **Blank template** gives a CSV:
`kind,name,cost_centre,analysis,sof,project_number,task,expenditure_org,approver`. Fill it in Excel, save as CSV, send it round; people load it with **Load a list**. Setup → Backup → **Save a copy to share** shares codes, expense types and supplier rules without name or card.

Expense types and detail codes default to the University of St Andrews codes (from 2026 claims) and can be edited in Setup → What things are for.

## Hosting
Every push to `main` is tested, built and published to GitHub Pages. The build uses relative paths, so the same files work in any folder of any web server: `dist/` (or `claim-prep-web.zip` from the published site, https://maj8.github.io/claim-prep/claim-prep-web.zip) can be unzipped into e.g. `public_html/claim-prep/` on merra.org. The included `.htaccess` sets the file types Apache needs. HTTPS is required.

## Development
`npm install`, `npm test` (parser and coding rules), `npm run build`, `node e2e/run.mjs <url>` (phone-sized browser test). Stack: Vite, Preact, TypeScript, Tesseract.js (text recognition, files served with the app), pdf.js, JSZip, idb-keyval, Workbox.
