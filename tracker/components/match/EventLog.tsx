import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { GameEvent } from '@/lib/types';
import { cn } from '@/lib/utils';

interface EventLogProps {
  events: GameEvent[];
  /** From `deriveGameState` — cancelled events render struck-through/dimmed. */
  undoneEventIds: Set<string>;
  /** Resolves a battlefield card id to its name (cached cards index). */
  cardNameById: (id: string) => string | undefined;
  onUndo: () => void;
  canUndo: boolean;
}

function describeEvent(
  event: GameEvent,
  cardNameById: (id: string) => string | undefined,
  ambiguousNames: Set<string>,
): string {
  const name = event.battlefield_card_id
    ? cardNameById(event.battlefield_card_id)
    : undefined;
  let battlefield = name ?? 'battlefield';
  // Mirror matches: both slots can hold the same card — disambiguate by owner.
  if (name && ambiguousNames.has(name)) {
    const owner = event.payload['battlefield_owner'];
    if (owner === 'me') battlefield = `${name} (mine)`;
    else if (owner === 'opponent') battlefield = `${name} (opp's)`;
  }

  switch (event.event_type) {
    case 'game_start':
      return 'Game started';
    case 'turn_start':
      return `Turn ${event.turn_number ?? '?'} started`;
    case 'score_conquer':
      return `Conquered ${battlefield}`;
    case 'score_hold':
      return `Held ${battlefield}`;
    case 'score_effect':
      return `+${event.points} from effect`;
    case 'draw_instead': {
      const reason = event.payload['reason'];
      if (reason === 'battlefield_already_scored') return 'Drew instead (already scored)';
      if (reason === 'final_point_rule') return 'Drew instead (final point)';
      return 'Drew instead';
    }
    case 'control_change': {
      const next = event.payload['new_controller'];
      const holder = next === 'me' ? 'Me' : next === 'opponent' ? 'Opp' : 'nobody';
      return `${battlefield} control → ${holder}`;
    }
    case 'hold_skipped':
      return 'No holds scored';
    case 'note': {
      const text = event.payload['text'];
      return typeof text === 'string' && text ? `Note: ${text}` : 'Note';
    }
    case 'game_end':
      return 'Game ended';
    default:
      // Unknown/future (e.g. audio-inferred) event types — show the raw type.
      return event.event_type;
  }
}

function actorLabel(actor: GameEvent['actor']): string | null {
  if (actor === 'me') return 'Me';
  if (actor === 'opponent') return 'Opp';
  return null; // system events carry no actor chip
}

/**
 * Reverse-chron compact event list + Undo header. Renders a plain map (no
 * scrolling) so it can live inside the screen's ScrollView. `undo` events
 * themselves are hidden — their effect shows as strike-through on the target.
 */
export function EventLog({
  events,
  undoneEventIds,
  cardNameById,
  onUndo,
  canUndo,
}: EventLogProps) {
  const visibleEvents = useMemo(
    () =>
      events
        .filter((event) => event.event_type !== 'undo')
        .sort((a, b) => b.seq - a.seq),
    [events],
  );

  // Battlefield names seen on more than one owner slot in this log (mirror
  // matches) — those get an owner suffix in descriptions.
  const ambiguousNames = useMemo(() => {
    const ownersByName = new Map<string, Set<string>>();
    for (const event of events) {
      const owner = event.payload['battlefield_owner'];
      if (owner !== 'me' && owner !== 'opponent') continue;
      if (!event.battlefield_card_id) continue;
      const name = cardNameById(event.battlefield_card_id);
      if (!name) continue;
      const owners = ownersByName.get(name) ?? new Set<string>();
      owners.add(owner);
      ownersByName.set(name, owners);
    }
    return new Set(
      [...ownersByName.entries()]
        .filter(([, owners]) => owners.size > 1)
        .map(([name]) => name),
    );
  }, [events, cardNameById]);

  function handleUndo() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onUndo();
  }

  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="text-foreground text-base font-semibold">Event log</Text>
        <Button variant="outline" size="sm" disabled={!canUndo} onPress={handleUndo}>
          <Text>Undo</Text>
        </Button>
      </View>

      {visibleEvents.length === 0 ? (
        <Text className="text-muted-foreground py-3 text-center text-sm">No events yet</Text>
      ) : (
        visibleEvents.map((event) => {
          const undone = undoneEventIds.has(event.id);
          const actor = actorLabel(event.actor);
          return (
            <View key={event.id} className={cn('flex-row items-center gap-2 py-1.5', undone && 'opacity-50')}>
              <Badge variant="outline">
                <Text>{event.turn_number != null ? `T${event.turn_number}` : '–'}</Text>
              </Badge>
              {actor ? (
                <Text className="text-muted-foreground w-9 text-xs font-medium">{actor}</Text>
              ) : null}
              <Text
                numberOfLines={1}
                className={cn('text-foreground flex-1 text-sm', undone && 'line-through')}>
                {describeEvent(event, cardNameById, ambiguousNames)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}
