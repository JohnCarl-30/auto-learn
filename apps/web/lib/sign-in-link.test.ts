import { signInLinkFrom } from './sign-in-link';

const ORIGIN = 'https://auto-learn.example';
const LINK = `${ORIGIN}/api/auth/callback/resend?callbackUrl=%2Ftalk&token=abc&email=a%40b.c`;

describe('signInLinkFrom', () => {
  it('accepts a callback on this site, as given', () => {
    expect(signInLinkFrom(LINK, ORIGIN)).toBe(LINK);
  });

  it('ignores the whitespace a copy from Mail can carry', () => {
    expect(signInLinkFrom(`  ${LINK}\n`, ORIGIN)).toBe(LINK);
  });

  it.each([
    ['another site', 'https://evil.example/api/auth/callback/resend?token=abc'],
    ['plain http to this host', 'http://auto-learn.example/api/auth/callback/resend'],
    ['a lookalike subdomain', 'https://auto-learn.example.evil.example/api/auth/callback/resend'],
    ['a script', 'javascript:alert(1)'],
    ['credentials before this host', 'https://x@auto-learn.example/api/auth/callback/resend'],
  ])('rejects %s', (_, input) => {
    expect(signInLinkFrom(input, ORIGIN)).toBeNull();
  });

  it.each([
    ['the home page', `${ORIGIN}/`],
    ['another auth route', `${ORIGIN}/api/auth/signout`],
    ['a path that walks out of the callback', `${ORIGIN}/api/auth/callback/../../../account`],
    ['the same, encoded', `${ORIGIN}/api/auth/callback/%2e%2e/%2e%2e/%2e%2e/account`],
  ])('rejects %s', (_, input) => {
    expect(signInLinkFrom(input, ORIGIN)).toBeNull();
  });

  it('rejects a script even where the page origin is opaque', () => {
    expect(signInLinkFrom('javascript:/api/auth/callback/x', 'null')).toBeNull();
  });

  it.each([[''], ['not a link'], ['/api/auth/callback/resend?token=abc']])(
    'rejects %j, which is not a whole URL',
    (input) => {
      expect(signInLinkFrom(input, ORIGIN)).toBeNull();
    },
  );
});
