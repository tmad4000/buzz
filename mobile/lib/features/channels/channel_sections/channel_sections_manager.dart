import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:nostr/nostr.dart' as nostr;
import 'package:shared_preferences/shared_preferences.dart';

import '../../../shared/crypto/nip44.dart';
import '../../../shared/relay/relay.dart';
import 'channel_sections_storage.dart';

class ChannelSectionsCrypto {
  final Uint8List _conversationKey;

  ChannelSectionsCrypto(String nsec, String pubkey)
    : _conversationKey = _deriveKey(nsec, pubkey);

  static Uint8List _deriveKey(String nsec, String pubkey) {
    final privkeyHex = nostr.Nip19.decode(payload: nsec).data;
    return getConversationKey(privkeyHex, pubkey);
  }

  String encrypt(String plaintext) => nip44Encrypt(_conversationKey, plaintext);

  String decrypt(String ciphertext) =>
      nip44Decrypt(_conversationKey, ciphertext);
}

class ChannelSectionsManager {
  final String pubkey;
  final String _cacheScope;
  final ChannelSectionsStorage _storage;
  final ChannelSectionsCrypto _crypto;
  final RelaySessionNotifier? _relaySession;
  final bool _remoteEnabled;
  final VoidCallback _onChanged;

  ChannelSectionStore _store;
  int _lastRemoteCreatedAt = 0;
  String? _lastRemoteEventId;
  void Function()? _unsubscribe;
  bool _disposed = false;

  /// Base delay for the startup-sync retry backoff. Overridable in tests.
  final Duration _startupRetryBaseDelay;
  Timer? _startupRetryTimer;
  int _startupRetryAttempt = 0;
  bool _startupFetchSucceeded = false;
  Future<void>? _syncInFlight;
  bool _syncAgain = false;
  int _subscriptionGeneration = 0;

  ChannelSectionsManager({
    required this.pubkey,
    String? relayUrl,
    required SharedPreferences prefs,
    required ChannelSectionsCrypto crypto,
    required RelaySessionNotifier? relaySession,
    required SignedEventRelay? signedEventRelay,
    required bool remoteEnabled,
    required VoidCallback onChanged,
    @visibleForTesting
    Duration startupRetryBaseDelay = const Duration(seconds: 2),
  }) : _cacheScope = relayUrl == null
           ? pubkey
           : '${Uri.encodeComponent(relayUrl)}:$pubkey',
       _storage = ChannelSectionsStorage(prefs),
       _crypto = crypto,
       _relaySession = relaySession,
       _remoteEnabled = remoteEnabled,
       _onChanged = onChanged,
       _startupRetryBaseDelay = startupRetryBaseDelay,
       _store = ChannelSectionsStorage(prefs).read(
         relayUrl == null ? pubkey : '${Uri.encodeComponent(relayUrl)}:$pubkey',
       );

  ChannelSectionStore get store => _store;

  Future<void> initialize() async {
    if (_disposed) return;

    if (!_remoteEnabled || _relaySession == null) {
      _onChanged();
      return;
    }

    await _syncWithRelay();
    _onChanged();
  }

  /// Re-reads the retained head once, e.g. on app foreground resume, to catch
  /// an EVENT a healthy socket never delivered. This lane never has local edits.
  void refreshFromRelay() {
    if (_disposed || !_remoteEnabled) return;
    unawaited(_fetchAndMerge());
  }

  /// One startup-sync attempt: fetch the remote blob, then start the live
  /// subscription. Either step can lose a transient race on cold start (the
  /// relay rate-limits the burst of per-channel subscriptions and rejects
  /// with `rate-limited: quota exceeded`) — retry with backoff instead of
  /// silently giving up, which left desktop-created groups invisible until
  /// an unrelated refetch.
  ///
  /// Retries are intentionally unbounded for the manager's lifetime: this
  /// sync must eventually land for groups to appear at all, and at the 30s
  /// delay ceiling a persistent retry is cheap. Do not "fix" this into a
  /// bounded loop — giving up permanently is the exact bug this replaces.
  Future<void> _syncWithRelay() {
    if (_disposed) return Future.value();
    final inFlight = _syncInFlight;
    if (inFlight != null) {
      _syncAgain = true;
      return inFlight;
    }

    final sync = _runSyncWithRelay();
    _syncInFlight = sync;
    return sync.whenComplete(() {
      _syncInFlight = null;
      if (_disposed || !_syncAgain) return;
      _syncAgain = false;
      unawaited(_syncWithRelay());
    });
  }

  Future<void> _runSyncWithRelay() async {
    if (!_startupFetchSucceeded) {
      final fetched = await _fetchAndMerge();
      if (_disposed) return;
      _startupFetchSucceeded = fetched;
    }

    final subscribed = _unsubscribe != null || await _startLiveSubscription();
    if (_disposed) return;

    if (!_startupFetchSucceeded || !subscribed) {
      _scheduleStartupRetry();
    } else {
      // Fully recovered — later transient failures (e.g. a late relay
      // CLOSED) start backing off from the base delay again instead of the
      // ceiling the cold start climbed to.
      _startupRetryAttempt = 0;
    }
  }

