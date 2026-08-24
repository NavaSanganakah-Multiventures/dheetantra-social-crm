import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../services/caller_id_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class AfterCallScreen extends StatefulWidget {
  final String phone;
  final String? direction;
  final int? durationSeconds;

  const AfterCallScreen({
    super.key,
    required this.phone,
    this.direction,
    this.durationSeconds,
  });

  @override
  State<AfterCallScreen> createState() => _AfterCallScreenState();
}

class _AfterCallScreenState extends State<AfterCallScreen> {
  String? _callId;
  bool _creating = true;
  String _error = '';
  Map<String, dynamic> _card = {};

  final TextEditingController _notesController = TextEditingController();
  String _selectedDisposition = '';
  File? _pickedRecording;
  bool _uploading = false;
  bool _summarizing = false;
  String? _summary;
  List<Map<String, dynamic>> _scannedRecordings = [];
  String? _selectedRecordingPath;
  bool _scanning = false;

  final List<String> _dispositions = [
    'Interested',
    'Follow-up required',
    'Not interested',
    'Wrong number',
    'Callback requested',
  ];

  @override
  void initState() {
    super.initState();
    _initCall();
  }

  Future<void> _initCall() async {
    final dir = widget.direction ?? 'incoming';
    final dur = widget.durationSeconds ?? 0;
    final created = await ApiService().createGsmCall(
      phone: widget.phone,
      direction: dir,
      duration: dur,
    );
    if (!mounted) return;
    if (created['error'] != null) {
      setState(() { _error = created['error'].toString(); _creating = false; });
      return;
    }
    _callId = created['callId']?.toString();
    final card = await ApiService().getCallerCard(widget.phone);
    if (mounted) {
      setState(() { _card = card; _creating = false; });
    }
    await _scanRecordings();
  }


  Future<void> _scanRecordings() async {
    setState(() => _scanning = true);
    final candidates = await CallerIdService.scanRecordings(widget.phone);
    if (!mounted) return;
    final valid = candidates.where((c) {
      final p = c['path']?.toString();
      return p != null && p.isNotEmpty && File(p).existsSync();
    }).toList();
    setState(() {
      _scannedRecordings = valid;
      if (valid.isNotEmpty && _selectedRecordingPath == null) {
        _selectedRecordingPath = valid.first['path']?.toString();
      }
      _scanning = false;
    });
  }

