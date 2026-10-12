// ============================================================================
//  SPECULA — THE SECRET SCRIPT
//  This file is server-only. It is never copied into the website (scripts/build.mjs
//  refuses to build if any of its secret text appears in the published files).
//  Players see each quarter's headlines and forecast question when the quarter
//  opens, and each crisis only when the Event Head releases it.
// ============================================================================

const P = (handle, name, text, verified = false) => ({ handle, name, text, verified });

export const SCRIPT = {
  id: 'specula-live-v1',
  quarters: [
    // ======================= ROUND 01 · MARKETS IN NORMAL TIMES =======================
    {
      q: 1,
      headlines: [
        'Aurelian inflation sits just above its 4% target at 4.2%.',
        'Calder’s factories are running flat out; exports are at a record.',
        'Kesh’s finance minister: “the peg at 50 is the bedrock of our success.”',
        'Sarvan’s farmers expect a normal harvest.',
      ],
      forecast: { econ: 'AUR', v: 'i' },
      data: {},
      news: { oil: { v: 1, why: 'steady demand' } },
    },
    {
      q: 2,
      headlines: [
        'Aurelian shoppers splash out: retail sales jump.',
        'Wage deals in Aurelia come in well above inflation.',
        'Kesh’s tech parks hiring at the fastest pace in years.',
      ],
      forecast: { econ: 'KES', v: 'pi' },
      data: { AUR: { pi: 0.3, g: 0.3 }, CAL: { g: 0.2 }, KES: { g: 0.3 } },
      news: { eq: { AUR: { v: 1, why: 'strong company profits' } } },
      crises: [{
        id: 'hoax', title: 'The Governor Hoax',
        stages: [
          {
            id: 'hoax-1', title: 'The Governor resigns?',
            headline: 'BREAKING: the Governor of the Central Bank of Aurelia has resigned, say reports.',
            posts: [
              P('@AureliaWire', 'Aurelia Wire', 'BREAKING: Governor of the Central Bank of Aurelia resigns with immediate effect — sources.'),
              P('@MarketPulse', 'Market Pulse', 'Crown sliding. Traders pricing in a softer successor who will not raise rates.'),
              P('@trader_riya', 'Riya | Rates', 'If the hawk is gone, the hikes are off. Buying Aurelian 10-years.'),
            ],
            rules: [{ econ: 'AUR', add: -0.5 }],
            state: { tp10: { AUR: 0.10 }, fear: 4 },
            jumps: { fx: { AUR: -1.5 }, eq: { AUR: -2.0 }, gold: 1.5 },
            M: 1.15, spreadMult: { all: 1.5 },
          },
          {
            id: 'hoax-2', title: 'It was fake',
            headline: 'The Central Bank of Aurelia: “The Governor has not resigned. That account is not ours.”',
            posts: [
              P('@CentralBankAUR', 'Central Bank of Aurelia', 'The Governor has not resigned and is at her desk. The account that posted this claim is not ours.', true),
              P('@AureliaWire', 'Aurelia Wire', 'CORRECTION: our earlier report on the Governor has been withdrawn. We apologise.'),
              P('@MarketPulse', 'Market Pulse', 'Everything snapping back. Anyone who sold in a panic just paid the spread twice.'),
            ],
            rules: [{ econ: 'AUR', add: 0 }],
            state: { tp10: { AUR: -0.10 }, fear: -3 },
            jumps: { fx: { AUR: 1.5 }, eq: { AUR: 2.0 }, gold: -1.3 },
          },
        ],
      }],
    },
    {
      q: 3,
      headlines: [
        'Aurelian unemployment falls again; firms say workers are hard to find.',
        'Verana’s economy stalls as older shoppers cut back.',
        'Sarvan’s harvest looks like the best in years.',
        'Norvik and its oil partners meet next week to discuss output.',
      ],
      forecast: { econ: 'CAL', v: 'g' },
      data: { AUR: { pi: 0.3, u: -0.2 }, CAL: { pi: 0.2 }, VER: { g: -0.2 }, SAR: { harvest: 5 } },
      news: { oil: { v: 4, why: 'Norvik and its partners agree to pump a little less' } },
    },
    {
      q: 4,
      headlines: [
        'Aurelian inflation is still climbing.',
        'Norvik nudges oil output up.',
        'Kesh’s reserves slip a little as importers buy crowns.',
      ],
      forecast: { econ: 'NOR', v: 'u' },
      data: { AUR: { pi: 0.2, g: 0.2 }, NOR: { oilOutput: 0.1 }, KES: { reserves: -3 } },
      news: {},
      crises: [{
        id: 'crash', title: 'The Four-Minute Crash',
        stages: [{
          id: 'crash-1', title: 'Shares plunge in minutes',
          headline: 'Aurelian shares plunge 8% in four minutes. No news has been found.',
          posts: [
            P('@ExchangeAUR', 'Aurelian Exchange', 'Trading continues. We are investigating an unusually large sell order.', true),
            P('@quant_kid', 'Quant Kid', 'Algos dumping everything. Nobody knows why. Spreads are huge.'),
            P('@MarketPulse', 'Market Pulse', 'Circuit breakers tripped twice. Kesh and Calder shares dragged down with it.'),
          ],
          state: { fear: 9 },
          jumps: { eq: { AUR: -8, CAL: -3, KES: -4 }, banks: -4, energy: -2, gold: 1 },
          M: 1.3, spreadMult: { all: 2 },
          settle: { eq: { AUR: { v: 7, why: 'it was a broken trading program; buyers return' }, KES: { v: 4, why: 'buyers return' }, CAL: { v: 3, why: 'buyers return' } }, banks: { v: 5, why: 'buyers return' }, fear: { v: -6, why: 'the panic fades' } },
        }],
      }],
    },

    // ======================= ROUND 02 · INFLATION AND INTEREST RATES =======================
    {
      q: 5,
      headlines: [
        'Energy bills jump across the world; inflation is rising everywhere.',
        'Aurelia’s central bank: “inflation is our only concern.”',
        'Kesh’s inflation is back above 7%.',
      ],
      forecast: { econ: 'AUR', v: 'pi' },
      data: { AUR: { pi: 0.6, u: -0.2 }, CAL: { pi: 0.4 }, KES: { pi: 0.5 }, NOR: { pi: 0.3 }, VER: { pi: 0.2 } },
      news: { oil: { v: 5, why: 'a cold winter lifts demand for fuel' }, tp10: { AUR: { v: 0.15, why: 'investors want more to lend for ten years' } } },
    },
    {
      q: 6,
      headlines: [
        'Aurelian inflation is the highest in a decade.',
        'Verana’s prices are finally rising.',
        'Kesh’s reserves fall as Aurelian rates climb.',
      ],
      forecast: { econ: 'AUR', v: 'i' },
      data: { AUR: { pi: 0.5, g: 0.2 }, VER: { pi: 0.3 }, KES: { reserves: -4 } },
      news: {},
      crises: [{
        id: 'spiral', title: 'The Wage Spiral',
        stages: [{
          id: 'spiral-1', title: 'Strikes and a 9% pay rise',
          headline: 'Aurelia’s unions win a 9% pay rise; strikes spread to ports and railways. The central bank will now respond twice as hard to inflation.',
          posts: [
            P('@CentralBankAUR', 'Central Bank of Aurelia', 'Until inflation is under control our rule will give inflation twice its usual weight (1.0 instead of 0.5).', true),
            P('@AureliaWire', 'Aurelia Wire', 'Official: this quarter’s inflation figure revised up by 0.4 points after the pay deal.'),
            P('@trader_riya', 'Riya | Rates', 'Do the maths on the new rule. That is a big hike coming.'),
          ],
          data: { AUR: { pi: 0.4 } },
          rules: [{ econ: 'AUR', a: 1.0 }],
          state: { tp10: { AUR: 0.20 }, fear: 5 },
          jumps: { eq: { AUR: -3 }, gold: 2 },
          M: 1.25, spreadMult: { all: 1.5 },
          settle: { tp10: { AUR: { v: 0.1, why: 'bond investors fear more inflation' } } },
        }],
      }],
    },
    {
      q: 7,
      headlines: [
        'Calder’s exporters complain: Aurelian buyers are cutting orders.',
        'Food prices surge in Sarvan.',
        'Kesh raises rates to keep up with Aurelia; borrowers struggle.',
      ],
      forecast: { econ: 'CAL', v: 'pi' },
      data: { AUR: { pi: 0.3 }, CAL: { g: -0.4 }, KES: { g: -0.3, reserves: -5 }, SAR: { pi: 0.5 } },
      news: { tp10: { AUR: { v: 0.1, why: 'more government borrowing' }, CAL: { v: 0.1, why: 'higher yields everywhere' } } },
    },
    {
      q: 8,
      headlines: [
        'Verana’s inflation hits 2% for the first time in years.',
        'Aurelian growth slows under the weight of higher rates.',
        'Kesh’s reserves fall for a fifth quarter.',
      ],
      forecast: { econ: 'VER', v: 'pi' },
      data: { VER: { pi: 0.3, g: -0.3 }, AUR: { g: -0.3 }, KES: { reserves: -5 } },
      news: {},
      crises: [{
        id: 'cap', title: 'The Florin Cap',
        stages: [
          {
            id: 'cap-1', title: 'Verana’s bonds crack',
            headline: 'Verana’s 10-year yield leaps as Aurelian rates soar; Verana’s pension funds sell.',
            posts: [
              P('@VeranaFinance', 'Verana Finance Daily', 'Biggest one-day fall in Verana’s bonds for twenty years.'),
              P('@bond_vigilante', 'Bond Vigilante', 'A government that owes 155% of GDP cannot afford these yields. Shorting Verana.'),
            ],
            state: { tp10: { VER: 0.6 }, cp: { VER: 0.3 }, fear: 3 },
            jumps: { fx: { VER: -2 }, eq: { VER: -4 } },
            M: 1.25,
          },
          {
            id: 'cap-2', title: 'The Bank of Verana caps yields',
            headline: 'The Bank of Verana will buy unlimited bonds to hold the 10-year yield at 3.00% for the rest of the round.',
            posts: [
              P('@BankOfVerana', 'Bank of Verana', 'We will buy whatever is needed to keep the 10-year yield at or below 3.00%. This applies for the rest of Round 02.', true),
              P('@bond_vigilante', 'Bond Vigilante', 'Ouch. Never fight a central bank with a printing press.'),
              P('@MarketPulse', 'Market Pulse', 'Florin dropping fast — printing money to buy bonds weakens the currency.'),
            ],
            rules: [{ econ: 'VER', cap10: 3.0 }],
            state: { tp10: { VER: -0.3 } },
            jumps: { fx: { VER: -6 }, eq: { VER: 5 } },
          },
        ],
      }],
    },

    // ======================= ROUND 03 · COMMODITIES AND TRADE =======================
    {
      q: 9,
      headlines: [
        'Norvik’s oil output dips during pipeline maintenance.',
        'Sarvan’s farmers warn of a dry season.',
        'Calder’s factory orders fall for a second quarter.',
        'The Bank of Verana’s yield cap has ended with Round 02.',
      ],
      forecast: { econ: 'NOR', v: 'g' },
      data: { NOR: { oilOutput: -0.2 }, CAL: { g: -0.3 }, SAR: { harvest: -8 }, KES: { reserves: -6 }, AUR: { pi: 0.2 } },
      news: { oil: { v: 3, why: 'traders worry about supply' } },
    },
    {
      q: 10,
      headlines: [
        'Oil tankers are queuing at Norvik’s ports.',
        'Calder’s inflation edges up on fuel costs.',
        'Kesh’s reserves keep falling.',
      ],
      forecast: { econ: 'CAL', v: 'pi' },
      data: { AUR: { pi: 0.2 }, CAL: { pi: 0.2 }, KES: { reserves: -6 } },
      news: {},
      crises: [{
        id: 'pipeline', title: 'The Northern Pipeline',
        stages: [
          {
            id: 'pipeline-1', title: 'Pipeline explosion',
            headline: 'Explosion on Norvik’s Northern Pipeline: almost half of Norvik’s oil cannot reach the sea.',
            posts: [
              P('@NorvikEnergyMin', 'Norvik Ministry of Energy', 'Oil output revised down from 3.9 to 2.1 million barrels a day until repairs are complete.', true),
              P('@oil_desk', 'The Oil Desk', 'Oil up 30% in minutes. Calder buys every barrel it can — it has no oil of its own.'),
              P('@MarketPulse', 'Market Pulse', 'Krone falling: high oil price is no use if you cannot ship it.'),
            ],
            data: { NOR: { oilOutput: -1.8 } },
            state: { fear: 6 },
            jumps: { oil: 32, energy: -8, fx: { NOR: -4 }, eq: { NOR: -6, CAL: -5, AUR: -2 }, gold: 3, wheat: 3 },
            M: 1.4, spreadMult: { all: 2 },
          },
          {
            id: 'pipeline-2', title: 'The Western Line',
            headline: 'Norvik reroutes oil through the Western Line: two-thirds of lost output back within weeks.',
            posts: [
              P('@NorvikEnergyMin', 'Norvik Ministry of Energy', 'Output revised up to 3.3 million barrels a day as the Western Line opens.', true),
              P('@oil_desk', 'The Oil Desk', 'Oil giving back half the spike. Anyone who chased the top is underwater.'),
            ],
            data: { NOR: { oilOutput: 1.2 } },
            state: { fear: -3 },
            jumps: { oil: -14, energy: 10, fx: { NOR: 3 }, eq: { NOR: 4, CAL: 2 } },
            settle: { oil: { v: 3, why: 'insurance for tankers stays expensive' } },
          },
        ],
      }],
    },
    {
      q: 11,
      headlines: [
        'Aurelian politicians attack Calder’s “unfair” trade surplus.',
        'Sarvan’s harvest is shrinking.',
        'Kesh’s reserves are now well below where they started.',
      ],
      forecast: { econ: 'CAL', v: 'g' },
      data: { SAR: { harvest: -6 }, AUR: { g: -0.2 }, KES: { reserves: -8 } },
      news: {},
      crises: [{
        id: 'tariff', title: 'The Tariff Wall',
        stages: [{
          id: 'tariff-1', title: '30% tariffs on Calder',
          headline: 'Aurelia slaps 30% tariffs on everything Calder makes. Calder widens its currency band to ±6% for the rest of the round.',
          posts: [
            P('@AureliaTrade', 'Aurelia Trade Office', 'From today, a 30% tariff applies to all goods from Calder.', true),
            P('@CalderCentralBank', 'Central Bank of Calder', 'The mark may now move 6% either side of its central rate instead of 2%, for the rest of Round 03.', true),
            P('@CalderStats', 'Calder Statistics', 'Growth for this quarter revised down by 1.2 points.', true),
            P('@MarketPulse', 'Market Pulse', 'Copper sliding — Calder buys half the world’s copper.'),
          ],
          data: { CAL: { g: -1.2 }, AUR: { pi: 0.3 } },
          rules: [{ econ: 'CAL', band: 6 }],
          band: { width: 6 },
          state: { fear: 7, cp: { CAL: 0.3 } },
          jumps: { eq: { CAL: -10, AUR: -3 }, copper: -8, fx: { CAL: -3 }, energy: -2 },
          M: 1.3, spreadMult: { econ: { CAL: 2 } },
          settle: { eq: { CAL: { v: -2, why: 'Calder retaliates with tariffs on Aurelian farm goods' } }, wheat: { v: -3, why: 'Aurelian farmers lose their Calder buyers' }, copper: { v: -3, why: 'Calder’s factories slow' } },
        }],
      }],
    },
    {
      q: 12,
      headlines: [
        'No rain in Sarvan’s grain belt for three months.',
        'Calder’s growth falls to its lowest in a decade.',
        'Kesh’s finance minister: “our reserves are more than enough.”',
      ],
      forecast: { econ: 'SAR', v: 'pi' },
      data: { KES: { reserves: -8 }, CAL: { g: -0.4 } },
      news: {},
      crises: [{
        id: 'fields', title: 'Empty Fields',
        stages: [
          {
            id: 'fields-1', title: 'Harvest fails; export ban',
            headline: 'Sarvan’s harvest fails. The government bans all wheat exports.',
            posts: [
              P('@SarvanAgri', 'Sarvan Ministry of Agriculture', 'Harvest index revised down by 30 points. Wheat exports are banned until further notice.', true),
              P('@SarvanStats', 'Sarvan Statistics', 'Inflation for this quarter revised up by 1.5 points on food prices.', true),
              P('@grain_trader', 'Grain Trader', 'Wheat limit up. Sarvan feeds half the region.'),
            ],
            data: { SAR: { harvest: -30, pi: 1.5 } },
            state: { cp: { SAR: 0.8 }, fear: 3 },
            jumps: { wheat: 30, fx: { SAR: -6 }, eq: { SAR: -8 } },
            M: 1.3, spreadMult: { econ: { SAR: 2 } },
          },
          {
            id: 'fields-2', title: 'Bread riots; emergency hike',
            headline: 'Bread riots in Sarvan’s capital. The central bank adds 3.00% to its rule in an emergency meeting.',
            posts: [
              P('@SarvanCentralBank', 'Central Bank of Sarvan', 'Our rule will carry an emergency addition of +3.00% for the rest of Round 03.', true),
              P('@MarketPulse', 'Market Pulse', 'Ora bouncing on the rate news. Sarvan shares still falling.'),
            ],
            rules: [{ econ: 'SAR', add: 3.0 }],
            state: { cp: { SAR: 0.5 } },
            jumps: { fx: { SAR: 2 }, eq: { SAR: -6 }, wheat: 5 },
            settle: { wheat: { v: -4, why: 'Aurelian farmers plant more wheat' } },
          },
        ],
      }],
    },

    // ======================= ROUND 04 · EMERGING MARKETS AND CURRENCIES =======================
    {
      q: 13,
      headlines: [
        'Kesh’s reserves fall for the ninth quarter in a row.',
        'Kesh’s finance minister: “the peg is not up for discussion.”',
        'Kesh’s trade deficit widens; companies rush to repay crown loans.',
        'Sarvan’s economy slows sharply after the drought.',
      ],
      forecast: { econ: 'KES', v: 'i' },
      data: { KES: { reserves: -12, ca: -0.8, g: -0.4 }, SAR: { g: -0.4 }, AUR: { badLoans: 0.2 } },
      news: { cp: { KES: { v: 0.8, why: 'investors doubt the peg' } }, fx: { AUR: { v: 1, why: 'money leaves emerging markets for Aurelia' } } },
    },
    {
      q: 14,
      headlines: [
        'Kesh’s reserves are lower than at any time in ten years.',
        'Kesh’s inflation is creeping up again.',
        'Long lines reported at money changers in Kesh City.',
      ],
      forecast: { econ: 'KES', v: 'pi' },
      data: { KES: { reserves: -10, pi: 0.4 } },
      news: {},
      crises: [{
        id: 'dinar', title: 'Run on the Dinar',
        stages: [
          {
            id: 'dinar-1', title: 'Queues at the banks',
            headline: 'Queues outside Kesh’s banks. The dinar trades at 58 on the street. Kesh adds 3.00% to its rule in an emergency.',
            posts: [
              P('@KeshCentralBank', 'Central Bank of Kesh', 'Reserves revised down by ₵30 bn after heavy intervention. Our rule carries an emergency +3.00% for the rest of Round 04. The peg will hold.', true),
              P('@kesh_street', 'Kesh Street', 'ATMs running dry in the old city. Everyone wants crowns.'),
              P('@em_hawk', 'EM Hawk', 'Sarvan and Kesh trade together. If Kesh goes, Sarvan is next.'),
            ],
            data: { KES: { reserves: -30 } },
            rules: [{ econ: 'KES', add: 3.0 }],
            state: { cp: { KES: 1.0, SAR: 0.6 }, fear: 8 },
            jumps: { eq: { KES: -12, SAR: -5 }, fx: { SAR: -4, AUR: 1.5 }, gold: 3 },
            M: 1.6, spreadMult: { all: 1.5, econ: { KES: 4 } },
          },
          {
            id: 'dinar-2', title: 'The peg breaks',
            headline: 'Kesh abandons the peg. The dinar floats — and sinks.',
            posts: [
              P('@KeshCentralBank', 'Central Bank of Kesh', 'The dinar will float from today. The emergency addition to our rule rises to +5.00%.', true),
              P('@KeshStats', 'Kesh Statistics', 'Inflation for this quarter revised up 2.5 points; growth revised down 1.5 points.', true),
              P('@em_hawk', 'EM Hawk', 'Every company in Kesh with crown debts just saw them jump by a third.'),
            ],
            pegBreak: true,
            data: { KES: { pi: 2.5, g: -1.5 } },
            rules: [{ econ: 'KES', add: 5.0 }],
            state: { cp: { KES: 1.5 } },
            jumps: { fx: { KES: -35 }, eq: { KES: -10, SAR: -4 } },
            settle: { cp: { KES: { v: 0.5, why: 'ratings agencies cut Kesh to junk' } }, eq: { KES: { v: -3, why: 'companies with crown debts struggle' } } },
          },
        ],
      }],
    },
    {
      q: 15,
      headlines: [
        'Kesh is in recession; unemployment jumps.',
        'Sarvan’s exporters lose their biggest customer.',
        'Aurelian banks report more unpaid loans.',
      ],
      forecast: { econ: 'SAR', v: 'u' },
      data: { KES: { g: -1.5, u: 0.8 }, SAR: { g: -0.6 }, CAL: { g: -0.3 }, AUR: { badLoans: 0.3 } },
      news: {},
      crises: [{
        id: 'contagion', title: 'Contagion',
        stages: [{
          id: 'contagion-1', title: 'Flight from frontier markets',
          headline: 'Investors flee every frontier market. Sarvan’s ora hits a record low.',
          posts: [
            P('@em_hawk', 'EM Hawk', 'Told you. Sarvan next. Thin market, no buyers.'),
            P('@SarvanCentralBank', 'Central Bank of Sarvan', 'We are watching markets closely.', true),
            P('@MarketPulse', 'Market Pulse', 'Gold and the crown bid as money runs for safety.'),
          ],
          state: { cp: { SAR: 1.5, KES: 0.8 }, fear: 6 },
          jumps: { fx: { SAR: -9, AUR: 1 }, eq: { SAR: -10, KES: -5 }, copper: -5, wheat: -4, gold: 2 },
          M: 1.4, spreadMult: { econ: { SAR: 3 } },
          settle: { fx: { SAR: { v: 2, why: 'bargain hunters return' } }, eq: { SAR: { v: 3, why: 'bargain hunters return' } } },
        }],
      }],
    },
    {
      q: 16,
      headlines: [
        'Kesh’s government meets the Concord Fund.',
        'Aurelian banks set aside more money for bad loans.',
        'Aurelian growth slips below trend.',
      ],
      forecast: { econ: 'KES', v: 'g' },
      data: { AUR: { badLoans: 0.3, g: -0.3 } },
      news: {},
      crises: [{
        id: 'concord', title: 'The Concord Rescue',
        stages: [{
          id: 'concord-1', title: 'A ₵60 bn rescue',
          headline: 'The Concord Fund lends Kesh ₵60 bn. Kesh cuts its emergency rate addition to +1.00%.',
          posts: [
            P('@ConcordFund', 'The Concord Fund', 'We have agreed a ₵60 bn loan to Kesh, with strict conditions on spending and new crown debt.', true),
            P('@KeshCentralBank', 'Central Bank of Kesh', 'Reserves revised up by ₵60 bn. The emergency addition to our rule falls to +1.00%.', true),
            P('@em_hawk', 'EM Hawk', 'Anyone still holding Kesh default protection just lost most of it.'),
          ],
          data: { KES: { reserves: 60 } },
          rules: [{ econ: 'KES', add: 1.0 }],
          state: { cp: { KES: -3.0, SAR: -0.6 }, fear: -5 },
          jumps: { fx: { KES: 12, SAR: 3 }, eq: { KES: 15, SAR: 4 } },
          settle: { eq: { KES: { v: 3, why: 'investors return to Kesh' } } },
        }],
      }],
    },

    // ======================= ROUND 05 · BANKING AND CREDIT =======================
    {
      q: 17,
      headlines: [
        'Aurelian office prices are down a fifth from their peak.',
        'Halvard Bank’s shares slide after a profit warning.',
        'Bad loans at Aurelian banks are the highest in years.',
      ],
      forecast: { econ: 'AUR', v: 'g' },
      data: { AUR: { badLoans: 0.6, g: -0.5 } },
      news: { sBank: { v: 0.6, why: 'worries about property loans' }, banks: { v: -4, why: 'worries about property loans' }, sHY: { v: 0.5, why: 'weaker companies struggle' } },
    },
    {
      q: 18,
      headlines: [
        'Aurelian bad loans rise again; Halvard Bank “well capitalised”, says its chief.',
        'Aurelian unemployment is rising.',
        'Depositors are moving money out of smaller Aurelian banks.',
      ],
      forecast: { econ: 'AUR', v: 'i' },
      data: { AUR: { badLoans: 0.8, g: -0.6, u: 0.3 } },
      news: {},
      crises: [{
        id: 'halvard', title: 'Halvard',
        stages: [
          {
            id: 'halvard-1', title: 'Halvard halts withdrawals',
            headline: 'Halvard Bank, Aurelia’s third-largest lender, halts withdrawals.',
            posts: [
              P('@HalvardBank', 'Halvard Bank', 'To protect all customers, withdrawals are paused while we review our position.', true),
              P('@AureliaWire', 'Aurelia Wire', 'Official: Aurelian bad loans revised up a full point.'),
              P('@credit_owl', 'Credit Owl', 'Bank default protection is the only thing going up. That and gold.'),
            ],
            data: { AUR: { badLoans: 1.0 } },
            state: { sBank: 2.5, sHY: 2.0, sIG: 0.6, fear: 16 },
            jumps: { banks: -20, eq: { AUR: -6, VER: -4, KES: -5, CAL: -3 }, fx: { AUR: -2 }, gold: 5 },
            M: 1.75, spreadMult: { all: 3 },
          },
          {
            id: 'halvard-2', title: 'Halvard defaults',
            headline: 'Halvard misses a payment on its bonds: a default. The state will protect depositors, not bondholders. The central bank cuts by an extra 1.00%.',
            posts: [
              P('@AureliaTreasury', 'Aurelian Treasury', 'Depositors are safe. Halvard’s bondholders will bear the losses.', true),
              P('@CentralBankAUR', 'Central Bank of Aurelia', 'Our rule carries an emergency −1.00% for the rest of Round 05.', true),
              P('@credit_owl', 'Credit Owl', 'Aurelian Banks protection pays out IN FULL. Anyone who sold it is in serious trouble.'),
            ],
            defaultEntity: 'BANKS', newSpread: 4.5,
            data: { AUR: { g: -1.0 } },
            rules: [{ econ: 'AUR', add: -1.0 }],
            state: { sHY: 1.0, fear: 4 },
            jumps: { banks: -12, eq: { AUR: -3 }, gold: 2 },
            settle: { sHY: { v: 0.5, why: 'lenders pull back from weaker companies' } },
          },
        ],
      }],
    },
    {
      q: 19,
      headlines: [
        'Aurelia is in recession.',
        'Aurelian companies struggle to refinance their debts.',
        'Calder’s and Verana’s exporters feel Aurelia’s slump.',
      ],
      forecast: { econ: 'AUR', v: 'u' },
      data: { AUR: { g: -1.0, u: 0.5, badLoans: 0.4 }, CAL: { g: -0.5 }, VER: { g: -0.4 } },
      news: { sHY: { v: 0.5, why: 'more companies miss payments' } },
      crises: [{
        id: 'freeze', title: 'Credit Freeze',
        stages: [{
          id: 'freeze-1', title: 'The high-yield market shuts',
          headline: 'Aurelian companies cannot borrow: the high-yield market has shut.',
          posts: [
            P('@credit_owl', 'Credit Owl', 'No new junk bonds sold for six weeks. Spreads exploding.'),
            P('@MarketPulse', 'Market Pulse', 'Rumours the central bank will step in. Nothing official yet.'),
          ],
          state: { sHY: 2.0, sIG: 0.5, fear: 8 },
          jumps: { eq: { AUR: -5, CAL: -3 }, banks: -4 },
          M: 1.75,
          settle: { sHY: { v: -2.0, why: 'the central bank opens an emergency lending window for companies' }, sIG: { v: -0.4, why: 'the emergency lending window' }, eq: { AUR: { v: 3, why: 'the emergency lending window' } }, fear: { v: -4, why: 'the emergency lending window' } },
        }],
      }],
    },
    {
      q: 20,
      headlines: [
        'Aurelia’s slump begins to ease.',
        'Verana’s banks hold large Aurelian loans, say analysts.',
        'Verana’s banks are holding fewer of their government’s bonds.',
      ],
      forecast: { econ: 'VER', v: 'g' },
      data: { VER: { bankShare: -6, g: -0.5 }, AUR: { g: 0.3 } },
      news: {},
      crises: [{
        id: 'verbanks', title: 'Verana’s Banks Crack',
        stages: [{
          id: 'verbanks-1', title: 'Losses at Verana’s banks',
          headline: 'Verana’s three largest banks report huge losses on Aurelian loans and start selling government bonds.',
          posts: [
            P('@VeranaFinance', 'Verana Finance Daily', 'Banks’ share of government bonds revised down 8 points. Who buys Verana’s debt now?'),
            P('@bond_vigilante', 'Bond Vigilante', 'Verana’s debt was safe because its own banks held it. That is ending.'),
          ],
          data: { VER: { bankShare: -8 } },
          state: { cp: { VER: 1.0 }, fear: 5 },
          jumps: { eq: { VER: -10 }, fx: { VER: -4 } },
          M: 1.4, spreadMult: { econ: { VER: 2 } },
          settle: { cp: { VER: { v: 0.3, why: 'foreign investors demand more to hold Verana’s bonds' } } },
        }],
      }],
    },

    // ======================= ROUND 06 · SOVEREIGN DEBT AND RECOVERY =======================
    {
      q: 21,
      headlines: [
        'Verana must borrow ₹3,000 Cr this quarter. Bids open now.',
        'Verana’s banks keep selling government bonds.',
        'Aurelia’s economy is growing again.',
      ],
      forecast: { econ: 'VER', v: 'i' },
      data: { VER: { debt: 3, bankShare: -5, b: -1.0 }, AUR: { g: 0.4 } },
      news: { tp10: { VER: { v: 0.3, why: 'a large new bond sale' } } },
      auction: {
        inst: 'VER10Y', sizeCr: 3000, maxPctOfFund: 30,
        title: 'The Verana Bond Auction',
        rules: [
          'Verana is selling ₹3,000 Cr of new 10-year bonds, identical to the Verana 10Y on your desk.',
          'Bid a price (in rupees, like the desk price) and an amount in ₹ Cr, up to 30% of your fund value. One bid per fund; you may change it until the bell.',
          'Highest prices are filled first. You pay the price you bid. Equal bids at the last price share what is left.',
          'Your bonds are added to your Verana 10Y position at the price the market settles at. Bid below it and you gain at once; bid above it and you lose.',
        ],
      },
    },
    {
      q: 22,
      headlines: [
        'Ratings agencies put Verana on watch for a downgrade.',
        'Aurelian and Calder growth pick up.',
        'Verana’s banks’ share of its bonds keeps falling.',
      ],
      forecast: { econ: 'VER', v: 'g' },
      data: { VER: { bankShare: -4 }, AUR: { g: 0.5 }, CAL: { g: 0.4 } },
      news: {},
      crises: [{
        id: 'reckoning', title: 'The Reckoning',
        stages: [
          {
            id: 'reckoning-1', title: 'Downgraded to junk',
            headline: 'Verana’s next bond sale fails and it is downgraded to junk.',
            posts: [
              P('@VeranaFinance', 'Verana Finance Daily', 'Only half of today’s bonds found buyers. Yields at levels not seen since the old crisis.'),
              P('@bond_vigilante', 'Bond Vigilante', 'Anyone who bought big at last quarter’s auction is now very nervous.'),
            ],
            state: { cp: { VER: 2.5 }, fear: 10 },
            jumps: { fx: { VER: -6, AUR: 1 }, eq: { VER: -8 }, gold: 4 },
            M: 1.6, spreadMult: { all: 2, econ: { VER: 3 } },
          },
          {
            id: 'reckoning-2', title: 'Verana restructures',
            headline: 'Verana restructures its debt: bondholders lose 30% on 10-year bonds and 20% on 2-year bonds.',
            posts: [
              P('@VeranaTreasury', 'Verana Treasury', 'Verana will exchange its bonds for new bonds worth less. This is a default.', true),
              P('@VeranaStats', 'Verana Statistics', 'Growth for this quarter revised down 1.5 points.', true),
              P('@credit_owl', 'Credit Owl', 'Verana default protection pays out IN FULL.'),
            ],
            defaultEntity: 'VER', newSpread: 5.0,
            haircuts: { VER10Y: -30, VER2Y: -20 },
            data: { VER: { g: -1.5 } },
            state: { cp: { VER: -1.5 } },
            jumps: { fx: { VER: -4 }, eq: { VER: -6, AUR: -2 }, banks: -3 },
          },
        ],
      }],
    },
    {
      q: 23,
      headlines: [
        'Verana’s exchange offer closes.',
        'Aurelian unemployment starts to fall.',
        'Kesh’s economy is recovering under the Concord plan.',
      ],
      forecast: { econ: 'AUR', v: 'u' },
      data: { AUR: { g: 0.4 }, KES: { g: 0.6 }, CAL: { g: 0.3 } },
      news: {},
      crises: [{
        id: 'bargain', title: 'The Grand Bargain',
        stages: [{
          id: 'bargain-1', title: 'A global backstop',
          headline: 'Aurelia, Calder and the Concord Fund agree a ₵500 bn global backstop. Verana’s new bonds are guaranteed.',
          posts: [
            P('@ConcordFund', 'The Concord Fund', 'Together with Aurelia and Calder we will stand behind Verana’s new bonds.', true),
            P('@MarketPulse', 'Market Pulse', 'Everything rallying at once. Fear Index collapsing.'),
            P('@credit_owl', 'Credit Owl', 'Shorted the recovery? Painful afternoon.'),
          ],
          state: { cp: { VER: -2.5, KES: -0.8, SAR: -0.8 }, fear: -12, sHY: -1.5, sIG: -0.3, sBank: -1.0 },
          jumps: { eq: { VER: 10, AUR: 5, CAL: 5, KES: 6, SAR: 6 }, fx: { VER: 5 }, banks: 6, copper: 6, oil: 5, gold: -5 },
          M: 1.2,
        }],
      }],
    },
    {
      q: 24,
      headlines: [
        'The world economy is growing again.',
        'Norvik and its partners meet to discuss oil prices.',
        'This is the final quarter.',
      ],
      forecast: { econ: 'KES', v: 'g' },
      data: { AUR: { g: 0.3 }, CAL: { g: 0.2 }, VER: { g: 0.3 } },
      news: {},
      crises: [{
        id: 'lastbell', title: 'The Last Bell',
        stages: [{
          id: 'lastbell-1', title: 'Oil output cut',
          headline: 'Norvik and its partners cut oil output to push prices back up.',
          posts: [
            P('@NorvikEnergyMin', 'Norvik Ministry of Energy', 'Output revised down by 0.5 million barrels a day.', true),
            P('@oil_desk', 'The Oil Desk', 'One last twist before the bell.'),
          ],
          data: { NOR: { oilOutput: -0.5 } },
          state: { fear: 2 },
          jumps: { oil: 14, energy: 6, fx: { NOR: 3 }, eq: { NOR: 3, CAL: -2 } },
          M: 1.2,
        }],
      }],
    },
  ],
  final: { data: { AUR: { g: 0.2 }, KES: { g: 0.3 } } },
  rounds: [],
};

/** Every piece of text that must never appear in the public website. */
export function secretStrings() {
  const out = [];
  for (const q of SCRIPT.quarters) {
    for (const c of q.crises || []) {
      out.push(c.title);
      for (const s of c.stages) { out.push(s.title, s.headline); for (const p of s.posts || []) out.push(p.text); }
    }
    for (const h of q.headlines || []) out.push(h);
  }
  return out.filter((s) => s && s.length > 12);
}
