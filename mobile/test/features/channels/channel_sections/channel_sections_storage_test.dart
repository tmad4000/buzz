import 'package:buzz/features/channels/channel_sections/channel_sections_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:buzz/features/channels/channel.dart';

void main() {
  for (final metaVersion in [1, 2]) {
    test(
      'desktop metadata $metaVersion is authoritative with ordered placement',
      () {
        List<Object> reg(Object value) => [42, '0123456789abcdef', value];
        final store = readDesktopSections({
          'version': 1,
          'sections': [
            {'id': 'stale', 'name': 'Wrong projection', 'order': 0},
          ],
          'meta': {
            'v': metaVersion,
            's': {
              'ops': {'name': reg('Ops'), 'live': reg(true), 'order': reg(0)},
              'deleted': {'name': reg('Deleted'), 'live': reg(false)},
            },
            'a': {
              'dm': reg('ops'),
              'channel': reg('ops'),
              'orphan': reg('deleted'),
            },
            'o': {'builtin:dms': reg(0), 'ops': reg(1)},
          },
        });
        expect(store.sections.single.name, 'Ops');
        expect(store.assignments, {'dm': 'ops', 'channel': 'ops'});
        expect(store.layoutOrder.take(2), ['builtin:dms', 'ops']);
      },
    );
  }
  test('unknown version or malformed metadata falls back flat', () {
    for (final meta in [
      null,
      {},
      {'v': 3},
      {'v': '2'},
    ]) {
      expect(
        readDesktopSections({
          'version': 1,
          'meta': meta,
          'sections': [
            {'id': 's', 'name': 'Ignore', 'order': 0},
          ],
        }).sections,
        isEmpty,
      );
    }
    expect(readDesktopSections({'version': 2}).sections, isEmpty);
  });
  test(
    'legacy layouts filter unknown IDs, duplicates and orphan assignments',
    () {
      final store = readDesktopSections({
        'version': 1,
        'sections': [
          {'id': 's', 'name': 'Section', 'order': 0},
        ],
        'assignments': {'dm': 's', 'orphan': 'gone'},
        'layoutOrder': ['builtin:dms', 's', 's', 'gone', 1],
      });
      expect(store.assignments, {'dm': 's'});
      expect(store.layoutOrder, [
        'builtin:dms',
        's',
        'builtin:starred',
        'builtin:channels',
        'builtin:forums',
      ]);
    },
  );
  test(
    'placements retain identity, filter access and return deleted groups to defaults',
    () {
      Channel channel(String id, String type, {bool member = true}) => Channel(
        id: id,
        name: id,
        channelType: type,
        visibility: 'private',
        description: '',
        createdBy: 'author',
        createdAt: DateTime(2025),
        memberCount: 2,
        isMember: member,
      );
      final dm = channel('dm', 'dm');
      final stream = channel('stream', 'stream');
      final forum = channel('forum', 'forum');
      final hidden = channel('hidden', 'dm', member: false);
      final channels = [dm, stream, forum, hidden];
      const store = ChannelSectionStore(
        sections: [ChannelSection(id: 'ops', name: 'Ops', order: 0)],
        assignments: {
          'dm': 'ops',
          'stream': 'ops',
          'hidden': 'ops',
          'forum': 'deleted',
        },
      );
      expect(channelsInSidebarSection(channels, store, 'ops'), [dm, stream]);
      expect(
        identical(channelsInSidebarSection(channels, store, 'ops').first, dm),
        isTrue,
      );
      expect(channelsInSidebarSection(channels, store, 'builtin:dms'), isEmpty);
      expect(channelsInSidebarSection(channels, store, 'builtin:forums'), [
        forum,
      ]);
      expect(
        channelsInSidebarSection(
          channels,
          const ChannelSectionStore(),
          'builtin:dms',
        ),
        [dm],
      );
    },
  );
  test(
    'equal layout ranks preserve defaults; sections rank by order then ID',
    () {
      List<Object> reg(Object value) => [42, '0123456789abcdef', value];
      final store = readDesktopSections({
        'version': 1,
        'meta': {
          'v': 2,
          's': {
            'z': {'name': reg('Z'), 'live': reg(true), 'order': reg(90)},
            'b': {'name': reg('B'), 'live': reg(true), 'order': reg(-5)},
            'a': {'name': reg('A'), 'live': reg(true), 'order': reg(-5)},
          },
          'o': {'builtin:dms': reg(0), 'z': reg(0), 'a': reg(0)},
        },
      });
      expect(store.sections.map((s) => s.id), ['a', 'b', 'z']);
      expect(store.sections.map((s) => s.order), [0, 1, 2]);
      expect(store.layoutOrder.take(3), ['a', 'z', 'builtin:dms']);
    },
  );
  group('ChannelSection icon', () {
    test('round-trips through fromJson and toJson', () {
      const original = ChannelSection(
        id: 'section-1',
        name: 'Friends',
        icon: ':party_parrot:',
        order: 0,
      );

      final roundTrip = ChannelSection.fromJson(original.toJson());

      expect(roundTrip.icon, ':party_parrot:');
      expect(roundTrip.toJson(), original.toJson());
    });

    test('missing icon remains absent', () {
      final section = ChannelSection.fromJson({
        'id': 'section-1',
        'name': 'Friends',
        'order': 0,
      });

      expect(section.icon, isNull);
      expect(section.toJson(), isNot(contains('icon')));
    });

    test('empty icon round-trips', () {
      final section = ChannelSection.fromJson({
        'id': 'section-1',
        'name': 'Friends',
        'icon': '',
        'order': 0,
      });

      expect(section.icon, isEmpty);
      expect(section.toJson()['icon'], '');
    });
  });
}
