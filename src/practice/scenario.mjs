// The practice scenario: two made-up quarters for learning the desk on one device.
// Deliberately unlike the real game: different starting figures, different (gentle) news,
// and a practice-only crisis drill. Nothing here hints at the live script.

export const PRACTICE = {
  id: 'practice-v1',
  practice: true,
  start: {
    AUR: { g: 1.6, pi: 3.1, i: 3.5, u: 4.9 },
    CAL: { g: 6.0, pi: 2.6, i: 3.25, u: 3.8 },
    VER: { g: 1.1, pi: 1.6, i: 0.75, u: 7.1 },
    KES: { g: 5.8, pi: 6.2, i: 8.25, u: 6.9 },
    NOR: { g: 2.9, pi: 2.4, i: 3.0, u: 3.2 },
    SAR: { g: 3.5, pi: 7.6, i: 10.0, u: 9.4 },
  },
  quarters: [
    {
      q: 1,
      headlines: [
        'PRACTICE: Calder opens a new high-speed railway between its factory cities.',
        'PRACTICE: A new copper mine opens in Sarvan’s hills.',
        'PRACTICE: Verana’s tourism season starts early.',
      ],
      forecast: { econ: 'CAL', v: 'i' },
      data: {},
      news: { copper: { v: -3, why: 'the new Sarvan mine adds supply' } },
    },
    {
      q: 2,
      headlines: [
        'PRACTICE: Sarvan’s copper output jumps as the new mine ramps up.',
        'PRACTICE: Calder’s railway lifts business confidence.',
      ],
      forecast: { econ: 'SAR', v: 'pi' },
      data: { SAR: { copperOutput: 10 }, CAL: { g: 0.4 } },
      news: {},
      crises: [{
        id: 'p-ash', title: 'Practice drill: the ash cloud',
        stages: [{
          id: 'p-ash-1', title: 'Volcanic ash over Norvik',
          headline: 'PRACTICE DRILL: a volcanic ash cloud closes Norvik’s airports for a week.',
          posts: [
            { handle: '@practice_news', name: 'Practice News', text: 'This is a practice crisis. Prices react at once — watch your Risk Used.', verified: true },
          ],
          state: { fear: 4 },
          jumps: { eq: { NOR: -3 }, oil: 4, energy: -2 },
          M: 1.2,
        }],
      }],
    },
  ],
  final: { data: {} },
};
