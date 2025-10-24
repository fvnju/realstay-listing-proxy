import { CreateListingData } from '../types/api';
import { inferTypeFromCostCycle, isValidTypeForCostCycle } from './listingTypeHelper';

/**
 * Transform our microservice schema to main backend schema
 */
export function toBackendSchema(data: CreateListingData) {
  // For sale listings, costCycle should be a space string for the monolith
  // For shortlet/rent, use the provided costCycle
  const costCycle = data.type === 'sale' ? ' ' : data.costCycle!;
  
  return {
    place_holder_address: data.area || '',
    google_formatted_address: data.googleFormattedAddress || '',
    state: data.state,
    lga: data.lga,
    lat: data.lat,
    lng: data.lng,
    type: data.propertyType, // Backend's type = our propertyType (apartment, house, etc.)
    no_of_beds: data.noOfBeds || 0,
    are_pets_allowed: data.arePetsAllowed,
    no_of_bedrooms: data.noOfBedrooms,
    no_of_bathrooms: data.noOfBathrooms,
    are_parties_allowed: data.arePartiesAllowed,
    extra_offerings: data.extraOfferings || [],
    title: data.title,
    description: data.description,
    cost: data.cost,
    cost_cycle: costCycle,
    photos: data.photos,
    // Type-specific fields
    min_stay_days: data.minStayDays,
    max_stay_days: data.maxStayDays,
    instant_booking: data.instantBooking,
    lease_duration_months: data.leaseDurationMonths,
    security_deposit: data.securityDeposit,
    agency_fee: data.agencyFee,
    legal_fee: data.legalFee,
    caution_fee: data.cautionFee,
    property_title: data.propertyTitle,
    total_area_sqm: data.totalAreaSqm,
    negotiable: data.negotiable,
  };
}

/**
 * Transform main backend schema to our microservice schema
 */
export function fromBackendSchema(backendData: any) {
  // Auto-detect listing purpose from cost_cycle since backend doesn't have this
  const inferredType = inferTypeFromCostCycle(backendData.cost_cycle);
  
  return {
    id: backendData.id || backendData._id,
    title: backendData.title,
    description: backendData.description,
    cost: backendData.cost,
    costCycle: backendData.cost_cycle,
    type: inferredType, // Listing purpose: shortlet/rent/sale
    propertyType: backendData.type, // Property type: apartment/house/condo/etc.
    listingCategory: mapBackendTypeToCategory(backendData.type),
    state: backendData.state,
    lga: backendData.lga,
    area: backendData.place_holder_address,
    googleFormattedAddress: backendData.google_formatted_address,
    lat: backendData.lat,
    lng: backendData.lng,
    noOfBeds: backendData.no_of_beds || 0,
    noOfBedrooms: backendData.no_of_bedrooms,
    noOfBathrooms: backendData.no_of_bathrooms,
    arePetsAllowed: backendData.are_pets_allowed || false,
    arePartiesAllowed: backendData.are_parties_allowed || false,
    extraOfferings: JSON.stringify(backendData.extra_offerings || []),
    photos: JSON.stringify(backendData.photos || []),
    minStayDays: backendData.min_stay_days,
    maxStayDays: backendData.max_stay_days,
    instantBooking: backendData.instant_booking,
    leaseDurationMonths: backendData.lease_duration_months,
    securityDeposit: backendData.security_deposit,
    agencyFee: backendData.agency_fee,
    legalFee: backendData.legal_fee,
    cautionFee: backendData.caution_fee,
    propertyTitle: backendData.property_title,
    totalAreaSqm: backendData.total_area_sqm,
    negotiable: backendData.negotiable,
    ownerId: backendData.owner_id || backendData.ownerId,
    ownerFirstName: backendData.owner_first_name || backendData.ownerFirstName || '',
    ownerLastName: backendData.owner_last_name || backendData.ownerLastName || '',
    averageRating: backendData.average_rating || backendData.averageRating || 0,
    totalReviews: backendData.total_reviews || backendData.totalReviews || 0,
    isActive: backendData.is_active !== undefined ? backendData.is_active : true,
  };
}

/**
 * Map backend property type to our listing category
 */
function mapBackendTypeToCategory(backendType: string): "residential" | "commercial" | "land" {
  if (backendType === 'land') return 'land';
  if (backendType === 'commercial') return 'commercial';
  return 'residential';
}
