# Hand check: the maths, recomputed to the paisa

This file is produced by `node scripts/handcheck.mjs` and checked by `tests/handcheck.test.mjs` every time the tests run.
It plays the real 24-quarter script with eight bot funds, then takes one fund (“Reads the economy”) and recomputes three quarters **by hand**:
the profit and loss on every position, the cash interest, the Risk Used at the bell, and finally the SPECULA Score — using only the prices, the positions and the rules written in the guide and in MODEL_EXPLAINED.md, not the engine’s accounting code.

**Result: every figure matches the site exactly, to the paisa.**

## Quarter 3: a calm quarter

Fund value: ₹10,35,34,41,848.77 at the start → ₹10,43,85,26,646.72 on the site; by hand ₹10,43,85,26,646.72. ✔ match

| Position | Price | Currency | Carry | Cost | Crowd | Forced | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| AUR 10Y | ₹2,51,99,773.86 | −₹1,56,32,745.81 | −₹1,93,49,826.99 | −₹3,81,000.00 | −₹1,52,400.00 | ₹0.00 | −₹1,03,16,198.94 |
| AUR 2Y | ₹1,07,99,805.14 | −₹1,57,85,248.38 | −₹1,91,99,662.70 | −₹3,64,950.00 | −₹72,990.00 | ₹0.00 | −₹2,46,23,045.94 |
| AUR Shares | ₹91,00,437.55 | ₹1,06,96,983.22 | ₹0.00 | −₹17,68,650.00 | ₹2,35,820.00 | ₹0.00 | ₹1,82,64,590.77 |
| AUR Rate Fut | ₹1,50,00,000.00 | ₹0.00 | ₹0.00 | −₹14,45,700.00 | −₹96,380.00 | ₹0.00 | ₹1,34,57,920.00 |
| AUR IL 10Y | ₹39,00,049.34 | ₹1,59,41,553.16 | ₹33,00,042.95 | −₹3,61,500.00 | −₹96,400.00 | ₹0.00 | ₹2,26,83,745.45 |
| CAL 2Y | ₹0.00 | ₹0.00 | ₹0.00 | −₹18,81,449.09 | ₹1,25,429.94 | ₹0.00 | −₹17,56,019.15 |
| CAL Shares | ₹75,99,978.47 | ₹1,06,80,476.60 | ₹0.00 | −₹10,88,250.00 | −₹1,45,100.00 | ₹0.00 | ₹1,70,47,105.07 |
| CAL Rate Fut | ₹0.00 | ₹0.00 | ₹0.00 | −₹75,54,300.00 | −₹80,57,920.00 | ₹0.00 | −₹1,56,12,220.00 |
| KES 2Y | ₹0.00 | ₹0.00 | ₹0.00 | −₹18,96,702.26 | −₹21,49,595.89 | ₹0.00 | −₹40,46,298.15 |
| KES Shares | ₹0.00 | ₹0.00 | ₹0.00 | −₹19,76,566.16 | ₹6,58,855.39 | ₹0.00 | −₹13,17,710.77 |
| KES Rate Fut | ₹0.00 | ₹0.00 | ₹0.00 | −₹75,54,300.00 | −₹95,68,780.00 | ₹0.00 | −₹1,71,23,080.00 |
| VER Shares | −₹27,00,004.29 | −₹1,33,35,537.60 | ₹0.00 | −₹15,00,000.00 | −₹4,00,000.00 | ₹0.00 | −₹1,79,35,541.89 |
| Wheat | ₹76,00,000.12 | ₹0.00 | ₹0.00 | −₹15,00,000.00 | −₹21,00,000.00 | ₹0.00 | ₹40,00,000.12 |

- Cash interest: (fund value ₹10,32,41,68,481.26 − long positions ₹3,50,00,65,055.79) × 1.50% = +₹10,23,61,551.38

The largest position, written out in full:

**Aurelia 2-Year Bond**
- Price change (Settlement): −₹1,49,99,73,648.82 × (97.338571 − 98.044491) ÷ 98.044491 = +₹1,07,99,805.14 (site: +₹1,07,99,805.14)
- Currency effect (Settlement): −₹1,48,91,73,843.68 × (86.39378 − 85.487611) ÷ 85.487611 = −₹1,57,85,248.38 (site: −₹1,57,85,248.38)
- Carry: −₹1,49,99,73,648.82 × 1.28% = −₹1,91,99,662.70 (site: −₹1,91,99,662.70)
- Trading cost: ₹24,33,00,000.00 × 0.15% = −₹3,64,950.00 (site: −₹3,64,950.00)
- Crowd impact: −(−₹24,33,00,000.00) × −0.03% = −₹72,990.00 (site: −₹72,990.00)
- **Total: −₹2,46,23,045.94**