  Future<void> _pickRecording() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.audio,
      allowMultiple: false,
    );
    if (result == null || result.files.isEmpty) return;
    final path = result.files.first.path;
    if (path == null) return;
    setState(() => _pickedRecording = File(path));
  }

  Future<void> _uploadRecording() async {
    final callId = _callId;
    File? file = _pickedRecording;
    if (file == null && _selectedRecordingPath != null) {
      file = File(_selectedRecordingPath!);
    }
    if (callId == null || file == null) return;
    setState(() => _uploading = true);
    final res = await ApiService().uploadCallRecording(callId, file);
    if (!mounted) return;
    setState(() => _uploading = false);
    if (res['error'] != null) {
      _showSnack('Upload failed: ${res['error']}');
    } else {
      _showSnack('Recording uploaded');
    }
  }

  Future<void> _generateSummary() async {
    final callId = _callId;
    if (callId == null) return;
    setState(() => _summarizing = true);
    final res = await ApiService().summarizeCall(callId);
    if (!mounted) return;
    setState(() => _summarizing = false);
    if (res['error'] != null) {
      _showSnack('Summary failed: ${res['error']}');
    } else {
      final summary = res['summary']?.toString() ?? '';
      setState(() => _summary = summary);
      _notesController.text = summary;
    }
  }

  Future<void> _saveNotes() async {
    final callId = _callId;
    if (callId == null) return;
    final notes = _buildNotes();
    final res = await ApiService().dio.post(
      '/api/calls/$callId/status',
      data: {'notes': notes},
    );
    if (!mounted) return;
    if (res.data['success'] == true) {
      _showSnack('Call details saved');
      Navigator.pop(context);
    } else {
      _showSnack('Save failed');
    }
  }

  String _buildNotes() {
    final parts = <String>[];
    if (_selectedDisposition.isNotEmpty) parts.add('Disposition: $_selectedDisposition');
    if (_notesController.text.trim().isNotEmpty) parts.add(_notesController.text.trim());
    return parts.join('\n');
  }

  void _showSnack(String msg) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = _card['found'] == true ? (_card['name']?.toString() ?? widget.phone) : widget.phone;
    final duration = widget.durationSeconds ?? 0;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text('After-call CRM'),
      ),
      body: _creating
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _HeaderCard(
                    name: name,
                    phone: widget.phone,
                    duration: _fmtDuration(duration),
                    direction: widget.direction ?? 'incoming',
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'Recording',
                    style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (_pickedRecording == null)
                          Text(
                            'No recording selected',
                            style: TextStyle(color: AppColors.textMuted),
                          )
                        else
                          Text(
                            _pickedRecording!.path.split('/').last,
                            style: const TextStyle(color: AppColors.textPrimary),
                          ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _pickRecording,
                                icon: const Icon(Icons.folder_open),
                                label: const Text('Select recording'),
                              ),
                            ),
                            if (_pickedRecording != null) ...[
                              const SizedBox(width: 10),
                              Expanded(
                                child: ElevatedButton.icon(
                                  onPressed: _uploading ? null : _uploadRecording,
                                  icon: _uploading
                                      ? const SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: CircularProgressIndicator(strokeWidth: 2),
                                        )
                                      : const Icon(Icons.upload),
                                  label: const Text('Upload'),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (_scanning || _scannedRecordings.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'Auto-found recordings',
                                style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700),
                              ),
                              if (_scanning)
                                const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                            ],
                          ),
                          const SizedBox(height: 8),
                          ..._scannedRecordings.map((r) {
                            final path = r['path']?.toString() ?? '';
                            final dur = r['durationMs'] ?? 0;
                            final name = r['name']?.toString() ?? path.split('/').last;
                            final selected = _selectedRecordingPath == path;
                            return RadioListTile<String>(
                              value: path,
                              groupValue: _selectedRecordingPath,
                              onChanged: (v) => setState(() => _selectedRecordingPath = v),
                              title: Text(name, style: const TextStyle(color: AppColors.textPrimary, fontSize: 13)),
                              subtitle: Text('Duration: ${_fmtDuration((dur / 1000).round())}', style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
                              activeColor: AppColors.accent,
                              controlAffinity: ListTileControlAffinity.trailing,
                              contentPadding: EdgeInsets.zero,
                            );
                          }).toList(),
                          if (!_scanning && _scannedRecordings.isEmpty)
                            const Text('No recording found', style: TextStyle(color: AppColors.textMuted)),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),
                  Wrap(
                    spacing: 8,
                    children: _dispositions.map((d) {
                      final selected = _selectedDisposition == d;
                      return ChoiceChip(
                        label: Text(d),
                        selected: selected,
                        onSelected: (_) => setState(() => _selectedDisposition = d),
                        selectedColor: AppColors.accent.withValues(alpha: 0.2),
                        labelStyle: TextStyle(
                          color: selected ? AppColors.accent : AppColors.textPrimary,
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _notesController,
                    maxLines: 5,
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: AppColors.surface,
                      hintText: 'Call notes / follow-ups...',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: AppColors.border),
                      ),
                    ),
                    style: const TextStyle(color: AppColors.textPrimary),
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton.icon(
                    onPressed: _summarizing || _callId == null ? null : _generateSummary,
                    icon: _summarizing
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.auto_awesome),
                    label: const Text('Generate AI summary'),
                  ),
                  if (_summary != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Text(
                        _summary!,
                        style: const TextStyle(color: AppColors.textPrimary),
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _saveNotes,
                      child: const Text('Save call details'),
                    ),
                  ),
                  if (_error.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Text(
                        _error,
                        style: const TextStyle(color: AppColors.danger),
                      ),
                    ),
                ],
              ),
            ),
    );
  }

  String _fmtDuration(int seconds) {
    if (seconds <= 0) return '0s';
    final m = seconds ~/ 60;
    final s = seconds % 60;
    if (m == 0) return '${s}s';
    return '${m}m ${s.toString().padLeft(2, '0')}s';
  }
}

class _HeaderCard extends StatelessWidget {
  final String name;
  final String phone;
  final String duration;
  final String direction;

  const _HeaderCard({
    required this.name,
    required this.phone,
    required this.duration,
    required this.direction,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Avatar(name: name, size: 60),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(phone, style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      direction == 'outgoing' ? Icons.call_made : Icons.call_received,
                      color: AppColors.accent,
                      size: 16,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '$duration • $direction',
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
