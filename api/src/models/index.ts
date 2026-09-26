/**
 * CampusFlow API - Data Model Layer Foundation
 * Central export point for Mongoose domain schemas and models.
 * Exports foundational models: User, ResourceType, Resource, ResourceAttribute, Custodian.
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
