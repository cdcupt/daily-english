/**
 * The v1 account-linking state machine for social sign-in (attach + sign-in,
 * NO cross-device merge). Pure decision logic, separated from DB I/O so it can
 * be unit-tested directly. The route layer (routes/oauth.ts) loads the rows,
 * calls decideLink(), then applies the resulting plan inside one transaction.
 */

/** Minimal view of a users row the decision needs. */
export interface LinkUser {
  id: string;
  email: string | null;
}

export interface LinkInput {
  provider: 'google' | 'apple' | 'test'; // 'test' = synthetic E2E identity (see auth/oauth.ts IdentityProvider)
  sub: string;                 // provider subject id
  email: string | null;        // email from the verified ID token (may be null)
  emailVerified: boolean;      // provider asserted the email is verified
  deviceUserId: string | null; // captured server-side from an optional Bearer
  identityUserId: string | null; // user_id of the existing (provider, sub) identity, if any
  emailUser: LinkUser | null;  // non-merged users row matching a VERIFIED email (if any)
  deviceUser: LinkUser | null; // users row for deviceUserId (if any)
}

export type LinkOutcome = 'login' | 'linked_provider' | 'attached';

export type LinkPlan =
  // Known identity → sign in to its user (no new identity row).
  | { kind: 'sign_in'; userId: string; outcome: 'login' }
  // Verified email already owns an account → link this new identity to it, sign in.
  | { kind: 'link_to_email_user'; userId: string; outcome: 'linked_provider' }
  // Anonymous device with no email yet → attach: create identity, set email if empty.
  | { kind: 'attach_device'; userId: string; outcome: 'attached' }
  // Nothing to attach to → create a fresh user + identity.
  | { kind: 'create_account'; outcome: 'attached' };

/**
 * Decide what to do with a verified provider identity + the device captured at
 * request time. Order matters:
 *  1. identity for (provider, sub) exists → SIGN IN as that user.
 *  2. verified email matches a non-merged user → LINK new identity to it, sign in.
 *  3. device present and that device user has no email yet → ATTACH to the device.
 *  4. otherwise → CREATE a fresh account.
 */
export function decideLink(input: LinkInput): LinkPlan {
  const { emailVerified, deviceUserId, identityUserId, emailUser, deviceUser } = input;

  // 1. Known identity → sign in.
  if (identityUserId) {
    return { kind: 'sign_in', userId: identityUserId, outcome: 'login' };
  }

  // 2. Verified email already used by an account → link the new identity to it.
  if (emailVerified && emailUser) {
    return { kind: 'link_to_email_user', userId: emailUser.id, outcome: 'linked_provider' };
  }

  // 3. Anonymous device present with no email yet → attach.
  if (deviceUserId && deviceUser && deviceUser.email === null) {
    return { kind: 'attach_device', userId: deviceUserId, outcome: 'attached' };
  }

  // 4. Nothing to attach to → fresh account.
  return { kind: 'create_account', outcome: 'attached' };
}
