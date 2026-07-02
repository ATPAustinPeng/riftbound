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
}

type FilterKey = 'rarityId' | 'domainId' | 'cardType' | 'superType';

const FILTER_LABELS: Record<FilterKey, string> = {
  rarityId: 'Rarity',
  domainId: 'Domain',
  cardType: 'Type',
  superType: 'Super type',
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
          ? 'border-blue-600 bg-blue-600'
          : 'border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900'
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
    <Pressable onPress={onPress} className="px-3 py-2">
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
      case 'superType':
        return index.superTypes;
    }
  }

  function getActiveLabel(key: FilterKey): string | null {
    const value = filters[key];
    if (!value) return null;
    const options = getOptions(key);
    if (key === 'cardType' || key === 'superType') {
      return value;
    }
    const match = (options as Array<{ id: string; label: string }>).find((o) => o.id === value);
    return match?.label ?? value;
  }

  const activeCount = [filters.rarityId, filters.domainId, filters.cardType, filters.superType].filter(
    Boolean,
  ).length;

  return (
    <View className="gap-3 border-b border-neutral-200 bg-white px-4 pb-3 pt-2 dark:border-neutral-800 dark:bg-neutral-950">
      <SetTabs
        sets={index.sets}
        activeSetId={filters.setId}
        onSelect={(setId) => onChange({ ...filters, setId })}
      />

      <TextInput
        value={filters.search}
        onChangeText={(search) => onChange({ ...filters, search })}
        placeholder="Search by name…"
        placeholderTextColor="#9ca3af"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
      />

      <View className="gap-2">
        {viewMode === 'grid' ? (
          <View className="flex-row items-center gap-3">
            <Text className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Columns
            </Text>
            <ColumnSlider value={numColumns} min={3} max={8} onChange={onColumnsChange} />
            <Text className="w-4 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              {numColumns}
            </Text>
          </View>
        ) : null}
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Sort</Text>
          <FilterChip
            label="By Set"
            active={filters.sortBy === 'set'}
            onPress={() => onChange({ ...filters, sortBy: 'set' })}
          />
          <FilterChip
            label="By Color"
            active={filters.sortBy === 'color'}
            onPress={() => onChange({ ...filters, sortBy: 'color' })}
          />
          <FilterChip
            label="By Name"
            active={filters.sortBy === 'name'}
            onPress={() => onChange({ ...filters, sortBy: 'name' })}
          />
          <Text className="text-xs font-medium text-neutral-500 dark:text-neutral-400">View</Text>
          <FilterChip
            label="Grid"
            active={viewMode === 'grid'}
            onPress={() => onViewModeChange('grid')}
          />
          <FilterChip
            label="List"
            active={viewMode === 'list'}
            onPress={() => onViewModeChange('list')}
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        <FilterChip
          label={activeCount > 0 ? `Filters (${activeCount})` : 'Filters'}
          active={expanded !== null || activeCount > 0}
          onPress={() => setExpanded(expanded ? null : 'rarityId')}
        />
        {(['rarityId', 'domainId', 'cardType', 'superType'] as FilterKey[]).map((key) => {
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
                sortBy: filters.sortBy,
                setId: filters.setId,
              })
            }
          />
        ) : null}
      </ScrollView>

      {expanded ? (
        <View className="gap-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {(['rarityId', 'domainId', 'cardType', 'superType'] as FilterKey[]).map((key) => (
              <FilterChip
                key={key}
                label={FILTER_LABELS[key]}
                active={expanded === key}
                onPress={() => setExpanded(key)}
              />
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {expanded === 'cardType' || expanded === 'superType'
              ? (getOptions(expanded) as string[]).map((type) => (
                  <FilterChip
                    key={type}
                    label={type}
                    active={filters[expanded] === type}
                    onPress={() => toggleFilter(expanded, type)}
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
