import 'dart:io';
import 'package:analyzer/dart/analysis/analysis_context_collection.dart';
import 'package:analyzer/dart/analysis/results.dart';

Future<void> main(List<String> args) async {
  final paths = args.map((p) => File(p).absolute.path).toList();
  final collection = AnalysisContextCollection(includedPaths: paths);
  var count = 0;
  for (final path in paths) {
    final result = await collection
        .contextFor(path)
        .currentSession
        .getResolvedUnit(path);
    if (result is! ResolvedUnitResult)
      throw StateError('Unresolved $path: $result');
    for (final error in result.errors) {
      stdout.writeln('$path: $error');
      count++;
    }
  }
  stdout.writeln('Resolved ${paths.length} files; $count diagnostics.');
  await collection.dispose();
  exitCode = count == 0 ? 0 : 1;
}
