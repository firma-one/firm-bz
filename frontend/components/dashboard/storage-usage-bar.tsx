import { useState } from 'react';
import { Filter, ChevronDown, Check, ExternalLink, ArrowLeft } from 'lucide-react';

interface StorageItem {
    label: string;
    percentage: number;
    color: string;
    size: string;
}

interface Account {
    id: string;
    email: string;
}

interface StorageUsageBarProps {
    totalUsed: string;
    totalCapacity: string;
    items: StorageItem[];
    legendItems?: StorageItem[];
    breakdownItems?: StorageItem[];
    accounts?: Account[];
    selectedAccounts?: string[];
    onAccountToggle?: (id: string) => void;
    onSelectAll?: () => void;
}

export function StorageUsageBar({
    totalUsed,
    totalCapacity,
    items,
    legendItems,
    breakdownItems,
    accounts = [],
    selectedAccounts = [],
    onAccountToggle,
    onSelectAll
}: StorageUsageBarProps) {
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [drillMode, setDrillMode] = useState(false);

    const isAllSelected = accounts.length > 0 && selectedAccounts.length === accounts.length;
    const isIndeterminate = selectedAccounts.length > 0 && selectedAccounts.length < accounts.length;

    const primaryEmail = accounts[0]?.email
    const manageStorageUrl = primaryEmail
      ? `https://one.google.com/storage?authuser=${encodeURIComponent(primaryEmail)}`
      : 'https://one.google.com/storage'

    const canDrill = !!(breakdownItems && breakdownItems.length > 0)

    return (
        <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 mb-2">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Storage Usage</h3>
                    <p className="text-sm text-gray-500">
                        {totalUsed} used of {totalCapacity} <span className="mx-2 text-gray-300 text-[10px]">•</span> <span className="text-xs">Updated just now</span>
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Account Filter Dropdown */}
                    {accounts.length > 1 && onAccountToggle && (
                        <div className="relative">
                            {isFilterOpen && <div className="fixed inset-0 z-10" onClick={() => setIsFilterOpen(false)}></div>}
                            <button
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                className="flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium rounded-lg transition-colors shadow-sm bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                            >
                                <Filter className="h-3 w-3 flex-shrink-0" />
                                <span>Filter</span>
                                {!isAllSelected && selectedAccounts.length > 0 && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600 flex-shrink-0" />
                                )}
                                <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isFilterOpen && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                    <div className="px-3 py-2 border-b border-gray-100 mb-1 flex items-center justify-between bg-gray-50/50 rounded-t-xl">
                                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Storage Accounts</span>
                                        <button
                                            onClick={() => setIsFilterOpen(false)}
                                            className="text-[10px] font-semibold text-white bg-gray-900 hover:bg-gray-800 px-2 py-0.5 rounded transition-colors"
                                        >
                                            Done
                                        </button>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                        <button
                                            onClick={onSelectAll}
                                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 group"
                                        >
                                            <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${isAllSelected || isIndeterminate
                                                ? 'bg-blue-600 border-blue-600'
                                                : 'bg-white border-gray-300'
                                                }`}>
                                                {isAllSelected && <Check className="h-3 w-3 text-white" />}
                                                {isIndeterminate && <div className="h-0.5 w-2 bg-white rounded-full" />}
                                            </div>
                                            <span className="font-medium text-gray-900">All Accounts</span>
                                        </button>
                                        {accounts.map(account => {
                                            const isSelected = selectedAccounts.includes(account.id)
                                            return (
                                                <button
                                                    key={account.id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onAccountToggle(account.id);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 group transition-colors"
                                                >
                                                    <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected
                                                        ? 'bg-blue-600 border-blue-600'
                                                        : 'bg-white border-gray-300 group-hover:border-blue-400'
                                                        }`}>
                                                        {isSelected && <Check className="h-3 w-3 text-white" />}
                                                    </div>
                                                    <span className={`truncate ${isSelected ? "font-medium text-gray-900" : ""}`}>{account.email}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <a
                        href={manageStorageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 active:bg-gray-800 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                    >
                        <span>Manage Storage</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                </div>
            </div>

            {!drillMode ? (
                <>
                    {/* Main bar: Used + Free */}
                    <div className="relative h-6 w-full bg-gray-100 rounded-lg overflow-hidden flex mb-4">
                        {items.map((item, index) => (
                            <div
                                key={index}
                                style={{ width: `${item.percentage}%` }}
                                onClick={item.label === 'Used' && canDrill ? () => setDrillMode(true) : undefined}
                                className={`h-full ${item.color} relative group transition-all duration-300 hover:opacity-90 ${item.label === 'Used' && canDrill ? 'cursor-pointer' : ''}`}
                            >
                                <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md whitespace-nowrap transition-opacity pointer-events-none z-20 shadow-lg">
                                    {item.label}: {item.size} ({item.percentage.toFixed(2)}%)
                                    {item.label === 'Used' && canDrill && <span className="ml-1 opacity-70">· click to break down</span>}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {/* Legend: Used + Free */}
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                        {(legendItems ?? items).map((item, index) => (
                            <div key={index} className="flex items-center gap-1.5">
                                <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                                <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-1">
                                    <span className="text-xs sm:text-sm font-semibold text-gray-700">{item.label}</span>
                                    <span className="text-[10px] sm:text-xs text-gray-500 font-medium whitespace-nowrap">{item.size} ({item.percentage.toFixed(2)}%)</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <>
                    {/* Drill mode header */}
                    <div className="flex items-center gap-2 mb-3 animate-in fade-in slide-in-from-left-2 duration-200">
                        <button
                            onClick={() => setDrillMode(false)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 active:scale-95 transition-all text-gray-700 font-medium text-xs"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back
                        </button>
                        <span className="text-sm font-bold text-gray-900">Used Storage by Type</span>
                    </div>
                    {/* Breakdown bar */}
                    {canDrill ? (
                        <div className="relative h-6 w-full bg-gray-100 rounded-lg overflow-hidden flex mb-4 animate-in fade-in duration-200">
                            {breakdownItems!.map((item, index) => (
                                <div
                                    key={index}
                                    style={{ width: `${item.percentage}%` }}
                                    className={`h-full ${item.color} relative group transition-all duration-300 hover:opacity-80`}
                                >
                                    <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md whitespace-nowrap transition-opacity pointer-events-none z-20 shadow-lg">
                                        {item.label}: {item.size} ({item.percentage.toFixed(1)}%)
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 italic mb-4">
                            Breakdown unavailable — native Google files (Docs, Sheets, Slides) don&apos;t report individual file sizes.
                        </p>
                    )}
                    {/* Breakdown legend */}
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 animate-in fade-in duration-200">
                        {breakdownItems?.map((item, index) => (
                            <div key={index} className="flex items-center gap-1.5">
                                <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                                <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-1">
                                    <span className="text-xs sm:text-sm font-semibold text-gray-700">{item.label}</span>
                                    <span className="text-[10px] sm:text-xs text-gray-500 font-medium whitespace-nowrap">{item.size} ({item.percentage.toFixed(1)}%)</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
