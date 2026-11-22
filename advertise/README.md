# Tour Holden Beach: advertising sales site

Live (unlisted, noindex): https://tourholdenbeach-creator.github.io/hb-map-8d5cf59c/advertise/

| Page | What it is |
|---|---|
| `advertise/` | Pitch, what you get, map preview, prices with Buy buttons, how it works, Host Partner + $99 drone interest form, FAQ, terms, contact |
| `advertise/preview/?id=<business id>` | "See your sample ad" page. Builds sample print and online ads in the browser from `data/businesses.geojson`. Linked from each unpaid pin popup next to Claim your listing. Insider Realty Partner is shown only for realty and vacation-rental companies. Print ads include a sample tracked QR (short.io) that goes to the business website, or to `/?biz=<id>` on the map when no verified website is on file. |
| `advertise/claim/?biz=Name` | "Claim your listing" page. Shows the business name and preselects the name listing. `&plan=standard` preselects the standard ad. Also accepts the map's `?business=…&pin=…&id=…` |
| `advertise/checkout/?product=…&plan=…` | "Checkout coming soon" page, used while a product has no Stripe link. Builds a reservation email |
| `advertise/thanks/` | Page to send buyers to after Stripe payment: asks for logo, artwork and details by email |

## For the admin: prices and inventory

Everything is in **`data/products.json`**. Edit it on GitHub (open the file, click the pencil, Commit changes). The site updates within a few minutes.

- `prepaid_price`, `season_price`, `deposit`: print-ad prices in dollars. Set `deposit` to `null` to offer pay-in-full only. For an online listing, set `annual_price` and `monthly_price` and leave `season_price`/`prepaid_price` null.
- `total`: how many are for sale. `sold`: how many are sold. The page shows "X of Y available" and switches to "Sold out: join the waitlist" when `sold` reaches `total`.
- `includes`, `summary`, `inventory_note`: the text on each price card.
- `dates`: the deadlines shown under "How it works".
- `contact_email`: where all the email buttons go.

**After each sale:** add 1 to that product's `sold`. If Stripe link limits are on (below), also check the other link for the same product (prepaid and deposit share the same spaces).

## Premium Featured Listing (online)

The `featured` product in `products.json` is priced at `$299` a year (`annual_price`) or `$29` a month (`monthly_price`). Leave `season_price` and `prepaid_price` null so the sales card shows the year/month prices instead of prepaid/season rates. Create Stripe Payment Links and paste them into `featured.annual` and `featured.monthly`. `total` is `null` (no inventory limit). For a print + featured bundle, either create a Stripe link with both items or sell the two separately.

## Connecting Stripe (one time, about 30 minutes)

The Buy buttons read **`data/payment-links.json`**. Any value that doesn't start with `https://` sends the buyer to the "checkout coming soon" page. Once you paste a real Stripe Payment Link, that button goes straight to Stripe.

1. Sign up or sign in at https://dashboard.stripe.com and finish account activation (business details and bank account for payouts). Stripe charges a fee per card payment.
2. **Products** (Product catalog > Add product). Create one product per row, with a one-time price in USD, except Premium Featured monthly, which is a recurring monthly price:

   | Key in payment-links.json | Product name | Price |
   |---|---|---|
   | `standard.prepaid` | Standard space, front, paid in full (2027) | $640 |
   | `standard.deposit` | Standard space, front, 50% deposit (2027, season rate $690) | $345 |
   | `standard-back.prepaid` | Standard space, back, paid in full (2027) | $535 |
   | `standard-back.deposit` | Standard space, back, 50% deposit (2027, season rate $574) | $287 |
   | `double.prepaid` | Double space, paid in full (2027) | $910 |
   | `double.deposit` | Double space, 50% deposit (2027, season rate $980) | $490 |
   | `premium.prepaid` | Premium corner, paid in full (2027) | $1,595 |
   | `premium.deposit` | Premium corner, 50% deposit (2027, season rate $1,750) | $875 |
   | `half.prepaid` | Half space, paid in full (2027) | $365 |
   | `half.deposit` | Half space, 50% deposit (2027, season rate $395) | $197.50 |
   | `featured.annual` | Premium Featured Listing, annual (online) | $299 a year |
   | `featured.monthly` | Premium Featured Listing, monthly (online) | $29 a month (recurring) |
   | `name.prepaid` | Name listing, paid in full (2027) | $70 |
   | `realty.prepaid` | Insider Realty Partner, paid in full (2027) | $2,325 |
   | `realty.deposit` | Insider Realty Partner, 50% deposit (2027, season rate $2,500) | $1,250 |

   Deposit balances are invoiced later (Stripe Invoices) within 30 days or before press.
3. **Payment Links** (Payment Links > New). For each price above:
   - Quantity: fixed at 1 (don't let customers adjust quantity).
   - **Collect business details:** turn on "Collect customers' phone numbers" and add custom fields: `Business name` (text, required), `Website` (text, optional). Stripe allows up to 3 custom fields. Email is always collected.
   - **Limit the number of payments:** set it to the spaces left for that product (12 standard front, 20 standard back, 8 double, 4 premium corner, 6 half, 30 name, 4 realty, minus any sold). Premium Featured has no inventory limit. Stripe has no shared inventory, so the prepaid and deposit links each get their own limit; keep `sold` in `products.json` current and lower the limits as spaces sell.
   - Optional: "Require customers to accept your terms of service" pointing to `…/advertise/#terms`.
   - **After payment:** choose "Don't show confirmation page, redirect customers to your website" and enter `https://tourholdenbeach-creator.github.io/hb-map-8d5cf59c/advertise/thanks/`.
   - Taxes: prices don't include tax. If tax applies, turn on Stripe Tax or add it to the price.
4. **Logo and artwork upload:** Stripe can't take file uploads. The thanks page asks buyers to email their logo, ad, photo and deal to tourholdenbeach@gmail.com. (A HubSpot form can replace that email later: change the thanks page button link.)
5. Copy each link (`https://buy.stripe.com/…`) into `data/payment-links.json` in place of `PASTE_STRIPE_PAYMENT_LINK`, commit, and wait a few minutes.
6. Test one link in Stripe test mode first, or buy a name listing and refund it.

When a buyer comes from the "Claim your listing" page, the site adds `?client_reference_id=Business-Name` to the Stripe link, so the payment shows which business it's for.

## Changing the map's claim button

The online map's "Claim your listing" buttons use `claimUrl` in `/js/config.js` (currently `advertise/claim/`). The map adds `?business=…&pin=…&id=…`.

## Sample tracked QR codes

Each unpaid listing's preview shows a sample QR in every print ad format. The codes are generated from short.io links on the current short domain (today `4x3RGF.s.gy`; later a branded domain such as `go.holdenbeachinsider.com`). Scans are counted in short.io. Mapping: `data/shortlinks.json`. Images: `assets/qr/<business-id>.png` (and `.svg`). Rebuild with `create_shortlinks.py` (alongside the other ad generators). It is safe to rerun and can target a new domain.