**Risk Used at the bell, by hand:** family risks ₹12,66,91,761.77, ₹8,86,13,247.14, ₹11,30,00,000.00; combined √(sum of squares) = ₹19,14,99,634.64; × crisis multiplier 1.15 = ₹22,02,24,579.84; limit 15% × ₹10,32,41,68,481.26 = ₹1,54,86,25,272.19; Risk Used = **14.22%**. ✔ matches the site

## Quarter 14: the Run on the Dinar (two crisis stages, the peg breaks)

Fund value: ₹10,25,45,65,024.79 at the start → ₹12,57,79,77,041.85 on the site; by hand ₹12,57,79,77,041.85. ✔ match

| Position | Price | Currency | Carry | Cost | Crowd | Forced | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| AUR Shares | −₹1,18,51,471.46 | ₹1,77,38,990.46 | ₹0.00 | −₹7,69,950.00 | −₹52,480.00 | ₹0.00 | ₹50,65,089.00 |
| CAL Shares | −₹1,31,00,182.28 | ₹1,76,48,632.23 | ₹0.00 | −₹7,64,600.00 | ₹1,56,330.00 | ₹0.00 | ₹39,40,179.95 |
| KES 2Y | ₹20,51,95,424.99 | ₹37,33,91,761.20 | −₹7,18,50,265.89 | −₹39,86,100.00 | −₹8,26,320.00 | ₹0.00 | ₹50,19,24,500.30 |
| KES Shares | ₹55,69,52,065.04 | ₹41,75,33,096.85 | ₹0.00 | −₹85,39,126.53 | −₹45,32,107.96 | ₹0.00 | ₹96,14,13,927.40 |
| SAR Shares | −₹9,80,99,440.96 | −₹5,07,61,778.22 | ₹0.00 | −₹1,03,53,400.00 | −₹1,05,78,010.00 | ₹0.00 | −₹16,97,92,629.18 |
| Wheat | ₹1,84,00,000.10 | ₹0.00 | ₹0.00 | −₹32,42,200.00 | −₹1,03,75,040.00 | ₹0.00 | ₹47,82,760.10 |
| KES Rate Fut | ₹22,50,00,000.00 | ₹0.00 | ₹0.00 | ₹0.00 | ₹0.00 | ₹0.00 | ₹22,50,00,000.00 |
| Dinar | ₹66,37,93,150.73 | ₹0.00 | ₹0.00 | −₹80,66,819.41 | −₹5,37,787.96 | ₹0.00 | ₹65,51,88,543.36 |
| Gold | −₹21,00,000.01 | ₹0.00 | ₹0.00 | −₹22,50,000.00 | −₹25,50,000.00 | ₹0.00 | −₹69,00,000.01 |

- Cash interest: (fund value ₹12,51,92,63,444.61 − long positions ₹2,99,99,53,702.03) × 1.50% = +₹14,27,89,646.14

The largest position, written out in full:

**Kesh Shares**
- Price change (Queues at the banks): −₹1,50,00,22,916.06 × (97.683058 − 123.150602) ÷ 123.150602 = +₹31,02,04,733.03 (site: +₹31,02,04,733.03)
- Price change (The peg breaks): −₹1,49,99,83,785.03 × (81.614195 − 97.683058) ÷ 97.683058 = +₹24,67,47,332.01 (site: +₹24,67,47,332.01)
- Currency effect (Queues at the banks): −₹1,18,98,18,183.03 × (1.81277 − 1.772014) ÷ 1.772014 = −₹2,73,65,602.00 (site: −₹2,73,65,602.00)
- Currency effect (The peg breaks): −₹1,25,32,36,453.02 × (1.169237 − 1.81277) ÷ 1.81277 = +₹44,48,98,698.85 (site: +₹44,48,98,698.85)
- Trading cost: ₹1,99,23,00,000.00 × 0.1% = −₹19,92,300.00 (site: −₹19,92,300.00)
- Trading cost: ₹28,28,00,000.00 × 0.6% = −₹16,96,800.00 (site: −₹16,96,800.00)
- Trading cost: ₹80,83,37,754.17 × 0.6% = −₹48,50,026.53 (site: −₹48,50,026.53)
- Crowd impact: −(₹2,51,78,37,754.17) × 0.18% = −₹45,32,107.96 (site: −₹45,32,107.96)
- **Total: +₹96,14,13,927.40**

