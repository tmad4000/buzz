import 'dart:convert';

import '../channel.dart';

import 'package:shared_preferences/shared_preferences.dart';

String channelSectionsKey(String pubkey) => 'buzz.channel-sections.v1:$pubkey';

class ChannelSection {
  final String id;
  final String name;
  final String? icon;
  final int order;

  const ChannelSection({
    required this.id,
    required this.name,
    this.icon,
    required this.order,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    if (icon != null) 'icon': icon,
    'order': order,
  };

  factory ChannelSection.fromJson(Map<String, dynamic> json) => ChannelSection(
    id: json['id'] as String,
    name: json['name'] as String,
    icon: json['icon'] is String ? json['icon'] as String : null,
    order: json['order'] as int,
  );
}

class ChannelSectionStore {
  final int version;
  final List<ChannelSection> sections;
  final Map<String, String> assignments;
  final List<String> layoutOrder;

  const ChannelSectionStore({
    this.version = 1,
    this.sections = const [],
    this.assignments = const {},
    this.layoutOrder = const [],
  });

  Map<String, dynamic> toJson() => {
    'version': version,
    'sections': sections.map((s) => s.toJson()).toList(),
    'assignments': assignments,
    'layoutOrder': layoutOrder,
  };

  factory ChannelSectionStore.fromJson(Map<String, dynamic> json) {
    final rawSections = json['sections'];
    final sections = <ChannelSection>[];
    if (rawSections is List) {
      for (final entry in rawSections) {
        if (entry is Map<String, dynamic> &&
            entry['id'] is String &&
            entry['name'] is String &&
            entry['order'] is int) {
          sections.add(ChannelSection.fromJson(entry));
        }
      }
    }

    final rawAssignments = json['assignments'];
    final assignments = <String, String>{};
    if (rawAssignments is Map) {
      for (final entry in rawAssignments.entries) {
        if (entry.key is String && entry.value is String) {
          assignments[entry.key as String] = entry.value as String;
        }
      }
    }

    // Strip assignments referencing sections that don't exist.
    final sectionIds = {for (final s in sections) s.id};
    assignments.removeWhere((_, sectionId) => !sectionIds.contains(sectionId));

    return ChannelSectionStore(
      version: 1,
      sections: sections,
      assignments: assignments,
      layoutOrder: normalizeSectionOrder(json['layoutOrder'], sections),
    );
  }
}

class ChannelSectionsStorage {
  final SharedPreferences _prefs;

  ChannelSectionsStorage(this._prefs);

  ChannelSectionStore read(String pubkey) {
    final raw = _prefs.getString(channelSectionsKey(pubkey));
    if (raw == null || raw.isEmpty) {
      return const ChannelSectionStore();
    }

    try {
      final parsed = jsonDecode(raw);
      if (parsed is! Map<String, dynamic>) {
        return const ChannelSectionStore();
      }
      if (parsed['version'] != 1) {
        return const ChannelSectionStore();
      }
      return ChannelSectionStore.fromJson(parsed);
    } catch (_) {
      return const ChannelSectionStore();
    }
  }

