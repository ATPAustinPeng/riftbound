import { Text, View } from 'react-native';

import { evaluateGoal, type CollectionGoal } from '@/lib/queries';

interface PlaysetProgressProps {
  goal: CollectionGoal;
  owned: number;
  foil: number;
  canFoil: boolean;
  cardType?: string | null;
  compact?: boolean;
}

function ProgressBar({
  label,
  current,
  target,
  complete,
  compact,
}: {
  label: string;
  current: number;
  target: number;
  complete: boolean;
  compact: boolean;
}) {
  const capped = Math.min(current, target);
  const widthPct = target > 0 ? (capped / target) * 100 : 0;

  return (
    <View className={compact ? 'gap-0.5' : 'gap-1'}>
      {label ? (
        <Text
          className={
            compact
              ? 'text-xs font-medium text-neutral-500 dark:text-neutral-400'
              : 'text-sm font-medium text-neutral-700 dark:text-neutral-300'
          }>
          {label}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-2">
        <View className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <View
            className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-blue-500'}`}
            style={{ width: `${widthPct}%` }}
          />
        </View>
        <Text
          className={
            compact
              ? 'text-xs font-semibold text-neutral-700 dark:text-neutral-300'
              : 'text-sm font-semibold text-neutral-700 dark:text-neutral-300'
          }>
          {capped}/{target}
        </Text>
      </View>
    </View>
  );
}

export function PlaysetProgress({
  goal,
  owned,
  foil,
  canFoil,
  cardType,
  compact = false,
}: PlaysetProgressProps) {
  const evaluation = evaluateGoal(goal, owned, foil, canFoil, cardType);

  if (evaluation.untracked) {
    return (
      <Text
        className={
          compact
            ? 'text-xs text-neutral-500 dark:text-neutral-400'
            : 'text-sm text-neutral-500 dark:text-neutral-400'
        }>
        No playset limit
      </Text>
    );
  }

  if (evaluation.combined) {
    const total = owned + foil;
    return (
      <ProgressBar
        label="Goal"
        current={total}
        target={evaluation.target}
        complete={evaluation.complete}
        compact={compact}
      />
    );
  }

  return (
    <View className={compact ? 'gap-1.5' : 'gap-2'}>
      <ProgressBar
        label="Normal"
        current={owned}
        target={evaluation.target}
        complete={evaluation.normalComplete}
        compact={compact}
      />
      {canFoil && goal !== 'playset_normal' ? (
        <ProgressBar
          label="Foil"
          current={foil}
          target={evaluation.target}
          complete={evaluation.foilComplete}
          compact={compact}
        />
      ) : null}
    </View>
  );
}
