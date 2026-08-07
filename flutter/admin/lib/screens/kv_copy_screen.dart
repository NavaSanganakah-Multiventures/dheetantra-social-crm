import 'package:flutter/material.dart';
import '../core/constants.dart';
import '../services/api_service.dart';
import '../widgets/admin_drawer.dart';

/// Copies all keys from one KV namespace to another.
///
/// The backend processes the copy in resumable batches (20 keys per request);
/// this screen loops with the returned cursor until `done` is true and shows
/// live progress.
class KvCopyScreen extends StatefulWidget {
  const KvCopyScreen({Key? key}) : super(key: key);

  @override
  State<KvCopyScreen> createState() => _KvCopyScreenState();
}

class _KvCopyScreenState extends State<KvCopyScreen> {
  final _sourceCtrl = TextEditingController();
  final _destCtrl = TextEditingController();

  bool _running = false;
  int _copied = 0;
  int _skipped = 0;
  int _failed = 0;
  String _status = '';
  List<String> _failedKeys = [];

  @override
  void dispose() {
    _sourceCtrl.dispose();
    _destCtrl.dispose();
    super.dispose();
  }

  Future<void> _startCopy() async {
    final source = _sourceCtrl.text.trim();
    final dest = _destCtrl.text.trim();
    if (source.isEmpty || dest.isEmpty) {
      _showSnack('Source aur destination namespace ID dono bharo');
      return;
    }
    if (source == dest) {
      _showSnack('Source aur destination same nahi ho sakte');
      return;
    }

    setState(() {
      _running = true;
      _copied = 0;
      _skipped = 0;
      _failed = 0;
      _status = 'Copying...';
      _failedKeys = [];
    });

    String? cursor;
    try {
      while (true) {
        final res = await ApiService.copyKv(
          sourceNamespaceId: source,
          destNamespaceId: dest,
          cursor: cursor,
        );

        final copied = (res['copied'] as num?)?.toInt() ?? 0;
        final skipped = (res['skipped'] as num?)?.toInt() ?? 0;
        final failed = (res['failed'] as num?)?.toInt() ?? 0;
        final failures = (res['failures'] as List?)?.cast<String>() ?? [];

        setState(() {
          _copied += copied;
          _skipped += skipped;
          _failed += failed;
          _failedKeys.addAll(failures);
          _status = 'Copied $_copied keys so far...';
        });

        if (res['done'] == true) break;
        cursor = res['cursor'] as String?;
        if (cursor == null || cursor.isEmpty) {
          throw Exception('Server ne done=false ke saath khali cursor bheja — copy adhoori hai');
        }
      }

      if (!mounted) return;
      setState(() => _status = 'Done');
      _showSnack('KV copy complete: $_copied copied, $_skipped skipped, $_failed failed');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _running = false;
        _status = 'Error';
      });
      _showSnack('KV copy failed: $e');
      return;
    }

    if (mounted) setState(() => _running = false);
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('KV Copy'),
      ),
      drawer: const AdminDrawer(currentRoute: '/kv-copy'),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppPadding.medium),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Card(
              child: Padding(
                padding: EdgeInsets.all(AppPadding.medium),
                child: Text(
                  'Ek KV namespace se doosre me saari keys copy karein. '
                  'Namespace IDs Cloudflare dashboard (Workers & Pages > KV) se milti hain.',
                  style: TextStyle(fontSize: 13),
                ),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _sourceCtrl,
              enabled: !_running,
              decoration: const InputDecoration(
                labelText: 'Source Namespace ID',
                hintText: 'e.g. 8f5f1c2b...',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.upload_outlined),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _destCtrl,
              enabled: !_running,
              decoration: const InputDecoration(
                labelText: 'Destination Namespace ID',
                hintText: 'e.g. 4a9d3e77...',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.download_outlined),
              ),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _running ? null : _startCopy,
              icon: _running
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.content_copy),
              label: Text(_running ? 'Copying...' : 'Start Copy'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
            const SizedBox(height: 24),
            if (_running || _copied > 0 || _failed > 0 || _skipped > 0) ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(AppPadding.medium),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Progress',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 12),
                      LinearProgressIndicator(
                        value: _running ? null : 1,
                        minHeight: 6,
                        borderRadius: BorderRadius.circular(3),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _Stat(
                              label: 'Copied',
                              value: '$_copied',
                              color: Colors.green,
                            ),
                          ),
                          Expanded(
                            child: _Stat(
                              label: 'Skipped',
                              value: '$_skipped',
                              color: Colors.orange,
                            ),
                          ),
                          Expanded(
                            child: _Stat(
                              label: 'Failed',
                              value: '$_failed',
                              color: _failed > 0 ? Colors.red : Colors.grey,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _status,
                        style: const TextStyle(
                          fontSize: 13,
                          color: Colors.black54,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            if (_failedKeys.isNotEmpty) ...[
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(AppPadding.medium),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Failed keys (${_failedKeys.length})',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final key in _failedKeys.take(20))
                            Chip(
                              label: Text(key, style: const TextStyle(fontSize: 12)),
                              backgroundColor: Colors.red.shade50,
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _Stat({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(fontSize: 12, color: Colors.black54)),
      ],
    );
  }
}
