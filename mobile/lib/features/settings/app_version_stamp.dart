import '../../shared/utils/relative_time.dart';
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:intl/intl.dart';
import '../../shared/theme/theme.dart';

/// Source provenance from the build asset, never a date invented on launch.
class AppVersionStamp extends HookWidget {
  const AppVersionStamp({
    super.key,
    required this.version,
    this.buildNumber = '',
  });
  final String version;
  final String buildNumber;

  @override
  Widget build(BuildContext context) {
    final future = useMemoized(() async {
      try {
        return jsonDecode(
              await rootBundle.loadString('assets/app-version.json'),
            )
            as Map<String, dynamic>;
      } catch (_) {
        return <String, dynamic>{};
      }
    });
    final info = useFuture(future).data ?? <String, dynamic>{};
    final exact = useState(false);
    final now = useState(DateTime.now());
    useEffect(() {
      final timer = Timer.periodic(const Duration(minutes: 1), (_) {
        if (WidgetsBinding.instance.lifecycleState ==
            AppLifecycleState.resumed) {
          now.value = DateTime.now();
        }
      });
      return timer.cancel;
    }, const []);
    useOnAppLifecycleStateChange((previous, next) {
      if (next == AppLifecycleState.resumed) now.value = DateTime.now();
    });
    final raw = info['event'] == 'commit'
        ? info['commitTime']
        : info['buildTime'];
    final date = info['version'] == version && raw is String
        ? DateTime.tryParse(raw)?.toLocal()
        : null;
    var label = buildNumber.isEmpty ? 'v$version' : 'v$version ($buildNumber)';
    var detail = label;
    if (date != null) {
      final relative = relativeTimestamp(
        date.millisecondsSinceEpoch ~/ 1000,
        nowSeconds: now.value.millisecondsSinceEpoch ~/ 1000,
      );
      final commit = info['commit'] as String? ?? '';
      detail =
          '${DateFormat.yMMMMEEEEd().add_jms().format(date)} ${date.timeZoneName} · commit ${commit.isEmpty ? 'unavailable' : commit.substring(0, commit.length < 9 ? commit.length : 9)}${info['event'] == 'build' ? ' (build time)' : ''}';
      label += ' · ${exact.value ? detail : 'Updated $relative'}';
    }
    return Tooltip(
      message: detail,
      child: TextButton(
        onPressed: date == null ? null : () => exact.value = !exact.value,
        child: Text(
          label,
          style: context.textTheme.bodySmall?.copyWith(
            color: context.colors.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}
