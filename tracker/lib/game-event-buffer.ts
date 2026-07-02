import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GameEvent, ScoreEventPayload } from '@/lib/types';

const PREFIX = 'game-event-buffer:';

export interface BufferedScoreEvent {
  seq: number;
  turn_no: number;
  event_type: 'score';
  payload: ScoreEventPayload;
}

export interface BufferedGameState {
  gameId: string;
  turnNo: number;
  events: BufferedScoreEvent[];
}

export async function loadGameBuffer(gameId: string): Promise<BufferedGameState | null> {
  const raw = await AsyncStorage.getItem(`${PREFIX}${gameId}`);
  if (!raw) return null;
  return JSON.parse(raw) as BufferedGameState;
}

export async function saveGameBuffer(state: BufferedGameState): Promise<void> {
  await AsyncStorage.setItem(`${PREFIX}${state.gameId}`, JSON.stringify(state));
}

export async function clearGameBuffer(gameId: string): Promise<void> {
  await AsyncStorage.removeItem(`${PREFIX}${gameId}`);
}

export function bufferedEventsToGameEvents(
  gameId: string,
  events: BufferedScoreEvent[],
): GameEvent[] {
  return events.map((e) => ({
    id: `local-${e.seq}`,
    game_id: gameId,
    seq: e.seq,
    turn_no: e.turn_no,
    event_type: e.event_type,
    payload: e.payload as unknown as Record<string, unknown>,
    created_at: '',
  }));
}

export function gameEventsToBuffered(events: GameEvent[]): BufferedScoreEvent[] {
  return [...events]
    .sort((a, b) => a.seq - b.seq)
    .flatMap((e) => {
      if (e.event_type !== 'score') return [];
      const p = e.payload as Partial<ScoreEventPayload>;
      if (typeof p.scorer_seat !== 'number') return [];
      return [
        {
          seq: e.seq,
          turn_no: e.turn_no,
          event_type: 'score' as const,
          payload: {
            scorer_seat: p.scorer_seat,
            battlefield_position: p.battlefield_position,
            points: p.points ?? 1,
            source: p.source ?? 'battlefield',
          },
        },
      ];
    });
}
