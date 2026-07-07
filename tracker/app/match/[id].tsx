import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, View } from 'react-native';

import {
  BattlefieldBoard,
  BattlefieldPicker,
  EventLog,
  HoldPrompt,
  MulliganSelector,
  ScoreBoard,
  TurnBar,
} from '@/components/match';
import { QtyStepper } from '@/components/QtyStepper';
import {
  abandonMatch,
  advanceTurn,
  appendEvent,
  clearActiveMatch,
  countGameWins,
  deriveCurrentGameState,
  endGame,
  endMatch,
  getActiveMatchState,
  getCurrentGame,
  hasDirtyWork,
  startGame,
  undoLastEvent,
  useMatchStore,
  type ActiveMatchState,
} from '@/lib/match-store';
import { retrySync, setSummaryScreenVisible, syncNow } from '@/lib/match-sync';
import { getBattlefieldOptions, useCardsIndex, useMatchDetailQuery } from '@/lib/queries';
import {
  baseTargetScore,
  conquerOutcome,
  deriveGameState,
  holdableSlots,
  usedBattlefieldIds,
} from '@/lib/score-engine';
import type { Card, GameWinner, MatchGameWithEvents, PlayerRef } from '@/lib/types';
import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

const CONTROL_ONLY_HINT = 'Already scored here this turn — tap flips control only';
const FINAL_POINT_HINT =
  'Final point: tap records a draw — score on both battlefields this turn to win';

/* ------------------------------------------------------------------ */
/* Cross-platform confirm (Alert.alert is a no-op on react-native-web) */
/* ------------------------------------------------------------------ */

function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
  destructive = false,
  onCancel?: () => void,
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    else onCancel?.();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: onCancel },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

function PillRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (next: T) => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-muted-foreground">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={cn(
                'rounded-full border px-4 py-2',
                selected
                  ? 'border-primary bg-primary active:bg-primary/90'
                  : 'border-border bg-card active:bg-accent',
              )}>
              <Text
                className={cn(
                  'text-sm font-semibold',
                  selected ? 'text-primary-foreground' : 'text-foreground',
                )}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** "Unsynced — retry" affordance: shown while anything is dirty or the last sync failed. */
function SyncBanner({ state }: { state: ActiveMatchState }) {
  if (!hasDirtyWork(state) && !state.sync.lastError) return null;
  return (
    <Pressable
      onPress={() => retrySync()}
      className="flex-row items-center justify-between rounded-lg border border-border bg-muted px-3 py-2 active:opacity-70">
      <Text variant="small" className="flex-1 text-muted-foreground" numberOfLines={1}>
        Unsynced — some changes have not reached the server yet
      </Text>
      <Text className="text-xs font-semibold text-primary">Retry</Text>
    </Pressable>
  );
}

function winnerLabel(winner: GameWinner | null): string {
  if (winner === 'me') return 'Won';
  if (winner === 'opponent') return 'Lost';
  if (winner === 'draw') return 'Draw';
  return '—';
}

function useCardById(): { cards: Card[]; cardById: Map<string, Card>; isLoading: boolean } {
  const cardsQuery = useCardsIndex();
  const cards = cardsQuery.data?.cards;
  const cardById = useMemo(() => {
    const map = new Map<string, Card>();
    for (const card of cards ?? []) map.set(card.id, card);
    return map;
  }, [cards]);
  return { cards: cards ?? [], cardById, isLoading: cardsQuery.isLoading };
}

/* ------------------------------------------------------------------ */
/* Route entry: live flow when the store owns this match id            */
/* ------------------------------------------------------------------ */

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isHydrated, state } = useMatchStore();

  if (!isHydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (state && id && state.match.id === id) {
    return <LiveMatchScreen state={state} />;
  }

  return <CompletedMatchScreen matchId={id} />;
}

/* ------------------------------------------------------------------ */
/* Live flow (phase machine)                                           */
/* ------------------------------------------------------------------ */

