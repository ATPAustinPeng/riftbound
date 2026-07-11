import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ColumnSlider } from '@/components/ColumnSlider';
import {
  defaultCardFilters,
  SET_ORDER,
  type CardFilters,
  type CardsIndex,
  type ViewMode,
} from '@/lib/queries';

interface FilterBarProps {
  filters: CardFilters;
  onChange: (next: CardFilters) => void;
  index: CardsIndex;
  numColumns: number;
  onColumnsChange: (n: number) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  resultCount?: number;
}

function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <View className="h-9 flex-row overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700">
      {(['grid', 'list'] as ViewMode[]).map((mode) => (
        <Pressable
          key={mode}
          onPress={() => onChange(mode)}
          className={`h-full items-center justify-center px-3.5 ${
            viewMode === mode
              ? 'bg-blue-600'
              : 'bg-white active:bg-neutral-100 dark:bg-neutral-900 dark:active:bg-neutral-800'
          }`}>
          <Text
            className={`text-xs font-medium ${
              viewMode === mode ? 'text-white' : 'text-neutral-600 dark:text-neutral-300'
            }`}>
            {mode === 'grid' ? 'Grid' : 'List'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

type FilterKey = 'rarityId' | 'domainId' | 'cardType';

const FILTER_LABELS: Record<FilterKey, string> = {
  rarityId: 'Rarity',
  domainId: 'Domain',
  cardType: 'Type',
};

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-3 py-1.5 ${
        active
          ? 'border-blue-600 bg-blue-600 active:bg-blue-700'
          : 'border-neutral-300 bg-white active:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:active:bg-neutral-800'
      }`}>
      <Text
        className={`text-xs font-medium ${active ? 'text-white' : 'text-neutral-700 dark:text-neutral-300'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function SetTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="px-3 py-1.5 active:opacity-60">
      <Text
        className={`text-sm ${active ? 'font-bold text-neutral-900 dark:text-white' : 'font-medium text-neutral-500 dark:text-neutral-400'}`}>
        {label}
      </Text>
      {active ? <View className="mt-1 h-0.5 rounded-full bg-blue-600" /> : null}
    </Pressable>
  );
}

function SetTabs({
  sets,
  activeSetId,
  onSelect,
}: {
  sets: CardsIndex['sets'];
  activeSetId: string | null;
  onSelect: (setId: string | null) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <SetTab label="All" active={activeSetId === null} onPress={() => onSelect(null)} />
      {[...sets].sort((a, b) => (SET_ORDER[a.id] ?? 999) - (SET_ORDER[b.id] ?? 999)).map((set) => (
        <SetTab
          key={set.id}
          label={set.label}
          active={activeSetId === set.id}
          onPress={() => onSelect(set.id)}
        />
      ))}
    </ScrollView>
  );
}

export function FilterBar({
  filters,
  onChange,
  index,
  numColumns,
  onColumnsChange,
  viewMode,
  onViewModeChange,
  resultCount,
}: FilterBarProps) {
  const [expanded, setExpanded] = useState<FilterKey | null>(null);

  function toggleFilter(key: FilterKey, value: string | null) {
    onChange({ ...filters, [key]: filters[key] === value ? null : value });
    setExpanded(null);
  }

  function getOptions(key: FilterKey): Array<{ id: string; label: string } | string> {
    switch (key) {
      case 'rarityId':
        return index.rarities;
      case 'domainId':
        return index.domains;
      case 'cardType':
        return index.cardTypes;
    }
  }

  function getActiveLabel(key: FilterKey): string | null {
    const value = filters[key];
    if (!value) return null;
    const options = getOptions(key);
    if (key === 'cardType') {
      return value;
    }
    const match = (options as Array<{ id: string; label: string }>).find((o) => o.id === value);
    return match?.label ?? value;
  }

  const activeCount = [filters.rarityId, filters.domainId, filters.cardType].filter(
    Boolean,
  ).length;

  return (
    <View className="gap-2 border-b border-neutral-200 bg-white px-4 pb-2.5 pt-1 dark:border-neutral-800 dark:bg-neutral-950">
      <SetTabs
        sets={index.sets}
        activeSetId={filters.setId}
        onSelect={(setId) => onChange({ ...filters, setId })}
      />

      <View className="flex-row flex-wrap items-center gap-2">
        <TextInput
          value={filters.search}
          onChangeText={(search) => onChange({ ...filters, search })}
          placeholder="Search by name…"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          className="h-9 min-w-[160px] max-w-xs flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        />
        <ViewToggle viewMode={viewMode} onChange={onViewModeChange} />
        {viewMode === 'grid' ? (
          <View className="flex-row items-center gap-1.5">
            <ColumnSlider value={numColumns} min={3} max={8} onChange={onColumnsChange} width={96} />
            <Text className="w-3 text-xs font-semibold tabular-nums text-neutral-700 dark:text-neutral-300">
              {numColumns}
            </Text>
          </View>
        ) : null}
        <FilterChip
          label={activeCount > 0 ? `Filters (${activeCount})` : 'Filters'}
          active={expanded !== null || activeCount > 0}
          onPress={() => setExpanded(expanded ? null : 'rarityId')}
        />
        {(['rarityId', 'domainId', 'cardType'] as FilterKey[]).map((key) => {
          const activeLabel = getActiveLabel(key);
          if (!activeLabel) return null;
          return (
            <FilterChip
              key={key}
              label={`${FILTER_LABELS[key]}: ${activeLabel}`}
              active
              onPress={() => onChange({ ...filters, [key]: null })}
            />
          );
        })}
        {activeCount > 0 ? (
          <FilterChip
            label="Clear all"
            active={false}
            onPress={() =>
              onChange({
                ...defaultCardFilters,
                search: filters.search,
                setId: filters.setId,
              })
            }
          />
        ) : null}
        {resultCount != null ? (
          <Text className="ml-auto text-xs tabular-nums text-neutral-400 dark:text-neutral-500">
            {resultCount} card{resultCount === 1 ? '' : 's'}
          </Text>
        ) : null}
      </View>

      {expanded ? (
        <View className="gap-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {(['rarityId', 'domainId', 'cardType'] as FilterKey[]).map((key) => (
              <FilterChip
                key={key}
                label={FILTER_LABELS[key]}
                active={expanded === key}
                onPress={() => setExpanded(key)}
              />
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {expanded === 'cardType'
              ? index.cardTypes.map((type) => (
                  <FilterChip
                    key={type}
                    label={type}
                    active={filters.cardType === type}
                    onPress={() => toggleFilter('cardType', type)}
                  />
                ))
              : (getOptions(expanded) as Array<{ id: string; label: string }>).map((option) => (
                  <FilterChip
                    key={option.id}
                    label={option.label}
                    active={filters[expanded] === option.id}
                    onPress={() => toggleFilter(expanded, option.id)}
                  />
                ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export { defaultCardFilters };
