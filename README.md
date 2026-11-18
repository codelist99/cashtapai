# CashTap AI funnel

Independent CashTap AI funnel mirror with Authorize.Net checkout and one-click customer-profile upgrades. Historical NMI refunds and MX Merchant chargebacks remain synchronized for transactions processed before the gateway migration.

## Flow

`/fe-e` → `/checkout` → `/oto1-e` → `/oto2-e` → `/oto3-e` → `/oto4-e` → `/oto5-e` → `/oto6-e` → `/oto7-e` → `/thankyou-e`

The original full-price and delayed coupon buttons are retained on every OTO. Explodely payment links are intercepted locally and processed against the corresponding Authorize.Net product amount. Decline links advance without charging.

## Environment

- `AUTHORIZE_NET_ENV` (`production` or `sandbox`)
- `AUTHORIZE_NET_API_LOGIN_ID`
- `AUTHORIZE_NET_TRANSACTION_KEY`
- `AUTHORIZE_NET_PUBLIC_CLIENT_KEY`
- `FD_CLIENT_ID` (Fraud Deflect client `10814`)
- The legacy `NMI_*` variables must remain configured for historical refund reconciliation.
- `SESSION_SECRET`

New orders are tagged `authorize_net`; pre-migration orders retain `nmi`. Admin refunds are routed back through the gateway that processed the original order.

## Local development

```bash
npm start
```

Re-run `npm run mirror` only when intentionally refreshing the source page snapshots.