function LiveMatchScreen({ state }: { state: ActiveMatchState }) {
  const { cards, cardById } = useCardById();
  // game_summary offers "Set up game N"; that flips this local flag to render
  // the setup form (startGame then moves the store phase to 'live').
  const [setupRequested, setSetupRequested] = useState(false);

  useEffect(() => {
    if (state.phase !== 'game_summary') setSetupRequested(false);
  }, [state.phase]);

  const myName = state.match.my_legend_card_id
    ? (cardById.get(state.match.my_legend_card_id)?.name ?? 'Me')
    : 'Me';
  const opponentName = state.match.opponent_legend_card_id
    ? (cardById.get(state.match.opponent_legend_card_id)?.name ?? 'Opponent')
    : 'Opponent';

  const nextGameNumber = state.games.length + 1;

  let body: React.ReactNode;
  switch (state.phase) {
    case 'game_setup':
      body = <GameSetup key={nextGameNumber} state={state} cards={cards} />;
      break;
    case 'live':
      body = (
        <LiveGame state={state} cardById={cardById} myName={myName} opponentName={opponentName} />
      );
      break;
    case 'game_summary':
      body = setupRequested ? (
        <GameSetup key={nextGameNumber} state={state} cards={cards} />
      ) : (
        <GameSummary state={state} onSetupNext={() => setSetupRequested(true)} />
      );
      break;
    case 'match_summary':
      body = <MatchSummary state={state} myName={myName} opponentName={opponentName} />;
      break;
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 pb-12 pt-4"
      keyboardShouldPersistTaps="handled">
      <SyncBanner state={state} />
      {body}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Phase: game_setup                                                   */
/* ------------------------------------------------------------------ */

function GameSetup({ state, cards }: { state: ActiveMatchState; cards: Card[] }) {
  const gameNumber = state.games.length + 1;
  const base = baseTargetScore(state.match.game_mode);
  const previousGame = state.games[state.games.length - 1] ?? null;

  const [myBattlefield, setMyBattlefield] = useState<Card | null>(null);
  const [opponentBattlefield, setOpponentBattlefield] = useState<Card | null>(null);
  const [myMulligans, setMyMulligans] = useState<number | null>(null);
  const [opponentMulligans, setOpponentMulligans] = useState<number | null>(null);
  const [targetScore, setTargetScore] = useState(base);
  const [sideNotes, setSideNotes] = useState('');
  const [startingPlayer, setStartingPlayer] = useState<PlayerRef | null>(
    state.pendingStartingPlayer ?? previousGame?.starting_player ?? null,
  );

  const battlefieldOptions = useMemo(() => getBattlefieldOptions(cards), [cards]);
  const used = useMemo(() => usedBattlefieldIds(state.games), [state.games]);
  const isBo3 = state.match.format === 'bo3';

  function usedReason(side: PlayerRef) {
    if (!isBo3) return undefined;
    return (card: Card): string | undefined => {
      if (!used[side].has(card.id)) return undefined;
      const key = side === 'me' ? 'my_battlefield_card_id' : 'opponent_battlefield_card_id';
      const game = state.games.find((g) => g.status !== 'abandoned' && g[key] === card.id);
      return game ? `Used G${game.game_number}` : 'Already used';
    };
  }

  function handleStartGame() {
    if (!startingPlayer) return; // button is disabled; defensive
    startGame({
      startingPlayer,
      targetScore,
      myBattlefieldCardId: myBattlefield?.id ?? null,
      opponentBattlefieldCardId: opponentBattlefield?.id ?? null,
      myMulliganCount: myMulligans,
      opponentMulliganCount: opponentMulligans,
      sideNotes: gameNumber >= 2 ? sideNotes.trim() || null : null,
    });
  }

  return (
    <View className="gap-5">
      <Text className="text-2xl font-bold text-foreground">Game {gameNumber}</Text>

      <BattlefieldPicker
        label="My battlefield"
        cards={battlefieldOptions}
        selectedCard={myBattlefield}
        onSelect={setMyBattlefield}
        disabledReason={usedReason('me')}
      />
      <BattlefieldPicker
        label="Opponent battlefield"
        cards={battlefieldOptions}
        selectedCard={opponentBattlefield}
        onSelect={setOpponentBattlefield}
        disabledReason={usedReason('opponent')}
      />

      <MulliganSelector label="My mulligan" value={myMulligans} onChange={setMyMulligans} />
      <MulliganSelector
        label="Opponent mulligan"
        value={opponentMulligans}
        onChange={setOpponentMulligans}
      />

      <View className="flex-row items-end justify-between">
        <QtyStepper
          label="Target score"
          value={targetScore}
          onChange={setTargetScore}
          min={base}
          max={base + 4}
        />
        <Text variant="small" className="mb-1 flex-1 pl-4 text-muted-foreground">
          Base {base}; +1 per battlefield that raises the win target.
        </Text>
      </View>

      {gameNumber >= 2 ? (
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-muted-foreground">Side in/out notes</Text>
          <Input
            value={sideNotes}
            onChangeText={setSideNotes}
            placeholder="e.g. -2 Deny, +2 Vanguard Lookout"
            multiline
            className="min-h-[64px] py-2"
          />
        </View>
      ) : null}

      <PillRow<PlayerRef>
        label="Starting player"
        options={[
          { value: 'me', label: 'Me' },
          { value: 'opponent', label: 'Opponent' },
        ]}
        value={startingPlayer}
        onChange={setStartingPlayer}
      />

      <Button size="lg" disabled={!startingPlayer} onPress={handleStartGame}>
        <Text>Start Game</Text>
      </Button>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Phase: live                                                         */
/* ------------------------------------------------------------------ */

function LiveGame({
  state,
  cardById,
  myName,
  opponentName,
}: {
  state: ActiveMatchState;
  cardById: Map<string, Card>;
  myName: string;
  opponentName: string;
}) {
  const router = useRouter();
  const game = getCurrentGame(state);
  const events = game ? (state.eventsByGameId[game.id] ?? []) : [];
  const targetScore = game?.target_score ?? 0;

  const derived = useMemo(() => deriveGameState(events, targetScore), [events, targetScore]);

  const [effectFor, setEffectFor] = useState<PlayerRef | null>(null);
  const [effectPoints, setEffectPoints] = useState(1);
  const [endSheetOpen, setEndSheetOpen] = useState(false);

  const slotCards = useMemo<Record<PlayerRef, Card | null>>(
    () => ({
      me: game?.my_battlefield_card_id
        ? (cardById.get(game.my_battlefield_card_id) ?? null)
        : null,
      opponent: game?.opponent_battlefield_card_id
        ? (cardById.get(game.opponent_battlefield_card_id) ?? null)
        : null,
    }),
    [game?.my_battlefield_card_id, game?.opponent_battlefield_card_id, cardById],
  );

  if (!game) return null;

  const playerName = (player: PlayerRef) => (player === 'me' ? myName : opponentName);

  // Scoring rules key on the battlefield SLOT (whose battlefield it is),
  // never the card id — both players can bring the same card. Non-scoring
  // tap outcomes (once-per-turn control flip, final-point draw) are hinted
  // preemptively on the tile so nothing happens by surprise.
  const boardSlots = (['me', 'opponent'] as const).map((owner) => {
    const controller = derived.controlBySlot[owner];
    const conqueror = controller ? (controller === 'me' ? 'opponent' : 'me') : null;
    const outcome = conqueror ? conquerOutcome(derived, conqueror, owner, targetScore) : null;
    return {
      card: slotCards[owner],
      owner,
      controller,
      conquerWarning:
        outcome === 'control_only'
          ? CONTROL_ONLY_HINT
          : outcome === 'draw'
            ? FINAL_POINT_HINT
            : undefined,
    };
  });

  /** After a score event: offer to end the game once someone reaches target. */
  function maybePromptGameEnd() {
    const current = deriveCurrentGameState();
    if (!current?.isOver) return;
    const winner: GameWinner =
      current.myScore > current.opponentScore
        ? 'me'
        : current.opponentScore > current.myScore
          ? 'opponent'
          : 'draw';
    const leader = winner === 'me' ? myName : winner === 'opponent' ? opponentName : 'Both players';
    confirmAction(
      'End game?',
      `${leader} reached ${targetScore} points (${current.myScore}–${current.opponentScore}).`,
      'End game',
      () => endGame(winner),
    );
  }

  /**
   * A tile tap: `actor` conquered the slot's battlefield. The engine decides
   * the outcome (see `conquerOutcome`): score +1, a final-point-rule draw
   * (control still flips), or — when this slot's once-per-turn score is
   * already used — a control flip with no point and no draw. All automatic;
   * the tile hints the non-scoring outcomes before the tap.
   */
  function handleConquer(slot: PlayerRef, actor: PlayerRef) {
    const cardId = slotCards[slot]?.id ?? null;

    const flipControl = () =>
      appendEvent({
        actor: 'system',
        eventType: 'control_change',
        battlefieldCardId: cardId,
        payload: { battlefield_owner: slot, new_controller: actor },
      });

    switch (conquerOutcome(derived, actor, slot, targetScore)) {
      case 'control_only':
        flipControl();
        return;
      case 'draw':
        appendEvent({
          actor,
          eventType: 'draw_instead',
          battlefieldCardId: cardId,
          payload: { reason: 'final_point_rule', battlefield_owner: slot },
        });
        flipControl();
        return;
      case 'score':
        appendEvent({
          actor,
          eventType: 'score_conquer',
          battlefieldCardId: cardId,
          points: 1,
          payload: { battlefield_owner: slot },
        });
        maybePromptGameEnd();
    }
  }

  /** Long-press correction: set a slot's controller without scoring. */
  function handleSetControl(slot: PlayerRef, controller: PlayerRef | null) {
    appendEvent({
      actor: 'system',
      eventType: 'control_change',
      battlefieldCardId: slotCards[slot]?.id ?? null,
      payload: { battlefield_owner: slot, new_controller: controller },
    });
  }

  /** Long-press manual "drew instead of scoring" at a slot. */
  function handleDrawInstead(slot: PlayerRef, actor: PlayerRef) {
    appendEvent({
      actor,
      eventType: 'draw_instead',
      battlefieldCardId: slotCards[slot]?.id ?? null,
      payload: { reason: 'other', battlefield_owner: slot },
    });
  }

  // Turn-start hold prompt: shown until the active player resolves holds this
  // turn. Holding may legally score the final point, so no confirm is needed.
  const holdSlots = holdableSlots(derived);
  const showHoldPrompt = !derived.holdDecidedThisTurn && holdSlots.length > 0;

  function handleScoreHolds() {
    if (!derived.activePlayer) return;
    for (const slot of holdSlots) {
      appendEvent({
        actor: derived.activePlayer,
        eventType: 'score_hold',
        battlefieldCardId: slotCards[slot]?.id ?? null,
        points: 1,
        payload: { battlefield_owner: slot, via: 'turn_start_prompt' },
      });
    }
    maybePromptGameEnd();
  }

  function handleSkipHolds() {
    if (!derived.activePlayer) return;
    appendEvent({
      actor: derived.activePlayer,
      eventType: 'hold_skipped',
      payload: { slots: holdSlots },
    });
  }

  function handleEffectTap(actor: PlayerRef) {
    appendEvent({ actor, eventType: 'score_effect', battlefieldCardId: null, points: 1 });
    maybePromptGameEnd();
  }

  /** Fix: reset points every time the effect sheet OPENS, not only on submit. */
  function openEffectSheet(actor: PlayerRef) {
    setEffectPoints(1);
    setEffectFor(actor);
  }

  function handleEffectSubmit() {
    if (!effectFor) return;
    appendEvent({
      actor: effectFor,
      eventType: 'score_effect',
      battlefieldCardId: null,
      points: effectPoints,
    });
    setEffectFor(null);
    setEffectPoints(1);
    maybePromptGameEnd();
  }

  const canUndo = events.some(
    (event) => event.event_type !== 'undo' && !derived.undoneEventIds.has(event.id),
  );

  return (
    <View className="gap-4">
      <Text variant="small" className="text-center text-muted-foreground">
        Game {game.game_number} · {state.match.format.toUpperCase()}
      </Text>

      <ScoreBoard
        myScore={derived.myScore}
        opponentScore={derived.opponentScore}
        targetScore={targetScore}
        myName={myName}
        opponentName={opponentName}
        onEffect={handleEffectTap}
        onEffectLongPress={openEffectSheet}
      />

      <TurnBar
        turnNumber={derived.turnNumber}
        activePlayer={derived.activePlayer}
        onNextTurn={() => advanceTurn()}
      />

      {showHoldPrompt && derived.activePlayer ? (
        <HoldPrompt
          activePlayerName={playerName(derived.activePlayer)}
          battlefieldNames={holdSlots.map(
            (slot) =>
              slotCards[slot]?.name ??
              (slot === 'me' ? 'my battlefield' : "opponent's battlefield"),
          )}
          onScore={handleScoreHolds}
          onSkip={handleSkipHolds}
        />
      ) : null}

      <BattlefieldBoard
        slots={boardSlots}
        playerName={playerName}
        onConquer={handleConquer}
        onSetControl={handleSetControl}
        onDrawInstead={handleDrawInstead}
      />

      <EventLog
        events={events}
        undoneEventIds={derived.undoneEventIds}
        cardNameById={(id) => cardById.get(id)?.name}
        onUndo={() => undoLastEvent()}
        canUndo={canUndo}
      />

      <View className="flex-row gap-3 pt-2">
        <Button variant="outline" className="flex-1" onPress={() => setEndSheetOpen(true)}>
          <Text>End game</Text>
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onPress={() =>
            confirmAction(
              'Abandon match?',
              'The match is marked abandoned and live tracking stops.',
              'Abandon',
              () => {
                abandonMatch();
                // Leave immediately so the user never sees the screen swap
                // to the summary/read-only view.
                if (router.canGoBack()) router.back();
                else router.replace('/(tabs)/scores');
              },
              true,
            )
          }>
          <Text>Abandon match</Text>
        </Button>
      </View>

      {/* Effect points sheet (long-press on +1 Effect) */}
      <Modal
        visible={effectFor !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEffectFor(null)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setEffectFor(null)}>
          <Pressable className="rounded-t-2xl bg-card" onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <Text className="text-lg font-semibold text-foreground">
                Score from effect — {effectFor === 'me' ? myName : opponentName}
              </Text>
              <Pressable onPress={() => setEffectFor(null)} className="rounded-full px-3 py-1" hitSlop={8}>
                <Text className="text-sm font-medium text-primary">Cancel</Text>
              </Pressable>
            </View>
            <View className="gap-4 px-4 py-4 pb-8">
              <QtyStepper label="Points" value={effectPoints} onChange={setEffectPoints} min={1} max={8} />
              <Button size="lg" onPress={handleEffectSubmit}>
                <Text>Add {effectPoints} point{effectPoints === 1 ? '' : 's'}</Text>
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Manual end-game winner sheet (3 options; Alert can't do this on web) */}
      <Modal
        visible={endSheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setEndSheetOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setEndSheetOpen(false)}>
          <Pressable className="rounded-t-2xl bg-card" onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <Text className="text-lg font-semibold text-foreground">Who won the game?</Text>
              <Pressable
                onPress={() => setEndSheetOpen(false)}
                className="rounded-full px-3 py-1"
                hitSlop={8}>
                <Text className="text-sm font-medium text-primary">Cancel</Text>
              </Pressable>
            </View>
            <View className="gap-2 px-4 py-3 pb-8">
              {(
                [
                  { winner: 'me', label: myName },
                  { winner: 'opponent', label: opponentName },
                  { winner: 'draw', label: 'Draw' },
                ] as Array<{ winner: GameWinner; label: string }>
              ).map((option) => (
                <Pressable
                  key={option.winner}
                  onPress={() => {
                    setEndSheetOpen(false);
                    endGame(option.winner);
                  }}
                  className="min-h-14 items-center justify-center rounded-xl border border-border bg-background px-4 py-2 active:bg-accent">
                  <Text className="text-base font-semibold text-foreground">{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Phase: game_summary                                                 */
/* ------------------------------------------------------------------ */

function GameSummary({ state, onSetupNext }: { state: ActiveMatchState; onSetupNext: () => void }) {
  const lastGame = state.games[state.games.length - 1];
  const wins = countGameWins(state.games);
  const nextGameNumber = state.games.length + 1;

  const resultText = lastGame
    ? lastGame.winner === 'me'
      ? `You won game ${lastGame.game_number}`
      : lastGame.winner === 'opponent'
        ? `You lost game ${lastGame.game_number}`
        : `Game ${lastGame.game_number} was a draw`
    : 'Game complete';

  return (
    <View className="gap-5">
      <View className="items-center gap-1 rounded-xl border border-border bg-card p-6">
        <Text className="text-xl font-bold text-foreground">{resultText}</Text>
        {lastGame ? (
          <Text className="text-4xl font-bold text-foreground">
            {lastGame.my_score}–{lastGame.opponent_score}
          </Text>
        ) : null}
        <Text variant="small" className="text-muted-foreground">
          Match score {wins.me}–{wins.opponent}
          {wins.draws > 0 ? ` (${wins.draws} draw${wins.draws === 1 ? '' : 's'})` : ''}
        </Text>
      </View>

      <Button size="lg" onPress={onSetupNext}>
        <Text>Set up game {nextGameNumber}</Text>
      </Button>
      <Button
        variant="outline"
        onPress={() =>
          confirmAction(
            'End match now?',
            'The match result is recorded from the games played so far.',
            'End match',
            () => endMatch(),
          )
        }>
        <Text>End Match</Text>
      </Button>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Phase: match_summary                                                */
/* ------------------------------------------------------------------ */

function MatchSummary({
  state,
  myName,
  opponentName,
}: {
  state: ActiveMatchState;
  myName: string;
  opponentName: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(state.match.notes ?? '');

  // While this summary is mounted, background flushes must not clear the
  // slot out from under it; Done owns the clear (see finalizeIfDone).
  useEffect(() => {
    setSummaryScreenVisible(true);
    return () => setSummaryScreenVisible(false);
  }, []);

  const wins = countGameWins(state.games);
  const abandoned = state.match.status === 'abandoned';
  const alreadyEnded = state.match.status !== 'in_progress';

  const title = abandoned
    ? 'Match abandoned'
    : wins.me > wins.opponent
      ? 'You won the match'
      : wins.opponent > wins.me
        ? 'You lost the match'
        : 'Match drawn';

  async function handleDone() {
    if (!alreadyEnded) {
      endMatch(notes.trim() || undefined); // kicks off the final flush
    }
    // Best-effort final flush before dropping the local slot (finalizeIfDone
    // never clears while this summary is showing — Done owns the clear).
    // Awaiting (rather than clearing right after endMatch) matters: the flush
    // reads the live store, so clearing first would drop the final rows.
    try {
      await syncNow();
    } catch {
      // syncNow never throws; belt and braces.
    }
    // Only drop the local slot once everything reached the server; otherwise
    // keep it so the focus/hydrate retries can flush later (the scores tab
    // banner remains as the way back into this summary).
    const current = getActiveMatchState();
    if (!current || !hasDirtyWork(current)) {
      clearActiveMatch();
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/scores');
  }

  return (
    <View className="gap-5">
      <View className="items-center gap-1 rounded-xl border border-border bg-card p-6">
        <Text className="text-xl font-bold text-foreground">{title}</Text>
        <Text className="text-4xl font-bold text-foreground">
          {wins.me}–{wins.opponent}
        </Text>
        <Text variant="small" className="text-muted-foreground" numberOfLines={1}>
          {myName} vs {opponentName} · {state.match.format.toUpperCase()}
        </Text>
      </View>

      <View className="gap-2 rounded-xl border border-border bg-card p-4">
        <Text className="text-sm font-semibold text-foreground">Games</Text>
        {state.games.map((game) => (
          <View key={game.id} className="flex-row items-center justify-between py-1">
            <Text className="text-sm text-foreground">Game {game.game_number}</Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-semibold text-foreground">
                {game.my_score}–{game.opponent_score}
              </Text>
              <Badge
                variant={
                  game.winner === 'me'
                    ? 'default'
                    : game.winner === 'opponent'
                      ? 'destructive'
                      : 'secondary'
                }>
                <Text>{game.status === 'abandoned' ? 'Abandoned' : winnerLabel(game.winner)}</Text>
              </Badge>
            </View>
          </View>
        ))}
        {state.games.length === 0 ? (
          <Text variant="small" className="text-muted-foreground">
            No games played
          </Text>
        ) : null}
      </View>

      {!abandoned ? (
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-muted-foreground">Match notes</Text>
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything worth remembering about this match…"
            multiline
            className="min-h-[80px] py-2"
            editable={!alreadyEnded}
          />
        </View>
      ) : null}

      <Button size="lg" onPress={() => void handleDone()}>
        <Text>Done</Text>
      </Button>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Read-only completed-match view                                      */
/* ------------------------------------------------------------------ */

function CompletedMatchScreen({ matchId }: { matchId: string | undefined }) {
  const detailQuery = useMatchDetailQuery(matchId);
  const { cardById, isLoading: cardsLoading } = useCardById();

  if (detailQuery.isLoading || cardsLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (detailQuery.isError) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-center text-destructive">Could not load this match.</Text>
        <Button variant="outline" onPress={() => void detailQuery.refetch()}>
          <Text>{detailQuery.isRefetching ? 'Retrying…' : 'Tap to retry'}</Text>
        </Button>
      </View>
    );
  }

  const detail = detailQuery.data;
  if (!detail) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text variant="muted" className="text-center text-base">
          Match not found.
        </Text>
      </View>
    );
  }

  const { match, games } = detail;
  const cardName = (id: string | null) => (id ? (cardById.get(id)?.name ?? null) : null);
  const myName = cardName(match.my_legend_card_id) ?? match.my_deck_name ?? 'Me';
  const opponentName = cardName(match.opponent_legend_card_id) ?? match.opponent_deck_name ?? 'Unknown';

  const resultBadge =
    match.status === 'abandoned'
      ? { variant: 'secondary' as const, label: 'Abandoned' }
      : match.result === 'win'
        ? { variant: 'default' as const, label: 'Win' }
        : match.result === 'loss'
          ? { variant: 'destructive' as const, label: 'Loss' }
          : match.result === 'draw'
            ? { variant: 'secondary' as const, label: 'Draw' }
            : { variant: 'outline' as const, label: 'In progress' };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 px-4 pb-12 pt-4">
      <View className="gap-2">
        <Text className="text-2xl font-bold text-foreground">
          {myName} vs {opponentName}
        </Text>
        <View className="flex-row items-center gap-2">
          <Badge variant="outline">
            <Text>{match.format.toUpperCase()}</Text>
          </Badge>
          <Badge variant={resultBadge.variant}>
            <Text>{resultBadge.label}</Text>
          </Badge>
          <Text variant="small" className="text-muted-foreground">
            {new Date(match.started_at).toLocaleDateString()}
          </Text>
        </View>
        {match.notes ? (
          <Text className="text-sm text-muted-foreground">{match.notes}</Text>
        ) : null}
      </View>

      {games.length === 0 ? (
        <Text variant="muted" className="py-8 text-center text-base">
          No games recorded for this match.
        </Text>
      ) : (
        games.map((game) => (
          <ReadOnlyGameCard key={game.id} game={game} cardById={cardById} />
        ))
      )}
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row justify-between gap-3 py-1">
      <Text variant="small" className="text-muted-foreground">
        {label}
      </Text>
      <Text className="flex-1 text-right text-sm font-medium text-foreground" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function formatMulligan(count: number | null): string | null {
  if (count === null) return null;
  return count === 0 ? 'Kept' : `Set aside ${count}`;
}

function ReadOnlyGameCard({
  game,
  cardById,
}: {
  game: MatchGameWithEvents;
  cardById: Map<string, Card>;
}) {
  const [expanded, setExpanded] = useState(false);

  const undoneEventIds = useMemo(
    () => deriveGameState(game.events, game.target_score).undoneEventIds,
    [game.events, game.target_score],
  );

  const cardName = (id: string | null) => (id ? (cardById.get(id)?.name ?? null) : null);

  return (
    <View className="gap-1 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-foreground">Game {game.game_number}</Text>
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-bold text-foreground">
            {game.my_score}–{game.opponent_score}
          </Text>
          <Badge
            variant={
              game.status === 'abandoned'
                ? 'outline'
                : game.winner === 'me'
                  ? 'default'
                  : game.winner === 'opponent'
                    ? 'destructive'
                    : 'secondary'
            }>
            <Text>{game.status === 'abandoned' ? 'Abandoned' : winnerLabel(game.winner)}</Text>
          </Badge>
        </View>
      </View>

      <DetailRow label="Target score" value={`First to ${game.target_score}`} />
      <DetailRow
        label="Starting player"
        value={game.starting_player === 'me' ? 'Me' : game.starting_player === 'opponent' ? 'Opponent' : null}
      />
      <DetailRow label="My battlefield" value={cardName(game.my_battlefield_card_id)} />
      <DetailRow label="Opponent battlefield" value={cardName(game.opponent_battlefield_card_id)} />
      <DetailRow label="My mulligan" value={formatMulligan(game.my_mulligan_count)} />
      <DetailRow label="Opponent mulligan" value={formatMulligan(game.opponent_mulligan_count)} />
      <DetailRow label="Side notes" value={game.side_notes} />

      <Pressable onPress={() => setExpanded((prev) => !prev)} className="py-2 active:opacity-70">
        <Text className="text-sm font-semibold text-primary">
          {expanded ? 'Hide event log' : `Show event log (${game.events.length})`}
        </Text>
      </Pressable>

      {expanded ? (
        <EventLog
          events={game.events}
          undoneEventIds={undoneEventIds}
          cardNameById={(id) => cardById.get(id)?.name}
          onUndo={() => {}}
          canUndo={false}
        />
      ) : null}
    </View>
  );
}
