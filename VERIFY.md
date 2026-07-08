# Cross-machine reproducibility check

Run `npm run mc:verify` (after `npm install -D puppeteer` and `npm run build`).
It runs baseline × 10 fixed seeds and prints a canonical SHA-256 of the
trials CSV plus three aggregates.

## Reference values, build 2.7.213
Generated on the development container, HeadlessChrome/149.0.7827.0:

```
trials sha256 : 4807f5e686ed27a0261d33c935c44ee9b2c5a128a1c6c8893306eac004e160d8
aggregates    : score1_sum=10783.7  ice_sum=4914.7  vio_sum=689.00
```

## How to read a comparison
- **Hash matches** → bitwise reproducibility across machines: every number
  in every CSV is identical. Strongest possible claim.
- **Hash differs, aggregates match to <0.1%** → the JS engines differ in
  floating-point library details (Math.hypot etc. can vary across V8
  versions). The model is reproducing; the last bits are not. Report both
  engine strings alongside results.
- **Aggregates differ materially** → different build or a real problem;
  check `npm pkg get version` first.
