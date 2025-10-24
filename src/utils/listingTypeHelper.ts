/**
 * Utility functions for determining listing types based on cost_cycle
 * 
 * Mapping Rules:
 * - daily → shortlet (no overlap)
 * - weekly → shortlet (no overlap)
 * - monthly → rent by default, but can be shortlet (requires manual specification)
 * - yearly → rent (no overlap)
 * - sale → requires manual specification
 */

export type ListingType = "shortlet" | "rent" | "sale";
export type CostCycle = "daily" | "weekly" | "monthly" | "yearly";

/**
 * Determine type from cost_cycle for unambiguous cases only
 * Returns null for ambiguous cases (monthly) that require manual specification
 */
export function autoDetectTypeFromCostCycle(costCycle: string): ListingType | null {
  const cycle = costCycle.toLowerCase();
  
  switch (cycle) {
    case "daily":
    case "week":
    case "weekly":
      return "shortlet";
      
    case "yearly":
    case "annual":
    case "year":
      return "rent";
      
    case "monthly":
    case "month":
      // Ambiguous - could be shortlet or rent
      // Default to rent for synced listings
      return null;
      
    default:
      return null;
  }
}

/**
 * Determine type with default fallback for ambiguous cases
 * Used when syncing from backend where we need a value
 */
export function inferTypeFromCostCycle(costCycle: string): ListingType {
  const detected = autoDetectTypeFromCostCycle(costCycle);
  
  // For ambiguous cases (monthly), default to rent
  if (detected === null) {
    return "rent";
  }
  
  return detected;
}

/**
 * Check if a cost_cycle/type combination is valid
 */
export function isValidTypeForCostCycle(type: ListingType, costCycle: string): boolean {
  const cycle = costCycle.toLowerCase();
  
  switch (type) {
    case "shortlet":
      // Shortlets can be daily, weekly, or monthly
      return ["daily", "weekly", "monthly", "week", "month"].includes(cycle);
      
    case "rent":
      // Rent can be monthly or yearly (not daily/weekly)
      return ["monthly", "yearly", "month", "year", "annual"].includes(cycle);
      
    case "sale":
      // Sale listings typically don't use cost_cycle, but if they do, it's usually one-time
      return true; // Allow any for flexibility
      
    default:
      return false;
  }
}

/**
 * Check if type can be auto-detected (no ambiguity)
 */
export function canAutoDetectType(costCycle: string): boolean {
  return autoDetectTypeFromCostCycle(costCycle) !== null;
}

/**
 * Get suggested type based on cost_cycle with confidence level
 */
export function getSuggestedType(costCycle: string): {
  type: ListingType;
  confidence: "high" | "medium" | "low";
  reason: string;
} {
  const cycle = costCycle.toLowerCase();
  
  if (["daily", "weekly", "week"].includes(cycle)) {
    return {
      type: "shortlet",
      confidence: "high",
      reason: "Daily/weekly cycles are exclusively used for shortlets"
    };
  }
  
  if (["yearly", "year", "annual"].includes(cycle)) {
    return {
      type: "rent",
      confidence: "high",
      reason: "Yearly cycles are exclusively used for long-term rentals"
    };
  }
  
  if (["monthly", "month"].includes(cycle)) {
    return {
      type: "rent",
      confidence: "medium",
      reason: "Monthly cycle usually indicates rent, but could be shortlet - manual verification recommended"
    };
  }
  
  return {
    type: "rent",
    confidence: "low",
    reason: "Unknown cost cycle, defaulting to rent"
  };
}
