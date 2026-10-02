/**
 * CampusFlow API - Data Model Layer Foundation
 * Central export point for Mongoose domain schemas and models.
 * Exports foundational models:
 * - Identity & Resource: User, ResourceType, Resource, ResourceAttributeSchema, Custodian
 * - Availability, Blackout & Quota: AvailabilityRule, Blackout, Quota
 */

// User
export {
  User,
  UserSchema,
  UserRole,
  type IUser,
  type UserRoleType,
  type UserDocument,
} from './user.model';

// ResourceType
export {
  ResourceType,
  ResourceTypeSchema,
  ResourceCategory,
  type IResourceType,
  type ResourceCategoryType,
  type ResourceTypeDocument,
} from './resourceType.model';

// ResourceAttribute (authoritatively embedded in Resource.attributes)
export {
  ResourceAttributeSchema,
  AttributeDataType,
  type IResourceAttribute,
  type AttributeDataTypeValue,
} from './resourceAttribute.model';

// Custodian
export {
  Custodian,
  CustodianSchema,
  type ICustodian,
  type CustodianDocument,
} from './custodian.model';

// Resource
export {
  Resource,
  ResourceSchema,
  ResourceStatus,
  type IResource,
  type ResourceStatusType,
  type IResourceLocation,
  type ResourceDocument,
} from './resource.model';

// AvailabilityRule
export {
  AvailabilityRule,
  AvailabilityRuleSchema,
  AvailabilityWindowSchema,
  BookingPolicySchema,
  DayOfWeek,
  isValidIanaTimezone,
  isValidCalendarDate,
  timeStringToMinutes,
  type IAvailabilityRule,
  type IAvailabilityWindow,
  type IBookingPolicy,
  type DayOfWeekType,
  type AvailabilityRuleDocument,
} from './availabilityRule.model';

// Utility functions
export { normalizeDepartmentName } from '../utils/dateValidation';

// Blackout
export {
  Blackout,
  BlackoutSchema,
  BlackoutCategory,
  type IBlackout,
  type BlackoutCategoryType,
  type BlackoutDocument,
} from './blackout.model';

// Quota
export {
  Quota,
  QuotaSchema,
  QuotaScopeType,
  QuotaSubjectType,
  QuotaMetric,
  QuotaPeriod,
  type IQuota,
  type QuotaScopeTypeValue,
  type QuotaSubjectTypeValue,
  type QuotaMetricType,
  type QuotaPeriodType,
  type QuotaDocument,
} from './quota.model';

// Reservation / Booking (Phase 2.5)
export {
  Reservation,
  ReservationSchema,
  ReservationStatus,
  ACTIVE_RESERVATION_STATES,
  TERMINAL_RESERVATION_STATES,
  VALID_STATUS_TRANSITIONS,
  isValidReservationTransition,
  type IReservation,
  type ReservationStatusType,
  type ReservationDocument,
} from './reservation.model';

// Timetable Entry (Phase 3.1)
export {
  TimetableEntry,
  TimetableEntrySchema,
  type ITimetableEntry,
  type TimetableEntryDocument,
} from './timetableEntry.model';
