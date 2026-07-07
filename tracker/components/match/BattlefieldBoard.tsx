import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { Card, PlayerRef } from '@/lib/types';
import { cn } from '@/lib/utils';

interface BattlefieldSlotInfo {
  /** Null when the battlefield wasn't recorded at game setup. */
  card: Card | null;
  /** Whose battlefield this slot is (both players can bring the same card). */
  owner: PlayerRef;
  /** Current controller from the derived game state; null = uncontrolled. */
  controller: PlayerRef | null;
  /**
   * Warning when the prospective conqueror already scored this slot this
   * turn — the tap then records a draw instead (shown preemptively on the
   * tile so nothing happens by surprise).
   */
  conquerWarning?: string;
}

interface BattlefieldBoardProps {
  slots: BattlefieldSlotInfo[];
  playerName: (player: PlayerRef) => string;
  /** `actor` conquered the slot's battlefield (control flips to them). */
  onConquer: (slot: PlayerRef, actor: PlayerRef) => void;
  /** Manual correction: set a slot's controller without scoring. */
  onSetControl: (slot: PlayerRef, controller: PlayerRef | null) => void;
  /** Manual "drew instead of scoring" at this slot. */
  onDrawInstead: (slot: PlayerRef, actor: PlayerRef) => void;
}

function ownerLabel(owner: PlayerRef): string {
  return owner === 'me' ? 'My battlefield' : "Opponent's battlefield";
}

function haptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/**
 * The two battlefields as big one-tap tiles, mirroring the physical board.
 *
 * - Controlled tile: tap = the other player conquers it (+1, control flips).
 * - Uncontrolled tile: tap expands an inline "who took it?" choice.
 * - Long-press: edit sheet (fix control without scoring, manual draw-instead)
 *   for board states the tap gesture can't express.
 */
export function BattlefieldBoard({
  slots,
  playerName,
  onConquer,
  onSetControl,
  onDrawInstead,
}: BattlefieldBoardProps) {
  /** Slot whose inline "who conquered?" chooser is open (uncontrolled taps). */
  const [choosingFor, setChoosingFor] = useState<PlayerRef | null>(null);
  const [editSlot, setEditSlot] = useState<BattlefieldSlotInfo | null>(null);

  function handleTap(slot: BattlefieldSlotInfo) {
    haptic();
    if (slot.controller) {
      setChoosingFor(null);
      onConquer(slot.owner, slot.controller === 'me' ? 'opponent' : 'me');
    } else {
      setChoosingFor((prev) => (prev === slot.owner ? null : slot.owner));
    }
  }

  function handleChooseConqueror(slot: PlayerRef, actor: PlayerRef) {
    haptic();
    setChoosingFor(null);
    onConquer(slot, actor);
  }

  return (
    <View className="gap-1.5">
      <View className="flex-row gap-3">
        {slots.map((slot) => {
          const conqueror = slot.controller
            ? slot.controller === 'me'
              ? 'opponent'
              : 'me'
            : null;
          const choosing = choosingFor === slot.owner;
          return (
            <Pressable
              key={slot.owner}
              onPress={() => handleTap(slot)}
              onLongPress={() => {
                haptic();
                setChoosingFor(null);
                setEditSlot(slot);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${ownerLabel(slot.owner)}: ${slot.card?.name ?? 'battlefield'}, ${
                slot.controller ? `controlled by ${playerName(slot.controller)}` : 'uncontrolled'
              }. Tap to record a conquer, long-press to edit.`}
              className={cn(
                'flex-1 gap-1 rounded-xl border p-3 active:bg-accent',
                slot.controller === 'me' && 'border-primary bg-primary/5',
                slot.controller === 'opponent' && 'border-destructive/60 bg-destructive/5',
                !slot.controller && 'border-border bg-card border-dashed',
              )}>
              <Text variant="small" className="text-muted-foreground" numberOfLines={1}>
                {ownerLabel(slot.owner)}
              </Text>
              <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                {slot.card?.name ?? 'Battlefield'}
              </Text>
              <Text
                numberOfLines={1}
                className={cn(
                  'text-sm font-medium',
                  slot.controller === 'me' && 'text-primary',
                  slot.controller === 'opponent' && 'text-destructive',
                  !slot.controller && 'text-muted-foreground',
                )}>
                {slot.controller ? `● ${playerName(slot.controller)}` : '○ Uncontrolled'}
              </Text>

              {choosing ? (
                <View className="gap-1.5 pt-1">
                  <Text className="text-xs text-muted-foreground">Who took it?</Text>
                  {(['me', 'opponent'] as const).map((actor) => (
                    <Pressable
                      key={actor}
                      onPress={() => handleChooseConqueror(slot.owner, actor)}
                      accessibilityRole="button"
                      className="min-h-10 items-center justify-center rounded-lg border border-border bg-background px-2 active:bg-accent">
                      <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
                        {playerName(actor)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text numberOfLines={2} className="text-xs text-muted-foreground">
                  {slot.conquerWarning ??
                    (conqueror ? `Tap: ${playerName(conqueror)} conquers +1` : 'Tap: record conquer')}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <Text className="text-center text-xs text-muted-foreground">
        Long-press a battlefield to fix control or record a draw
      </Text>

      {/* Long-press edit sheet */}
      <Modal
        visible={editSlot !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditSlot(null)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setEditSlot(null)}>
          <Pressable className="rounded-t-2xl bg-card" onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <Text className="text-lg font-semibold text-foreground" numberOfLines={1}>
                {editSlot?.card?.name ?? (editSlot ? ownerLabel(editSlot.owner) : '')}
              </Text>
              <Pressable
                onPress={() => setEditSlot(null)}
                className="rounded-full px-3 py-1"
                hitSlop={8}>
                <Text className="text-sm font-medium text-primary">Cancel</Text>
              </Pressable>
            </View>

            {editSlot ? (
              <View className="gap-4 px-4 py-4 pb-8">
                <View className="gap-1.5">
                  <Text className="text-sm font-medium text-muted-foreground">
                    Set control (no score)
                  </Text>
                  <View className="flex-row gap-2">
                    {([
                      { value: 'me' as PlayerRef | null, label: playerName('me') },
                      { value: 'opponent' as PlayerRef | null, label: playerName('opponent') },
                      { value: null, label: 'None' },
                    ]).map((option) => {
                      const selected = editSlot.controller === option.value;
                      return (
                        <Pressable
                          key={option.label}
                          onPress={() => {
                            haptic();
                            setEditSlot(null);
                            if (!selected) onSetControl(editSlot.owner, option.value);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          className={cn(
                            'min-h-11 flex-1 items-center justify-center rounded-lg border px-2',
                            selected
                              ? 'border-primary bg-primary/10'
                              : 'border-border bg-background active:bg-accent',
                          )}>
                          <Text
                            numberOfLines={1}
                            className={cn(
                              'text-sm font-semibold',
                              selected ? 'text-primary' : 'text-foreground',
                            )}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View className="gap-1.5">
                  <Text className="text-sm font-medium text-muted-foreground">
                    Drew instead of scoring
                  </Text>
                  <View className="flex-row gap-2">
                    {(['me', 'opponent'] as const).map((actor) => (
                      <Pressable
                        key={actor}
                        onPress={() => {
                          haptic();
                          setEditSlot(null);
                          onDrawInstead(editSlot.owner, actor);
                        }}
                        accessibilityRole="button"
                        className="min-h-11 flex-1 items-center justify-center rounded-lg border border-border bg-background px-2 active:bg-accent">
                        <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
                          {playerName(actor)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
