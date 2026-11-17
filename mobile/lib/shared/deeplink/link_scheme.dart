/// Installed-app scheme for this distribution; canonical Buzz links stay readable.
const buzzLinkScheme = String.fromEnvironment(
  'BUZZ_URL_SCHEME',
  defaultValue: 'buzz',
);

/// Whether the scheme belongs to canonical Buzz or this distribution.
bool isBuzzLinkScheme(String scheme) =>
    scheme == 'buzz' || scheme == buzzLinkScheme;

/// Safe noncapturing fragment shared by chat and composer link recognition.
final buzzLinkSchemePattern = '(?:buzz|${RegExp.escape(buzzLinkScheme)})';