  void write(String pubkey, ChannelSectionStore store) {
    _prefs.setString(channelSectionsKey(pubkey), jsonEncode(store.toJson()));
  }
}

/// Mobile is a reader of the desktop lane until it implements the complete
/// per-field writer/fencing contract. Keep this independent of the layout flag.
bool get channelSectionsEditable => false;

const desktopSectionsEnabled = bool.fromEnvironment(
  'BUZZ_DESKTOP_SECTIONS',
  defaultValue: false,
);

List<String> normalizeSectionOrder(Object? raw, List<ChannelSection> sections) {
  final sorted = [...sections]
    ..sort((a, b) {
      final order = a.order.compareTo(b.order);
      return order == 0 ? a.id.compareTo(b.id) : order;
    });
  final defaults = [
    'builtin:starred',
    ...sorted.map((s) => s.id),
    'builtin:channels',
    'builtin:forums',
    'builtin:dms',
  ];
  return {
    if (raw is List) ...raw.whereType<String>().where(defaults.contains),
    ...defaults,
  }.toList();
}

/// Mirrors desktop decodeDoc/projectSections. Metadata is authoritative; the
/// top-level compatibility projection is used only for meta-less legacy heads.
/// Unknown metadata explicitly flattens the list, rather than showing stale groups.
ChannelSectionStore readDesktopSections(Map<String, dynamic> json) {
  if (json['version'] != 1) return const ChannelSectionStore();
  if (!json.containsKey('meta')) return ChannelSectionStore.fromJson(json);
  final meta = json['meta'];
  if (meta is! Map || (meta['v'] != 1 && meta['v'] != 2)) {
    return const ChannelSectionStore();
  }
  Object? value(Object? reg) {
    if (reg is! List ||
        reg.length != 3 ||
        reg[0] is! int ||
        (reg[0] as int) < 0 ||
        (reg[0] as int) > 9007199254740991 ||
        reg[1] is! String ||
        !RegExp(r'^[0-9a-f]{16}$').hasMatch(reg[1] as String)) {
      return null;
    }
    return reg[2];
  }

  final sections = <ChannelSection>[];
  if (meta['s'] case final Map nodes) {
    for (final entry in nodes.entries) {
      final node = entry.value;
      if (entry.key is! String ||
          node is! Map ||
          value(node['live']) != true ||
          value(node['name']) is! String) {
        continue;
      }
      final icon = value(node['icon']);
      final order = value(node['order']);
      sections.add(
        ChannelSection(
          id: entry.key as String,
          name: value(node['name']) as String,
          icon: icon is String && icon.isNotEmpty ? icon : null,
          order: order is int && order.abs() <= 9007199254740991 ? order : 0,
        ),
      );
    }
  }
  sections.sort((a, b) {
    final rank = a.order.compareTo(b.order);
    return rank == 0 ? a.id.compareTo(b.id) : rank;
  });
  for (var i = 0; i < sections.length; i++) {
    final section = sections[i];
    sections[i] = ChannelSection(
      id: section.id,
      name: section.name,
      icon: section.icon,
      order: i,
    );
  }
  final live = sections.map((s) => s.id).toSet();
  final assignments = <String, String>{};
  if (meta['a'] case final Map nodes) {
    for (final entry in nodes.entries) {
      final target = value(entry.value);
      if (entry.key is String && target is String && live.contains(target)) {
        assignments[entry.key as String] = target;
      }
    }
  }
  final order = normalizeSectionOrder(null, sections);
  final ranks = <String, int>{};
  if (meta['o'] case final Map nodes) {
    for (final id in order) {
      final rank = value(nodes[id]);
      if (rank is int && rank.abs() <= 9007199254740991) ranks[id] = rank;
    }
  }
  final maxRank = ranks.values.fold<int>(-1, (a, b) => a > b ? a : b);
  final fallback = {
    for (final (index, id) in order.indexed) id: maxRank + 1 + index,
  };
  order.sort((a, b) {
    final rank = (ranks[a] ?? fallback[a]!).compareTo(ranks[b] ?? fallback[b]!);
    return rank == 0 ? fallback[a]!.compareTo(fallback[b]!) : rank;
  });
  return ChannelSectionStore(
    sections: sections,
    assignments: assignments,
    layoutOrder: order,
  );
}

/// A placement is independent of Starred shortcuts and never changes identity.
List<Channel> channelsInSidebarSection(
  Iterable<Channel> channels,
  ChannelSectionStore store,
  String sectionId,
) {
  final live = store.sections.map((s) => s.id).toSet();
  return channels.where((channel) {
    if (!channel.isMember || channel.isArchived) return false;
    final assigned = store.assignments[channel.id];
    if (live.contains(assigned)) return assigned == sectionId;
    return sectionId ==
        (channel.isDm
            ? 'builtin:dms'
            : channel.isForum
            ? 'builtin:forums'
            : 'builtin:channels');
  }).toList();
}
