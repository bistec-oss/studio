# OP-031 evidence (FR-46, AC-41): why `spotlight` SQUARE fell back on `busy` in OP-028

Produced with no model or image call, by sampling the two saved OP-028 SQUARE renders with the
production sampler against `spotlight@1:SQUARE`:

```
npx tsx scripts/look-check/recheck.ts --regions .specclaw/changes/028-image-looks/look-check/renders/spotlight_SQUARE_<n>.png spotlight@1:SQUARE \
  --strip 4,16 --strip 20,4 --strip 76,4 --strip 80,4 --strip 84,4 --strip 88,4 --strip 92,4 --strip 96,4 --strip 80,20 --strip 22,4 --strip 24,4 --strip 28,4
```

Std dev is of CIE L*/100 (the same measure the check uses). `BUSY_STDDEV_MAX` is 0.12, and the rule
fails a region above it. "contrastFraction" is the share of samples that reach 4.5:1 against white
text (the rule needs 0.95).

## spotlight_SQUARE_1.png (OP-028 attempt 1)

file .specclaw/changes/028-image-looks/look-check/renders/spotlight_SQUARE_1.png contract spotlight@1:SQUARE BUSY_STDDEV_MAX 0.12 CONTRAST_MIN 4.5
region | rect (x,y,w,h %) | stddev | busy? | contrastFraction
text (the headline) | 0,0,100,24 | 0.0930 | ok | 0.979
strip inside the band at its inner edge (20% to 24%) | 0,20,100,4 | 0.0786 | ok | 0.977
strip outside the band (24% to 28%) | 0,24,100,4 | 0.2295 | BUSY | 0.913
text (the call to action and the logo) | 0,76,100,24 | 0.2086 | BUSY | 0.721
strip inside the band at its inner edge (76% to 80%) | 0,76,100,4 | 0.1914 | BUSY | 0.838
strip outside the band (72% to 76%) | 0,72,100,4 | 0.2128 | BUSY | 0.907
strip y 4% h 16% | 0,4,100,16 | 0.0966 | ok | 0.981
strip y 20% h 4% | 0,20,100,4 | 0.0786 | ok | 0.977
strip y 76% h 4% | 0,76,100,4 | 0.1914 | BUSY | 0.838
strip y 80% h 4% | 0,80,100,4 | 0.1617 | BUSY | 0.878
strip y 84% h 4% | 0,84,100,4 | 0.1953 | BUSY | 0.624
strip y 88% h 4% | 0,88,100,4 | 0.2608 | BUSY | 0.389
strip y 92% h 4% | 0,92,100,4 | 0.2141 | BUSY | 0.619
strip y 96% h 4% | 0,96,100,4 | 0.1287 | BUSY | 0.891
strip y 80% h 20% | 0,80,100,20 | 0.2128 | BUSY | 0.673
strip y 22% h 4% | 0,22,100,4 | 0.0700 | ok | 0.993
strip y 24% h 4% | 0,24,100,4 | 0.2295 | BUSY | 0.913
strip y 28% h 4% | 0,28,100,4 | 0.3474 | BUSY | 0.755

## spotlight_SQUARE_2.png (OP-028 attempt 2)

file .specclaw/changes/028-image-looks/look-check/renders/spotlight_SQUARE_2.png contract spotlight@1:SQUARE BUSY_STDDEV_MAX 0.12 CONTRAST_MIN 4.5
region | rect (x,y,w,h %) | stddev | busy? | contrastFraction
text (the headline) | 0,0,100,24 | 0.0950 | ok | 0.979
strip inside the band at its inner edge (20% to 24%) | 0,20,100,4 | 0.0609 | ok | 0.993
strip outside the band (24% to 28%) | 0,24,100,4 | 0.2713 | BUSY | 0.859
text (the call to action and the logo) | 0,76,100,24 | 0.2414 | BUSY | 0.752
strip inside the band at its inner edge (76% to 80%) | 0,76,100,4 | 0.2851 | BUSY | 0.448
strip outside the band (72% to 76%) | 0,72,100,4 | 0.3143 | BUSY | 0.669
strip y 4% h 16% | 0,4,100,16 | 0.1015 | ok | 0.979
strip y 20% h 4% | 0,20,100,4 | 0.0609 | ok | 0.993
strip y 76% h 4% | 0,76,100,4 | 0.2851 | BUSY | 0.448
strip y 80% h 4% | 0,80,100,4 | 0.2990 | BUSY | 0.401
strip y 84% h 4% | 0,84,100,4 | 0.1993 | BUSY | 0.729
strip y 88% h 4% | 0,88,100,4 | 0.0400 | ok | 1.000
strip y 92% h 4% | 0,92,100,4 | 0.1836 | BUSY | 0.929
strip y 96% h 4% | 0,96,100,4 | 0.0263 | ok | 1.000
strip y 80% h 20% | 0,80,100,20 | 0.2228 | BUSY | 0.797
strip y 22% h 4% | 0,22,100,4 | 0.1261 | BUSY | 0.976
strip y 24% h 4% | 0,24,100,4 | 0.2713 | BUSY | 0.859
strip y 28% h 4% | 0,28,100,4 | 0.3474 | BUSY | 0.704

## Reading

- **The bottom band (the call to action and the logo, y 76 to 100%) is the busy region, in both
  renders:** std dev 0.209 (attempt 1) and 0.241 (attempt 2), about 1.7 and 2.0 times the 0.12 limit.
  Its contrast fraction is also short (0.72 and 0.75; 0.95 needed).
- **It is busy at its inner edge:** the strip 76 to 80% is 0.191 and 0.285, and the strip just
  outside the band (72 to 76%) is 0.213 and 0.314. So the subject and its light reach well into the
  band.
- **It is busy right down the band, not only at the edge:** in attempt 1 every 4% strip from 76 to 100%
  is above 0.12 (the calmest, 96 to 100%, is 0.129); in attempt 2 only 88 to 92% and 96 to 100% are calm
  (0.040 and 0.026) with detail in between (0.18 to 0.30). The model drew a floor, reflection or
  base across the bottom, not a plain backdrop.
- **The top band (the headline, y 0 to 24%) passes in both renders** (0.093 and 0.095, so under the
  limit but close), and is calmest at the edge it shares with the subject for attempt 1 (20 to 24%:
  0.079), but not for attempt 2, where 22 to 24% already reads 0.126 (busy) and the strip outside it
  (24 to 28%) is 0.23 to 0.27. So the subject also reaches up to about 22% on the top side.
- The fail reason the runner saw (`busy`) is therefore the bottom band, with the top band marginal.

## What this means for the v2 SQUARE contract

- Both bands are busy or close to busy at their inner edge (bottom 0.19 to 0.29 at 76 to 80%; top
  0.126 at 22 to 24% in attempt 2), so the spec's default geometry applies: pull both bands back
  from the subject (top 24% to 20%, bottom 24% to 20%, so the band edges sit at 20% and 80%), and
  say in the subject text that the top 22% and bottom 22% are a flat, plain, dark backdrop.
- The numbers also say a geometry change cannot fix the bottom alone: the bottom band is busy
  even at 80 to 100% (0.213 and 0.223 for the whole 80 to 100% strip). What can change it is the
  wording the image model is given, which v1 left loose ("stays dark at the top and bottom").
  v2 states the bottom and top 22% as flat, plain, dark with no texture or detail. Whether that is
  enough is what OP-031 tests, within its cap of 4 calls.