**Risk Used at the bell, by hand:** family risks ₹15,78,81,986.67, ₹59,79,77,445.87, ₹34,13,99,999.93, ₹12,18,00,000.00; combined √(sum of squares) = ₹71,68,63,269.69; × crisis multiplier 1.6 = ₹1,14,69,81,231.50; limit 15% × ₹12,51,92,63,444.61 = ₹1,87,78,89,516.69; Risk Used = **61.08%**. ✔ matches the site

## Quarter 21: the Verana Bond Auction

Fund value: ₹16,24,38,23,907.52 at the start → ₹16,53,59,87,745.34 on the site; by hand ₹16,53,59,87,745.34. ✔ match

| Position | Price | Currency | Carry | Cost | Crowd | Forced | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| AUR Shares | ₹7,52,99,982.48 | ₹6,27,36,111.87 | ₹0.00 | −₹17,42,100.00 | −₹20,90,520.00 | ₹0.00 | ₹13,42,03,474.35 |
| AUR HY | ₹3,88,49,236.04 | −₹2,98,06,874.20 | −₹4,67,99,080.41 | −₹64,200.00 | ₹0.00 | ₹0.00 | −₹3,78,20,918.57 |
| CAL Shares | ₹2,89,00,666.78 | ₹54,79,053.89 | ₹0.00 | −₹4,89,300.00 | ₹0.00 | ₹0.00 | ₹3,38,90,420.67 |
| Gold | ₹0.00 | ₹0.00 | ₹0.00 | −₹14,35,008.39 | −₹5,74,003.36 | ₹0.00 | −₹20,09,011.75 |
| VER 10Y | ₹5,59,99,235.74 | −₹1,32,18,880.08 | −₹2,15,99,703.70 | −₹1,02,200.00 | −₹1,12,420.00 | ₹0.00 | ₹2,09,66,031.96 |
| VER Shares | ₹0.00 | ₹0.00 | ₹0.00 | −₹24,52,952.42 | ₹14,71,771.45 | ₹0.00 | −₹9,81,180.97 |
| AUR Banks | −₹58,14,313.48 | −₹4,10,19,233.39 | ₹0.00 | ₹0.00 | ₹0.00 | ₹0.00 | −₹4,68,33,546.87 |

- Cash interest: (fund value ₹16,23,75,38,146.71 − long positions ₹4,00,00,22,542.10) × 1.50% = +₹18,35,62,734.07
- Auction: +₹71,85,834.93

The largest position, written out in full:

**Aurelia Shares**
- Price change (Settlement): ₹2,99,99,99,631.41 × (106.958292 − 104.339374) ÷ 104.339374 = +₹7,52,99,982.48 (site: +₹7,52,99,982.48)
- Currency effect (Settlement): ₹3,07,52,99,613.89 × (85.641322 − 83.929167) ÷ 83.929167 = +₹6,27,36,111.87 (site: +₹6,27,36,111.87)
- Trading cost: ₹1,74,21,00,000.00 × 0.1% = −₹17,42,100.00 (site: −₹17,42,100.00)
- Crowd impact: −(₹1,74,21,00,000.00) × 0.12% = −₹20,90,520.00 (site: −₹20,90,520.00)
- **Total: +₹13,42,03,474.35**

**Risk Used at the bell, by hand:** family risks ₹57,32,44,493.35, ₹33,87,95,352.47; combined √(sum of squares) = ₹66,58,76,520.09; × crisis multiplier 1 = ₹66,58,76,520.09; limit 15% × ₹16,23,75,38,146.71 = ₹2,43,56,30,722.01; Risk Used = **27.34%**. ✔ matches the site

## The final SPECULA Score of “Reads the economy”

- Total return 86.7%; cash alone 42.95%; earned by decisions 43.75%
- Swing 5.14% (standard deviation of the 24 quarterly returns); deepest fall 5.01%
- Risk-adjusted return = 43.75 ÷ 5.14 − 0.10 × 5.01 = 8.01 (site 8.01)
- Risk-adjusted points = 60 × 8.01 ÷ best 8.4 = 57.2 (site 57.2)
- Forecast points = 25 × 165.7 ÷ 240 = 17.3 (site 17.3)
- Risk discipline = 15 − 5 × 0 = 15 (site 15)
- **SPECULA Score = 57.2 + 17.3 + 15 = 89.5 (site 89.5) ✔**
