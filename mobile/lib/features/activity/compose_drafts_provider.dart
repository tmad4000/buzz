import 'dart:convert';
import 'package:uuid/uuid.dart';

import 'package:flutter/foundation.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../shared/relay/relay.dart';
import '../../shared/theme/theme_provider.dart';

const _draftsPrefsKey = 'compose_drafts_v1';
const _maxDrafts = 50;

/// A locally persisted, unsent composer draft.
///
/// Mobile has no durable relay-backed draft store (desktop keeps drafts
/// locally too), so drafts are device-local by design: the inbox Drafts
/// filter reflects what this device's composer has in flight.
@immutable
class ComposeDraft {
  /// `<channelId>` for channel composers, `<channelId>:<threadHeadId>` for
  /// thread composers.
  final String key;
  final String channelId;
  final String? threadHeadId;
  final String text;

  /// Literal picker labels bound to exact keys, never authorization metadata.
  /// An empty key/value is a malformed-record tombstone; send must refuse it.
  final Map<String, String> mentionKeys;
  final int updatedAt; // unix seconds
  final String revision;

  const ComposeDraft({
    required this.key,
    required this.channelId,
    required this.threadHeadId,
    required this.text,
    required this.updatedAt,
    this.mentionKeys = const {},
    this.revision = '',
  });

  Map<String, dynamic> toJson() => {
    'key': key,
    'channel_id': channelId,
    if (threadHeadId != null) 'thread_head_id': threadHeadId,
    'text': text,
    'mention_keys': mentionKeys,
    'updated_at': updatedAt,
    'revision': revision,
  };

  static ComposeDraft? fromJson(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    final key = raw['key'];
    final channelId = raw['channel_id'];
    final text = raw['text'];
    final updatedAt = raw['updated_at'];
    if (key is! String || channelId is! String || text is! String) return null;
    if (text.trim().isEmpty) return null;
    final bindings = raw['mention_keys'];
    final mentionKeys = <String, String>{};
    if (raw.containsKey('mention_keys')) {
      if (bindings is! Map<String, dynamic>) {
        mentionKeys[''] = '';
      } else {
        final labels = <String>{};
        for (final entry in bindings.entries) {
          if (!labels.add(entry.key.toLowerCase())) mentionKeys[''] = '';
          final value = entry.value;
          mentionKeys[entry.key] =
              entry.key.isNotEmpty &&
                  value is String &&
                  RegExp(r'^[0-9a-fA-F]{64}$').hasMatch(value)
              ? value.toLowerCase()
              : '';
        }
      }
    }
    return ComposeDraft(
      key: key,
      channelId: channelId,
      threadHeadId: raw['thread_head_id'] is String
          ? raw['thread_head_id'] as String
          : null,
      mentionKeys: Map.unmodifiable(mentionKeys),
      text: text,
      updatedAt: updatedAt is int ? updatedAt : 0,
      revision: raw['revision'] is String ? raw['revision'] as String : '',
    );
  }
}

String composeDraftKey(String channelId, {String? threadHeadId}) =>
    threadHeadId == null ? channelId : '$channelId:$threadHeadId';

/// SharedPreferences-backed store of unsent composer drafts, newest first.
///
/// Drafts are plaintext, so persistence is namespaced by community (relay)
/// and account pubkey: switching community or account rebuilds this provider
/// against that identity's own store and can never surface another
/// identity's draft text.
class ComposeDraftsNotifier extends Notifier<List<ComposeDraft>> {
  late String _prefsKey;

