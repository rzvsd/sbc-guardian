export const CLUB = { players: 2184, available: 438, lastSynced: 'just now' };

export const SBC = {
  name: '83-Rated Squad',
  group: 'Marquee Matchups',
  minRating: 83,
  squadSize: 11,
  reward: 'Premium Gold Pack',
};

export const SOLUTION = {
  rating: 83,
  chemistry: 24,
  uses: [
    ['8', 'Common Gold'],
    ['2', 'Untradeable'],
    ['1', 'Duplicate'],
  ],
  sacrifice: 8700,
  protectedUsed: 0,
  specialCount: 1,
  players: [
    { id: 1, name: 'Raya', rating: 83, pos: 'GK', type: 'Gold Rare', untradeable: false, dupe: false, value: 900, reasons: ['Low replacement value', 'Not protected', 'Cheapest eligible goalkeeper'] },
    { id: 2, name: 'Saliba', rating: 84, pos: 'CB', type: 'Gold Rare', untradeable: true, dupe: false, value: 1400, reasons: ['Untradeable — no coin loss', 'Not protected', 'Raises squad rating efficiently'] },
    { id: 3, name: 'Gabriel', rating: 84, pos: 'CB', type: 'Gold Rare', untradeable: false, dupe: true, value: 1200, reasons: ['Duplicate in your club', 'Not protected', 'Raises squad rating efficiently'] },
    { id: 4, name: 'Stones', rating: 83, pos: 'CB', type: 'Gold Rare', untradeable: false, dupe: false, value: 800, reasons: ['Low replacement value', 'Not protected', 'Matches rating requirement exactly'] },
    { id: 5, name: 'Grimaldo', rating: 82, pos: 'LB', type: 'Gold Rare', untradeable: false, dupe: false, value: 750, reasons: ['Low replacement value', 'Not protected', 'Balances squad rating cheaply'] },
    { id: 6, name: 'Højbjerg', rating: 83, pos: 'CDM', type: 'Gold Rare', untradeable: false, dupe: false, value: 700, reasons: ['Low replacement value', 'Not protected', 'Helps satisfy rating efficiently'] },
    { id: 7, name: 'Barella', rating: 84, pos: 'CM', type: 'In-Form', untradeable: false, dupe: false, value: 8400, special: true, reasons: ['Cheapest option to reach 83 rating', 'Special card — flagged for your review', 'Not protected'] },
    { id: 8, name: 'Eriksen', rating: 82, pos: 'CM', type: 'Gold Rare', untradeable: false, dupe: false, value: 650, reasons: ['Low replacement value', 'Not protected', 'Balances squad rating cheaply'] },
    { id: 9, name: 'Ødegaard', rating: 84, pos: 'CAM', type: 'Gold Rare', untradeable: true, dupe: false, value: 2100, reasons: ['Untradeable — no coin loss', 'Not protected', 'Helps satisfy rating efficiently'] },
    { id: 10, name: 'Isak', rating: 84, pos: 'ST', type: 'Gold Rare', untradeable: false, dupe: false, value: 1900, reasons: ['Raises squad rating efficiently', 'Not protected', 'No cheaper eligible striker found'] },
    { id: 11, name: 'Watkins', rating: 82, pos: 'ST', type: 'Gold Rare', untradeable: false, dupe: false, value: 850, reasons: ['Low replacement value', 'Not protected', 'Balances squad rating cheaply'] },
  ],
  avoided: [
    { id: 'a1', name: 'Mbappé', rating: 91, pos: 'ST', type: 'Gold Rare', reason: 'Part of your active squad', detail: 'Kylian Mbappé was excluded because he is currently part of your active squad.', kind: 'squad' },
    { id: 'a2', name: 'Vinícius Jr', rating: 89, pos: 'LW', type: 'Team of the Season', reason: 'High market value', detail: 'Vinícius Jr was excluded because he is worth approximately 84,000 coins — above your protection limit.', kind: 'value' },
    { id: 'a3', name: 'Saka', rating: 87, pos: 'RW', type: 'Gold Rare', reason: 'Marked as favorite', detail: 'Saka was excluded because you marked him as a favorite. Favorites are never used automatically.', kind: 'favorite' },
  ],
};

export const coins = (n) => n.toLocaleString('en-US');