  void _scheduleStartupRetry() {
    if (_disposed) return;
    _startupRetryTimer?.cancel();
    // The inner shift cap is overflow protection, not the delay policy: the
    // consecutive-failure counter is unbounded, and an unchecked `<<`
    // past 62 wraps negative, which would make the Timer fire immediately in
    // a hot loop. At the default 2s base the outer 30s clamp is what callers
    // actually observe (2s, 4s, …, 30s); the shift cap only bites for the
    // tiny injected bases used in tests.
    final delayMs = min(
      _startupRetryBaseDelay.inMilliseconds << min(_startupRetryAttempt, 5),
      30000,
    );
    _startupRetryAttempt++;
    debugPrint(
      '[ChannelSectionsManager] startup sync incomplete; '
      'retrying in ${delayMs}ms (attempt $_startupRetryAttempt)',
    );
    _startupRetryTimer = Timer(Duration(milliseconds: delayMs), () {
      _startupRetryTimer = null;
      unawaited(
        _syncWithRelay().then((_) {
          if (!_disposed) _onChanged();
        }),
      );
    });
  }

  void dispose({bool flushPending = true}) {
    if (_disposed) return;
    _disposed = true;
    _subscriptionGeneration++;
    _syncAgain = false;

    _startupRetryTimer?.cancel();
    _startupRetryTimer = null;

    _unsubscribe?.call();
    _unsubscribe = null;
  }

  // Intentionally inert: legacy mobile snapshots must never fence desktop
  // metadata v2 writers or clobber their registers and conversion journals.
  void createSection(String name) {}
  void renameSection(String sectionId, String newName) {}
  void deleteSection(String sectionId) {}
  void moveSectionUp(String sectionId) {}
  void moveSectionDown(String sectionId) {}
  void assignChannel(String channelId, String sectionId) {}
  void unassignChannel(String channelId) {}
  void markDirty() {}

  /// Returns whether the fetch reached the relay (regardless of whether a
  /// remote blob exists).
  Future<bool> _fetchAndMerge({
    bool allowDisposed = false,
    bool Function()? isCurrent,
  }) async {
    if (_relaySession == null) return false;
    try {
      final events = await _relaySession.fetchHistory(
        NostrFilter(
          kinds: const [EventKind.readState],
          authors: [pubkey],
          tags: const {
            '#d': ['channel-sections'],
          },
          limit: 1,
        ),
      );
      if (_disposed && !allowDisposed) return false;
      if (isCurrent != null && !isCurrent()) return false;
      _mergeEvents(events);
      _persist();
      if (!_disposed) _onChanged();
      return true;
    } catch (error) {
      debugPrint('[ChannelSectionsManager] fetch failed: $error');
      // Local state remains usable when relay is unavailable.
      return false;
    }
  }

  /// Returns whether the live subscription was established.
  Future<bool> _startLiveSubscription() async {
    if (_relaySession == null || _disposed) return false;
    final generation = ++_subscriptionGeneration;
    try {
      final unsubscribe = await _relaySession.subscribe(
        NostrFilter(
          kinds: const [EventKind.readState],
          authors: [pubkey],
          tags: const {
            '#d': ['channel-sections'],
          },
          limit: 1,
        ),
        _handleIncomingEvent,
        onClosed: (message) => _handleSubscriptionClosed(generation, message),
      );
      if (_disposed || generation != _subscriptionGeneration) {
        unsubscribe();
        return false;
      }
      _unsubscribe = unsubscribe;
      return true;
    } catch (error) {
      debugPrint('[ChannelSectionsManager] live subscription failed: $error');
      // Non-fatal — local state and history still work; retried by the
      // startup-sync backoff.
      return false;
    }
  }

  /// A relay `CLOSED` can arrive after `subscribe()` already reported
  /// success: the 500ms readiness wait times out silently under load, and
  /// the rate-limit rejection lands later. Without this handler the manager
  /// would keep a dead subscription and never retry — the exact
  /// load-correlated cold-start failure this retry exists for.
  void _handleSubscriptionClosed(int generation, String message) {
    if (_disposed || generation != _subscriptionGeneration) return;
    debugPrint(
      '[ChannelSectionsManager] live subscription closed by relay: $message',
    );
    _unsubscribe = null;
    _subscriptionGeneration++;
    _scheduleStartupRetry();
  }

  void _mergeEvents(List<NostrEvent> events) {
    for (final event in events) {
      if (event.pubkey != pubkey) continue;
      _mergeEvent(event);
    }
  }

  void _mergeEvent(NostrEvent event) {
    // Only process channel-sections d-tag events.
    final dTag = event.getTagValue('d');
    if (dTag != 'channel-sections' ||
        event.pubkey != pubkey ||
        event.kind != EventKind.readState) {
      return;
    }

    try {
      final plaintext = _crypto.decrypt(event.content);
      final parsed = jsonDecode(plaintext);
      if (parsed is! Map<String, dynamic>) return;

      final incoming = readDesktopSections(parsed);

      if (_isAfterCursor(event.createdAt, event.id)) {
        _lastRemoteCreatedAt = event.createdAt;
        _lastRemoteEventId = event.id;
        _store = incoming;
        _persist();
      }
    } catch (_) {
      // Decryption failure or parse error — keep existing state.
    }
  }

  /// Last-write-wins. Relay retains `ORDER BY created_at DESC, id ASC`: at
  /// equal second the lower event ID wins.
  bool _isAfterCursor(int createdAt, String id) =>
      createdAt > _lastRemoteCreatedAt ||
      (createdAt == _lastRemoteCreatedAt &&
          id.compareTo(_lastRemoteEventId ?? '') < 0);

  void _handleIncomingEvent(NostrEvent event) {
    if (_disposed) return;
    _mergeEvent(event);
    if (!_disposed) _onChanged();
  }

  /// A retired manager never writes the prefs key its successor now owns.
  void _persist() {
    if (_disposed) return;
    _storage.write(_cacheScope, _store);
  }
}