  @override
  List<ComposeDraft> build() {
    // Rebuild (and re-read the identity-scoped store) whenever the active
    // community or the derived account pubkey changes.
    final config = ref.watch(relayConfigProvider);
    final pubkey = ref.watch(myPubkeyProvider) ?? 'anon';
    _prefsKey = '$_draftsPrefsKey:${config.baseUrl}:$pubkey';

    final prefs = ref.read(savedPrefsProvider);
    final raw = readMigratedPref<String>(
      prefs,
      canonicalKey: _prefsKey,
      legacyKey: '$_draftsPrefsKey:${config.storedOrigin}:$pubkey',
      read: prefs.getString,
      write: prefs.setString,
    );
    if (raw == null) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      final drafts = decoded
          .map(ComposeDraft.fromJson)
          .whereType<ComposeDraft>()
          .toList();
      drafts.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
      return drafts;
    } catch (_) {
      return const [];
    }
  }

  /// Persist [text] for the composer identified by [key]. Empty text removes
  /// the draft.
  void save({
    required String key,
    required String channelId,
    String? threadHeadId,
    required String text,
    Map<String, String> mentionKeys = const {},
  }) {
    if (text.trim().isEmpty) {
      remove(key);
      return;
    }
    final existing = state.where((d) => d.key == key).firstOrNull;
    if (existing?.text == text &&
        mapEquals(existing?.mentionKeys, mentionKeys)) {
      return;
    }
    final draft = ComposeDraft(
      key: key,
      channelId: channelId,
      threadHeadId: threadHeadId,
      text: text,
      mentionKeys: Map.unmodifiable(mentionKeys),
      updatedAt: DateTime.now().millisecondsSinceEpoch ~/ 1000,
      revision: const Uuid().v4(),
    );
    final next = [draft, ...state.where((d) => d.key != key)];
    _persist(next.length > _maxDrafts ? next.sublist(0, _maxDrafts) : next);
  }

  void remove(String key) {
    if (!state.any((d) => d.key == key)) return;
    _persist([...state.where((d) => d.key != key)]);
  }

  /// Read text and selected identities from the same persisted snapshot.
  ComposeDraft? draftFor(String key) =>
      state.where((d) => d.key == key).firstOrNull;

  /// Capture a narrow retirement receipt that remains safe after navigation or
  /// an account switch. A newer draft in this exact scope always wins.
  Future<void> Function() captureRetirement(
    String key,
    String text,
    Map<String, String> mentionKeys,
  ) {
    final scopeKey = _prefsKey;
    final prefs = ref.read(savedPrefsProvider);
    var source = draftFor(key);
    if (source == null ||
        source.text != text ||
        !mapEquals(source.mentionKeys, mentionKeys)) {
      return () async {};
    }
    if (source.revision.isEmpty) {
      source = ComposeDraft(
        key: source.key,
        channelId: source.channelId,
        threadHeadId: source.threadHeadId,
        text: source.text,
        mentionKeys: source.mentionKeys,
        updatedAt: source.updatedAt,
        revision: const Uuid().v4(),
      );
      _persist([
        for (final draft in state)
          if (draft.key == key) source else draft,
      ]);
    }
    final revision = source.revision;
    return () async {
      final raw = prefs.getString(scopeKey);
      if (raw == null) return;
      final decoded = jsonDecode(raw);
      if (decoded is! List) return;
      final drafts = decoded
          .map(ComposeDraft.fromJson)
          .whereType<ComposeDraft>()
          .toList();
      final captured = drafts.where((draft) => draft.key == key).firstOrNull;
      if (captured?.revision != revision ||
          captured?.text != text ||
          !mapEquals(captured?.mentionKeys, mentionKeys)) {
        return;
      }
      final next = drafts.where((draft) => draft.key != key).toList();
      final write = prefs.setString(
        scopeKey,
        jsonEncode([for (final draft in next) draft.toJson()]),
      );
      if (ref.mounted && _prefsKey == scopeKey) state = List.unmodifiable(next);
      await write;
    };
  }

  String? textFor(String key) => draftFor(key)?.text;

  void _persist(List<ComposeDraft> drafts) {
    state = List.unmodifiable(drafts);
    final prefs = ref.read(savedPrefsProvider);
    prefs.setString(
      _prefsKey,
      jsonEncode([for (final d in drafts) d.toJson()]),
    );
  }
}

final composeDraftsProvider =
    NotifierProvider<ComposeDraftsNotifier, List<ComposeDraft>>(
      ComposeDraftsNotifier.new,
    );
