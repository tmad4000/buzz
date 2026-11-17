import 'package:buzz/shared/relay/relay.dart';

/// These older test doubles exercise submit(), never durable publication.
/// Fail explicitly if the tested code unexpectedly enters the outbox API.
mixin SubmissionOnlyRelay {
  NostrEvent sign({
    required int kind,
    required String content,
    required List<List<String>> tags,
    int? createdAt,
  }) => throw UnsupportedError('Test double only supports submit');
  Future<NostrEvent> publish(NostrEvent event) =>
      throw UnsupportedError('Test double only supports submit');
}
