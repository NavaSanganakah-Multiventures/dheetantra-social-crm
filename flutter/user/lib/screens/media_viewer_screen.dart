import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_pdfview/flutter_pdfview.dart';
import 'package:path_provider/path_provider.dart';
import 'package:photo_view/photo_view.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../theme/app_theme.dart';
import '../utils/file_utils.dart';
import '../widgets/common.dart';

/// Full-screen media viewer: pinch-zoom images, in-app PDFs, and
/// open/download/share for audio/video/documents.
class MediaViewerScreen extends StatefulWidget {
  final Message message;

  const MediaViewerScreen({super.key, required this.message});

  @override
  State<MediaViewerScreen> createState() => _MediaViewerScreenState();
}

class _MediaViewerScreenState extends State<MediaViewerScreen> {
  String? _error;
  String? _localPath;
  bool _isDownloading = false;
  String? _url;
  late String _fileName;

  @override
  void initState() {
    super.initState();
    _url = absoluteMediaUrl(widget.message.mediaUrl);
    _fileName = fileNameForMessage(
      widget.message.id,
      widget.message.messageType,
      _url ?? widget.message.id,
    );
    if (_url != null && widget.message.messageType == 'document') {
      _prepareDocument();
    }
  }

  Future<void> _prepareDocument() async {
    if (_url == null) return;
    final ext = _fileName.split('.').last.toLowerCase();
    if (ext == 'pdf') await _ensureDownloaded();
  }

  Future<void> _ensureDownloaded() async {
    if (_url == null) return;
    if (_localPath != null) return;
    await _download();
  }

  Future<void> _download() async {
    if (_url == null) return;
    if (_isDownloading) return;
    setState(() {
      _isDownloading = true;
      _error = null;
    });
    try {
      final baseDir = await getApplicationDocumentsDirectory();
      final subDir = Directory(baseDir.path + '/downloads');
      await subDir.create(recursive: true);
      final path = subDir.path + '/' + _fileName;
      await Dio().download(_url!, path);
      if (mounted) {
        setState(() {
          _localPath = path;
          _isDownloading = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('ऐप में डाउनलोड हुआ')),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = _stringify(e);
          _isDownloading = false;
        });
      }
    }
  }

  Future<void> _share() async {
    if (_localPath != null) {
      await Share.shareXFiles([XFile(_localPath!)]);
    } else if (_url != null) {
      await Share.shareUri(Uri.parse(_url!));
    }
  }

  Future<void> _openExternally() async {
    if (_url == null) return;
    final uri = Uri.parse(_url!);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('फ़ाइल नहीं खुल सकी')),
      );
    }
  }

  Widget _buildImage() {
    if (_url == null) return const Center(child: Text('कोई मीडिया URL नहीं'));
    return PhotoView(
      imageProvider: NetworkImage(_url!),
      minScale: PhotoViewComputedScale.contained,
      maxScale: PhotoViewComputedScale.covered * 3,
      loadingBuilder: (context, progress) => const Center(
        child: CircularProgressIndicator(),
      ),
      errorBuilder: (context, error, stackTrace) => const Icon(
        Icons.broken_image,
        size: 64,
        color: AppColors.textMuted,
      ),
    );
  }

  Widget _buildPdf() {
    if (_url == null) return const Center(child: Text('कोई PDF URL नहीं'));
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'PDF लोड त्रुटि: ' + _error!,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textMuted),
          ),
        ),
      );
    }
    if (_localPath == null) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 12),
            Text('PDF लोड हो रही है...', style: TextStyle(color: AppColors.textMuted)),
          ],
        ),
      );
    }
    return PDFView(
      filePath: _localPath!,
      enableSwipe: true,
      swipeHorizontal: true,
      autoSpacing: true,
      pageFling: true,
      onError: (error) {
        if (mounted) setState(() => _error = _stringify(error));
      },
    );
  }

  Widget _buildGeneric() {
    final type = widget.message.messageType;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            _iconForType(type),
            size: 80,
            color: AppColors.accent,
          ),
          const SizedBox(height: 20),
          Text(
            labelForType(type),
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
          if (widget.message.text.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                widget.message.text,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textMuted, fontSize: 14),
              ),
            ),
          const SizedBox(height: 24),
          if (_isDownloading)
            const CircularProgressIndicator()
          else if (_localPath != null)
            Text(
              'इसमें सहेजा गया: ' + _localPath!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.success, fontSize: 12),
            ),
          const SizedBox(height: 24),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            alignment: WrapAlignment.center,
            children: [
              if (type != 'image' && type != 'sticker')
                FilledButton.icon(
                  onPressed: _openExternally,
                  icon: const Icon(Icons.open_in_new),
                  label: const Text('खोलें'),
                ),
              FilledButton.icon(
                onPressed: _download,
                icon: const Icon(Icons.download),
                label: const Text('डाउनलोड करें'),
              ),
              OutlinedButton.icon(
                onPressed: _share,
                icon: const Icon(Icons.share),
                label: const Text('शेयर करें'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  IconData _iconForType(String? type) {
    switch (type) {
      case 'video':
        return Icons.play_circle_fill;
      case 'audio':
        return Icons.mic;
      case 'document':
        return Icons.description;
      default:
        return Icons.insert_drive_file;
    }
  }

  @override
  Widget build(BuildContext context) {
    final type = widget.message.messageType;
    Widget body;
    if (type == 'image' || type == 'sticker') {
      body = _buildImage();
    } else if (type == 'document' && _fileName.split('.').last.toLowerCase() == 'pdf') {
      body = _buildPdf();
    } else {
      body = _buildGeneric();
    }

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: Text(labelForType(type)),
        actions: [
          if (type == 'image' || type == 'sticker')
            IconButton(
              icon: const Icon(Icons.download),
              onPressed: _download,
              tooltip: 'डाउनलोड करें',
            ),
          IconButton(
            icon: const Icon(Icons.share),
            onPressed: _share,
            tooltip: 'शेयर करें',
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: body,
    );
  }
}

String _stringify(dynamic value) {
  if (value == null) return '';
  return value.toString();
}
