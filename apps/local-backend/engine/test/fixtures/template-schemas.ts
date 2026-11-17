import { z } from 'zod';

/**
 * Copies of the template's response schemas (contract C13): `template/src/features/auth/types`,
 * `.../auth/api/schemas.ts`, `.../items/types`, `template/src/services/remote-config/appConfig.ts`.
 * `preset.test.ts` checks them against `template/api/generated/openapi.json`, so a change in the template shows up.
 */
export const UserSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  gender: z.string(),
  image: z.string(),
});

export const LoginResponseSchema = UserSchema.extend({ accessToken: z.string(), refreshToken: z.string() });
export const TokensSchema = z.object({ accessToken: z.string(), refreshToken: z.string() });
export const SuccessResponseSchema = z.object({ success: z.boolean() });
export const OtpVerifyResponseSchema = z.object({ success: z.boolean() });
export const OtpResendResponseSchema = z.object({ success: z.boolean(), retryAfterSec: z.number().int().nonnegative() });

export const ItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  price: z.number(),
  category: z.string(),
  thumbnail: z.string(),
  rating: z.number(),
  stock: z.number(),
});
export const ItemsPageSchema = z.object({ products: z.array(ItemSchema), total: z.number(), skip: z.number(), limit: z.number() });
/** `POST /products/add`: the template's mock answers a partial item with an id. */
export const CreatedItemSchema = ItemSchema.partial().required({ id: true });

const PlatformValues = z.object({ ios: z.string(), android: z.string() });
export const AppConfigSchema = z.object({
  minSupportedVersion: PlatformValues,
  latestVersion: PlatformValues,
  maintenance: z.object({ enabled: z.boolean(), message: z.string().optional() }),
  flags: z.partialRecord(z.enum(['onboardingEnabled', 'itemsCreateEnabled', 'biometricLoginEnabled']), z.boolean()),
  storeUrls: PlatformValues,
});

/** Each fixture schema with the `components.schemas` name it has in the template's `openapi.json`. */
export const BY_COMPONENT = {
  GetAppConfigResponse: AppConfigSchema,
  GetAuthMeResponse: UserSchema,
  GetProductsIdResponse: ItemSchema,
  GetProductsResponse: ItemsPageSchema,
  GetProductsSearchResponse: ItemsPageSchema,
  PostAuthForgotPasswordResponse: SuccessResponseSchema,
  PostAuthLoginResponse: LoginResponseSchema,
  PostAuthOtpResendResponse: OtpResendResponseSchema,
  PostAuthOtpVerifyResponse: OtpVerifyResponseSchema,
  PostAuthRefreshResponse: TokensSchema,
  PostProductsAddResponse: CreatedItemSchema,
  PostUsersAddResponse: UserSchema,
  PutUsersIdResponse: UserSchema,
} as const;
