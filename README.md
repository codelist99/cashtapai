# CashTap AI funnel

Independent CashTap AI funnel mirror with NMI checkout and one-click customer-vault upgrades.

## Flow

`/fe-e` → `/checkout` → `/oto1-e` → `/oto2-e` → `/oto3-e` → `/oto4-e` → `/oto5-e` → `/oto6-e` → `/oto7-e` → `/thankyou-e`

The original full-price and delayed coupon buttons are retained on every OTO. Explodely payment links are intercepted locally and processed against the corresponding NMI product amount. Decline links advance without charging.

## Environment

- `NMI_ENV` (`production` or `sandbox`)
- `NMI_PUBLIC_KEY`
- `NMI_PRIVATE_KEY`
- `SESSION_SECRET`

Do not configure duplicate-check override request fields. This processor rejects those fields. If the merchant account applies a duplicate threshold, it must be adjusted in the NMI merchant portal.

## Local development

```bash
npm start
```

Re-run `npm run mirror` only when intentionally refreshing the source page snapshots.
