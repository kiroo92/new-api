/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  LoadingSkeleton,
  EmptyState,
  SearchBar,
  PricingTable,
  PricingSidebar,
  PricingToolbar,
  ModelCardGrid,
  ModelDetailsDrawer,
} from './components'
import { PricingOverview } from './components/pricing-overview'
import { EXCLUDED_GROUPS, VIEW_MODES } from './constants'
import { useFilters } from './hooks/use-filters'
import { usePricingData } from './hooks/use-pricing-data'

export function Pricing() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/pricing/' })
  const navigate = useNavigate({ from: '/pricing/' })
  // Existing model-square links with filters keep their original destination.
  const section =
    search.section ??
    (Object.values(search).some((value) => value !== undefined)
      ? 'models'
      : 'overview')
  const changeSection = (value: 'overview' | 'models') => {
    void navigate({ search: (previous) => ({ ...previous, section: value }) })
  }
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )

  const {
    models,
    vendors,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    routingGroups,
    isLoading,
    error,
    refetch,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const {
    searchInput,
    sortBy,
    vendorFilter,
    groupFilter,
    quotaTypeFilter,
    endpointTypeFilter,
    tagFilter,
    tokenUnit,
    viewMode,
    showRechargePrice,
    setSearchInput,
    setSortBy,
    setVendorFilter,
    setGroupFilter,
    setQuotaTypeFilter,
    setEndpointTypeFilter,
    setTagFilter,
    setTokenUnit,
    setViewMode,
    setShowRechargePrice,
    filteredModels,
    hasActiveFilters,
    activeFilterCount,
    availableTags,
    clearFilters,
    clearSearch,
  } = useFilters(models || [])

  const handleModelClick = useCallback((modelName: string) => {
    setSelectedModelName(modelName)
  }, [])

  const selectedModel = useMemo(
    () =>
      selectedModelName
        ? (models || []).find(
            (model) => model.model_name === selectedModelName
          ) || null
        : null,
    [models, selectedModelName]
  )

  const availableGroups = useMemo(
    () =>
      Object.keys(usableGroup || {}).filter(
        (g) => !EXCLUDED_GROUPS.includes(g)
      ),
    [usableGroup]
  )

  const handleClearAll = useCallback(() => {
    clearFilters()
    clearSearch()
  }, [clearFilters, clearSearch])

  let loadingOrError = null
  if (isLoading) {
    loadingOrError = (
      <LoadingSkeleton viewMode={section === 'overview' ? 'table' : viewMode} />
    )
  } else if (error) {
    loadingOrError = (
      <ErrorState
        title={t('Failed to load pricing')}
        onRetry={() => void refetch()}
      />
    )
  }

  const renderPricingContent = () => {
    if (filteredModels.length === 0) {
      return (
        <EmptyState
          searchQuery={searchInput}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearAll}
        />
      )
    }

    if (viewMode === VIEW_MODES.CARD) {
      return (
        <ModelCardGrid
          models={filteredModels}
          onModelClick={handleModelClick}
          priceRate={priceRate}
          usdExchangeRate={usdExchangeRate}
          tokenUnit={tokenUnit}
          showRechargePrice={showRechargePrice}
          selectedGroup={groupFilter}
        />
      )
    }

    return (
      <PricingTable
        models={filteredModels}
        priceRate={priceRate}
        usdExchangeRate={usdExchangeRate}
        tokenUnit={tokenUnit}
        showRechargePrice={showRechargePrice}
        selectedGroup={groupFilter}
        onModelClick={handleModelClick}
      />
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <main>
        <PageTransition className='mx-auto w-full max-w-7xl px-4 pt-24 pb-12 sm:px-6 sm:pt-28 lg:px-8'>
          <Tabs
            value={section}
            onValueChange={(value) =>
              changeSection(value === 'models' ? 'models' : 'overview')
            }
          >
            <TabsList
              className='mx-auto mb-4 h-10'
              aria-label={t('Pricing views')}
            >
              <TabsTrigger value='overview' className='px-5'>
                {t('Pricing overview')}
              </TabsTrigger>
              <TabsTrigger value='models' className='px-5'>
                {t('Model Square')}
              </TabsTrigger>
            </TabsList>
            {loadingOrError}
            {!isLoading && !error && (
              <>
                <TabsContent value='overview'>
                  <header className='mx-auto max-w-3xl pt-6 pb-10 text-center sm:pb-14'>
                    <p className='text-brand mb-4 text-xs font-semibold tracking-widest uppercase'>
                      {t('Pricing')}
                    </p>
                    <h1 className='text-4xl font-semibold tracking-tight text-balance sm:text-5xl'>
                      {t('Transparent pricing. Pay as you go.')}
                    </h1>
                    <p className='text-muted-foreground mx-auto mt-5 max-w-xl text-sm leading-7 sm:text-base'>
                      {t(
                        'Compare input, output and cache prices. One API key connects you to your available models.'
                      )}
                    </p>
                  </header>
                  <PricingOverview
                    models={models}
                    vendors={vendors}
                    groupRatio={groupRatio}
                    routingGroups={routingGroups}
                    onModelClick={handleModelClick}
                    onBrowse={() => changeSection('models')}
                  />
                </TabsContent>
                <TabsContent value='models'>
                  <header className='mx-auto mb-5 max-w-3xl pt-5 text-center sm:mb-10 sm:pt-10'>
                    <h1 className='text-[clamp(2rem,5.5vw,3.5rem)] leading-[1.15] font-bold tracking-tight'>
                      {t('Model Square')}
                    </h1>
                    <p className='text-muted-foreground/80 mt-3 text-sm sm:mt-4 sm:text-base'>
                      {t('This site currently has {{count}} models enabled', {
                        count: models?.length || 0,
                      })}
                    </p>
                    <p className='text-muted-foreground/60 mx-auto mt-2 max-w-2xl text-xs leading-relaxed sm:text-sm'>
                      {t(
                        'Discover curated AI models, compare pricing and capabilities, and choose the right model for every scenario.'
                      )}
                    </p>
                    <SearchBar
                      value={searchInput}
                      onChange={setSearchInput}
                      onClear={clearSearch}
                      placeholder={t(
                        'Search model name, provider, endpoint, or tag...'
                      )}
                      className='mx-auto mt-4 max-w-2xl sm:mt-6'
                    />
                  </header>

                  <div className='grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]'>
                    <PricingSidebar
                      quotaTypeFilter={quotaTypeFilter}
                      endpointTypeFilter={endpointTypeFilter}
                      vendorFilter={vendorFilter}
                      groupFilter={groupFilter}
                      tagFilter={tagFilter}
                      onQuotaTypeChange={setQuotaTypeFilter}
                      onEndpointTypeChange={setEndpointTypeFilter}
                      onVendorChange={setVendorFilter}
                      onGroupChange={setGroupFilter}
                      onTagChange={setTagFilter}
                      vendors={vendors || []}
                      groups={availableGroups}
                      groupRatios={groupRatio}
                      tags={availableTags}
                      models={models || []}
                      hasActiveFilters={hasActiveFilters}
                      onClearFilters={clearFilters}
                      className='hover-scrollbar sticky top-20 hidden max-h-[calc(100dvh-6rem)] self-start overflow-y-auto xl:block'
                    />

                    <div className='min-w-0 space-y-4'>
                      <PricingToolbar
                        filteredCount={filteredModels.length}
                        totalCount={models?.length}
                        sortBy={sortBy}
                        onSortChange={setSortBy}
                        tokenUnit={tokenUnit}
                        onTokenUnitChange={setTokenUnit}
                        showRechargePrice={showRechargePrice}
                        onRechargePriceChange={setShowRechargePrice}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        quotaTypeFilter={quotaTypeFilter}
                        endpointTypeFilter={endpointTypeFilter}
                        vendorFilter={vendorFilter}
                        groupFilter={groupFilter}
                        tagFilter={tagFilter}
                        onQuotaTypeChange={setQuotaTypeFilter}
                        onEndpointTypeChange={setEndpointTypeFilter}
                        onVendorChange={setVendorFilter}
                        onGroupChange={setGroupFilter}
                        onTagChange={setTagFilter}
                        vendors={vendors || []}
                        groups={availableGroups}
                        groupRatios={groupRatio}
                        tags={availableTags}
                        models={models || []}
                        hasActiveFilters={hasActiveFilters}
                        activeFilterCount={activeFilterCount}
                        onClearFilters={clearFilters}
                      />

                      {renderPricingContent()}
                    </div>
                  </div>
                </TabsContent>
              </>
            )}
          </Tabs>
          {selectedModel && (
            <ModelDetailsDrawer
              open={Boolean(selectedModel)}
              onOpenChange={(open) => {
                if (!open) setSelectedModelName(null)
              }}
              model={selectedModel}
              groupRatio={groupRatio || {}}
              usableGroup={usableGroup || {}}
              endpointMap={
                (endpointMap as Record<
                  string,
                  { path?: string; method?: string }
                >) || {}
              }
              autoGroups={autoGroups || []}
              priceRate={priceRate ?? 1}
              usdExchangeRate={usdExchangeRate ?? 1}
              tokenUnit={section === 'overview' ? 'M' : tokenUnit}
              showRechargePrice={
                section === 'overview' ? false : showRechargePrice
              }
            />
          )}
        </PageTransition>
      </main>
    </PublicLayout>
  )
}
