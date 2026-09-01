import '../services/api_service.dart';

/// Convert an R2 relative path or a full URL into an absolute URL.
String? absoluteMediaUrl(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  if (raw.startsWith('/api/')) return '${ApiService.baseUrl}$raw';
  return raw;
}

/// Best-effort file name for a downloaded media file.
String fileNameForMessage(String messageId, String? messageType, String url) {
  final uri = Uri.tryParse(url);
  String name = uri != null && uri.pathSegments.isNotEmpty
      ? uri.pathSegments.last
      : '';
  if (name.isEmpty || !name.contains('.')) {
    final ext = extensionForType(messageType);
    name = '$messageId$ext';
  }
  // Sanitize
  return name.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');
}

/// Suggest a file extension for a WhatsApp media type.
String extensionForType(String? type) {
  switch (type) {
    case 'image':
      return '.jpg';
    case 'video':
      return '.mp4';
    case 'audio':
      return '.ogg';
    case 'document':
      return '.pdf';
    case 'sticker':
      return '.webp';
    default:
      return '.bin';
  }
}

String labelForType(String? type) {
  switch (type) {
    case 'image': return 'Photo';
    case 'video': return 'Video';
    case 'audio': return 'Audio';
    case 'document': return 'Document';
    case 'sticker': return 'Sticker';
    case 'location': return 'Location';
    case 'contacts': return 'Contacts';
    case 'interactive': return 'Interactive';
    case 'order': return 'Order';
    default: return type ?? 'File';
  }
}
