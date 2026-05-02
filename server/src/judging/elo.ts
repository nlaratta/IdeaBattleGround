export const INITIAL_ELO = 1200;

export function expectedScore(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

export function updateElo(ra: number, rb: number, scoreA: number, k = 32): { newA: number; newB: number; delta: number } {
  const ea = expectedScore(ra, rb);
  const newA = ra + k * (scoreA - ea);
  const newB = rb + k * ((1 - scoreA) - (1 - ea));
  return { newA, newB, delta: newA - ra };
}
