import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import {
  API_TOKEN_AUDIENCE,
  API_TOKEN_ISSUER,
  API_TOKEN_TTL_SECONDS,
  type ApiToken,
} from '@auto-learn/shared';
import { currentUser } from '@/lib/dal';

/**
 * Mints a short-lived token the NestJS API will accept.
 *
 * The web app holds the session; the API is a different origin that holds no
 * user table and no Auth.js secret. Rather than teach it to decrypt a session
 * cookie — which couples it to Auth.js internals and to a cookie's host scope —
 * the web app vouches for the caller with a signed assertion: here is a user id,
 * signed with a secret we both have, good for five minutes.
 *
 * HS256 rather than a key pair because both halves of this deploy from one
 * repository and share an environment. The moment a third party needs to verify
 * these, this becomes RS256 and a published JWKS, and nothing else changes.
 */
export async function GET(): Promise<NextResponse> {
  const user = await currentUser();
  if (!user) {
    // 401 rather than a redirect: the caller is a fetch, and a signed-out tab
    // asking for a token is an ordinary thing that wants an answer, not HTML.
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const secret = process.env.API_JWT_SECRET;
  if (!secret) {
    console.error('API_JWT_SECRET is not set; cannot vouch for this caller.');
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    // The user id and nothing else. Not the email — the API has no use for it,
    // and a token is a thing that gets logged.
    .setSubject(user.id)
    .setIssuer(API_TOKEN_ISSUER)
    .setAudience(API_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${API_TOKEN_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));

  const body: ApiToken = { token, expiresIn: API_TOKEN_TTL_SECONDS };

  return NextResponse.json(body, {
    // Never stored anywhere. A CDN or a browser holding one of these is a
    // credential sitting in a cache for someone else on the machine to find.
    headers: { 'Cache-Control': 'no-store' },
  });
}
